import { getGemDeclarations } from './gemfile'
import { logError } from './log'
import { AsyncState, Dict, UpgradeLevel } from './types'
import type { ParsedConstraint } from './gemfile'
import { getConfig } from './config'

// ─── RubyGems API types ───────────────────────────────────────────────────────

interface RubyGemsGemInfo {
  version: string
  homepage_uri?: string
  changelog_uri?: string
}

interface RubyGemsVersionEntry {
  number: string
  platform: string
}

// ─── Cache types ─────────────────────────────────────────────────────────────

export interface GemLoader<T> {
  asyncstate: AsyncState
  startTime: number
  promise?: Promise<void>
  item?: T
}

export interface GemCacheItem {
  date: Date
  /** All ruby-platform versions, sorted descending */
  versions: string[]
  /** Latest stable version from /gems/{name}.json */
  latestVersion: string
  homepageUri?: string
  changelogUri?: string
}

export interface GemUpgradeInfo {
  /** Latest version within the current constraint (only for pessimistic constraints) */
  decorationVersion?: string
  upgradeLevel?: UpgradeLevel
  /** "~> X" — for pessimistic-2/3 when a newer major exists, or non-pessimistic */
  bumpMajor?: string
  /** "~> X.Y" — for pessimistic-3 when newer, or non-pessimistic */
  bumpMinor?: string
  /** "~> A.B" — for pessimistic-1: pin to latest minor within range */
  pinToLatestMinorInRange?: string
  /** "~> A.B.C" — for pessimistic-1 and pessimistic-2: pin to latest patch within range */
  pinToLatestPatchInRange?: string
  /** "~> X" — for non-pessimistic / no-version gems */
  pinToLatestMajor?: string
  /** "~> X.Y" — for non-pessimistic / no-version gems */
  pinToLatestMinor?: string
  /** "~> X.Y.Z" — for non-pessimistic / no-version gems */
  pinToLatestPatch?: string
  homepageUri?: string
  changelogUri?: string
  /** True if compound constraint intersection was empty */
  invalidConstraint?: boolean
}

// ─── Internal range type ──────────────────────────────────────────────────────

interface EffectiveRange {
  lower: string
  upper: string
  lowerInclusive: boolean
  upperInclusive: boolean
  /** Versions to exclude (from != operators) */
  excludeVersions: string[]
}

// ─── Cache ────────────────────────────────────────────────────────────────────

let gemCache: Dict<string, GemLoader<GemCacheItem>> = {}

export const cleanGemCache = () => {
  gemCache = {}
}

export const getCachedGemData = (gemName: string): GemLoader<GemCacheItem> | undefined => {
  return gemCache[gemName]
}

// ─── Version comparison ───────────────────────────────────────────────────────

/**
 * Compare two version strings segment-by-segment (supports 1–4+ segments).
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareVersions(a: string, b: string): number {
  const asegs = a.split('.').map(Number)
  const bsegs = b.split('.').map(Number)
  const maxlen = Math.max(asegs.length, bsegs.length)
  for (let i = 0; i < maxlen; i++) {
    const ai = asegs[i] ?? 0
    const bi = bsegs[i] ?? 0
    if (ai !== bi) {
      return ai - bi
    }
  }
  return 0
}

function maxVersion(versions: string[]): string | undefined {
  if (versions.length === 0) {
    return undefined
  }
  return versions.reduce((best, v) => (compareVersions(v, best) > 0 ? v : best), versions[0])
}

// ─── ~> constraint range ─────────────────────────────────────────────────────

/**
 * Convert a ~> version string to a [lower, upper) range.
 * e.g. "2"       → {lower: "2.0.0", upper: "3.0.0"}
 *      "2.1"     → {lower: "2.1.0", upper: "3.0.0"}
 *      "2.1.3"   → {lower: "2.1.3", upper: "2.2.0"}
 *      "2.1.3.4" → {lower: "2.1.3.4", upper: "2.1.4.0"}
 */
export function pessimisticRange(version: string): { lower: string; upper: string } {
  const segs = version.split('.')
  const n = segs.length

  if (n === 1) {
    return {
      lower: `${segs[0]}.0.0`,
      upper: `${Number(segs[0]) + 1}.0.0`,
    }
  } else if (n === 2) {
    return {
      lower: `${segs[0]}.${segs[1]}.0`,
      upper: `${Number(segs[0]) + 1}.0.0`,
    }
  } else {
    // 3+ segments: increment the second-to-last segment, zero the last
    const upperSegs = segs.slice(0, n - 2).concat([String(Number(segs[n - 2]) + 1), '0'])
    return {
      lower: version,
      upper: upperSegs.join('.'),
    }
  }
}

// ─── Effective range computation ──────────────────────────────────────────────

/**
 * Compute the effective version range for a parsed constraint.
 * Returns null if:
 * - constraint is null or non-pessimistic (no range applies)
 * - the intersection of all operators results in an empty range
 */
export function getEffectiveRange(constraint: ParsedConstraint | null): EffectiveRange | null {
  if (constraint === null || constraint.constraintType === 'non-pessimistic') {
    return null
  }

  const pessVersion = constraint.pessimisticVersion
  if (pessVersion === undefined) {
    return null
  }

  const { lower: pessLower, upper: pessUpper } = pessimisticRange(pessVersion)
  let lower = pessLower
  let upper = pessUpper
  let lowerInclusive = true
  let upperInclusive = false
  const excludeVersions: string[] = []

  // Apply additional operators to intersect
  for (const { op, version } of constraint.additionalOps) {
    switch (op) {
      case '>=':
        if (compareVersions(version, lower) > 0) {
          lower = version
          lowerInclusive = true
        }
        break
      case '>':
        if (compareVersions(version, lower) >= 0) {
          lower = version
          lowerInclusive = false
        }
        break
      case '<':
        if (compareVersions(version, upper) < 0) {
          upper = version
          upperInclusive = false
        }
        break
      case '<=':
        if (compareVersions(version, upper) <= 0) {
          upper = version
          upperInclusive = true
        }
        break
      case '=':
        // Range collapses to a single version
        lower = version
        upper = version
        lowerInclusive = true
        upperInclusive = true
        break
      case '!=':
        excludeVersions.push(version)
        break
    }
  }

  // Check for empty intersection
  const cmp = compareVersions(lower, upper)
  if (cmp > 0 || (cmp === 0 && (!lowerInclusive || !upperInclusive))) {
    return null // empty range
  }

  return { lower, upper, lowerInclusive, upperInclusive, excludeVersions }
}

function versionInRange(version: string, range: EffectiveRange): boolean {
  if (range.excludeVersions.includes(version)) {
    return false
  }
  const cmpLower = compareVersions(version, range.lower)
  const cmpUpper = compareVersions(version, range.upper)
  const aboveLower = range.lowerInclusive ? cmpLower >= 0 : cmpLower > 0
  const belowUpper = range.upperInclusive ? cmpUpper <= 0 : cmpUpper < 0
  return aboveLower && belowUpper
}

function filterVersionsInRange(versions: string[], range: EffectiveRange): string[] {
  return versions.filter((v) => versionInRange(v, range))
}

// ─── Upgrade level ────────────────────────────────────────────────────────────

/**
 * Determine color level by comparing first-differing segment between two versions.
 */
export function getUpgradeLevel(lower: string, decorationVersion: string): UpgradeLevel {
  const lsegs = lower.split('.').map(Number)
  const dsegs = decorationVersion.split('.').map(Number)
  if ((dsegs[0] ?? 0) !== (lsegs[0] ?? 0)) {
    return 'major'
  }
  if ((dsegs[1] ?? 0) !== (lsegs[1] ?? 0)) {
    return 'minor'
  }
  return 'patch'
}

// ─── Quick-action version pin helpers ────────────────────────────────────────

function makeMajorPin(version: string): string {
  const major = version.split('.')[0] ?? '0'
  return `~> ${major}`
}

function makeMinorPin(version: string): string {
  const segs = version.split('.')
  return `~> ${segs[0] ?? '0'}.${segs[1] ?? '0'}`
}

function makePatchPin(version: string): string {
  const segs = version.split('.')
  return `~> ${segs[0] ?? '0'}.${segs[1] ?? '0'}.${segs[2] ?? '0'}`
}

// ─── Main upgrade info ────────────────────────────────────────────────────────

/**
 * Compute all decoration and quick-action data for a gem, given its cached API
 * data and its parsed constraint.
 */
export function getGemUpgradeInfo(
  cacheItem: GemCacheItem,
  constraint: ParsedConstraint | null,
): GemUpgradeInfo {
  const { versions, latestVersion, homepageUri, changelogUri } = cacheItem

  const info: GemUpgradeInfo = { homepageUri, changelogUri }

  // ── Non-pessimistic (no version, >=, =, etc.) ──────────────────────────────
  if (constraint === null || constraint.constraintType === 'non-pessimistic') {
    const latestMajorNum = Number(latestVersion.split('.')[0] ?? '0')
    const latestMajor = makeMajorPin(latestVersion)
    const latestMinor = makeMinorPin(latestVersion)
    const latestPatch = makePatchPin(latestVersion)
    if (latestMajorNum !== 0) {
      info.pinToLatestMajor = latestMajor
    }
    info.pinToLatestMinor = latestMinor !== latestMajor ? latestMinor : undefined
    info.pinToLatestPatch = latestPatch !== latestMinor ? latestPatch : undefined
    return info
  }

  // ── Pessimistic constraints ────────────────────────────────────────────────
  const range = getEffectiveRange(constraint)
  if (range === null) {
    info.invalidConstraint = true
    return info
  }

  const inRange = filterVersionsInRange(versions, range)
  const latestInRange = maxVersion(inRange)

  // Decoration version: only show if newer than the effective lower bound
  if (latestInRange !== undefined && compareVersions(latestInRange, range.lower) > 0) {
    info.decorationVersion = latestInRange
    info.upgradeLevel = getUpgradeLevel(range.lower, latestInRange)
  }

  const pessVersion = constraint.pessimisticVersion!
  const pessSegs = pessVersion.split('.')
  const pessSegCount = pessSegs.length

  const latestMajorNum = Number(latestVersion.split('.')[0] ?? '0')
  const currentMajorNum = Number(pessSegs[0] ?? '0')
  const currentMinorNum = Number(pessSegs[1] ?? '0')

  const latestVersionSegs = latestVersion.split('.')
  const latestMinorNum = Number(latestVersionSegs[1] ?? '0')
  const latestMajorNumFromLatest = Number(latestVersionSegs[0] ?? '0')

  if (pessSegCount === 1) {
    // ~> A: offer "Pin to latest minor" and "Pin to latest patch" within range
    if (latestInRange !== undefined) {
      const minorPin = makeMinorPin(latestInRange)
      const patchPin = makePatchPin(latestInRange)
      // Only offer if actually different from current constraint
      if (minorPin !== `~> ${pessVersion}`) {
        info.pinToLatestMinorInRange = minorPin
      }
      if (patchPin !== minorPin) {
        info.pinToLatestPatchInRange = patchPin
      }
    }
  } else if (pessSegCount === 2) {
    // ~> A.B: offer "Bump major" (if newer major) and "Pin to latest patch"
    if (latestMajorNum > currentMajorNum && latestMajorNum !== 0) {
      info.bumpMajor = makeMajorPin(latestVersion)
    }
    if (latestInRange !== undefined) {
      const patchPin = makePatchPin(latestInRange)
      if (patchPin !== `~> ${pessVersion}.0` && patchPin !== `~> ${pessVersion}`) {
        info.pinToLatestPatchInRange = patchPin
      }
    }
  } else {
    // ~> A.B.C (3+ segments): offer "Bump major" and "Bump minor"
    if (latestMajorNum > currentMajorNum && latestMajorNum !== 0) {
      info.bumpMajor = makeMajorPin(latestVersion)
    }
    if (
      latestMajorNumFromLatest > currentMajorNum ||
      (latestMajorNumFromLatest === currentMajorNum && latestMinorNum > currentMinorNum)
    ) {
      const minorPin = makeMinorPin(latestVersion)
      if (minorPin !== `~> ${pessSegs[0]}.${pessSegs[1]}`) {
        info.bumpMinor = minorPin
      }
    }
  }

  return info
}

// ─── Fetching ─────────────────────────────────────────────────────────────────

const fetchGemData = (gemName: string): Promise<void> => {
  const existing = gemCache[gemName]
  if (
    existing !== undefined &&
    (existing.asyncstate === AsyncState.InProgress || existing.asyncstate === AsyncState.Rejected)
  ) {
    return existing.promise ?? Promise.resolve()
  }

  const startTime = new Date().getTime()

  const promise: Promise<void> = Promise.all([
    fetch(`https://rubygems.org/api/v1/gems/${encodeURIComponent(gemName)}.json`),
    fetch(`https://rubygems.org/api/v1/versions/${encodeURIComponent(gemName)}.json`),
  ])
    .then(async ([gemInfoResp, versionsResp]) => {
      if (!gemInfoResp.ok) {
        throw new Error(`RubyGems API returned ${gemInfoResp.status} for ${gemName}`)
      }
      if (!versionsResp.ok) {
        throw new Error(`RubyGems versions API returned ${versionsResp.status} for ${gemName}`)
      }

      const [gemInfo, allVersions] = await Promise.all([
        gemInfoResp.json() as Promise<RubyGemsGemInfo>,
        versionsResp.json() as Promise<RubyGemsVersionEntry[]>,
      ])

      const rubyVersions = allVersions
        .filter((v) => v.platform === 'ruby')
        .map((v) => v.number)
        .sort((a, b) => compareVersions(b, a))

      gemCache[gemName] = {
        asyncstate: AsyncState.Fulfilled,
        startTime,
        item: {
          date: new Date(),
          versions: rubyVersions,
          latestVersion: gemInfo.version,
          homepageUri: gemInfo.homepage_uri,
          changelogUri: gemInfo.changelog_uri,
        },
      }
    })
    .catch((e: unknown) => {
      logError(`failed to load gem ${gemName}`, e)
      gemCache[gemName] = {
        asyncstate: AsyncState.Rejected,
        startTime,
      }
    })

  gemCache[gemName] = {
    asyncstate: AsyncState.InProgress,
    startTime,
    promise,
  }

  return promise
}

/**
 * Kick off fetches for all gems in a Gemfile text that are not already cached
 * or whose cache is stale. Returns an array of in-flight promises.
 */
export function refreshGemfileData(fileText: string): Promise<void>[] {
  const cacheCutoff = new Date(new Date().getTime() - 1000 * 60 * 120) // 120 minutes
  const ignored = getConfig().ignoreGems

  const gems = getGemDeclarations(fileText)
  const uniqueNames = [...new Set(gems.map((g) => g.gemName))]

  return uniqueNames
    .filter((name) => !ignored.includes(name))
    .map((name) => {
      const cache = gemCache[name]
      if (
        cache === undefined ||
        cache.asyncstate === AsyncState.NotStarted ||
        (cache.item !== undefined && cache.item.date.getTime() < cacheCutoff.getTime())
      ) {
        return fetchGemData(name)
      } else {
        return cache.promise
      }
    })
    .filter((p): p is Promise<void> => p !== undefined)
}
