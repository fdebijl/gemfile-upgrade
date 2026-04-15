import { before, describe, test } from 'node:test'
import * as assert from 'assert'

import { Config, setConfig } from '../config'
import {
  compareVersions,
  GemCacheItem,
  getEffectiveRange,
  getGemUpgradeInfo,
  getUpgradeLevel,
  pessimisticRange,
} from '../rubygems'
import type { ParsedConstraint } from '../gemfile'
import { ConstraintType } from '../types'

// Minimal config setup for tests that call getConfig()
const testConfig: Config = {
  showUpdatesAtStart: true,
  showOverviewRulerColor: true,
  majorUpgradeColorOverwrite: '',
  minorUpgradeColorOverwrite: '',
  patchUpgradeColorOverwrite: '',
  decorationString: '\t-> %s',
  ignoreGems: [],
  msUntilRowLoading: 10000,
  openChangelogInEditor: true,
}

function makePessimisticConstraint(
  version: string,
  type: ConstraintType = 'pessimistic-2',
): ParsedConstraint {
  return {
    pessimisticVersion: version,
    additionalOps: [],
    constraintType: type,
    rawStart: 0,
    rawEnd: 0,
  }
}

function makeCompoundConstraint(
  pessVersion: string,
  ops: Array<{ op: string; version: string }>,
): ParsedConstraint {
  return {
    pessimisticVersion: pessVersion,
    additionalOps: ops,
    constraintType: 'compound',
    rawStart: 0,
    rawEnd: 0,
  }
}

function makeCacheItem(versions: string[], latestVersion: string): GemCacheItem {
  return {
    date: new Date(),
    versions: [...versions].sort((a, b) => compareVersions(b, a)),
    latestVersion,
    homepageUri: 'https://example.com',
    changelogUri: 'https://example.com/changelog',
  }
}

describe('pessimisticRange', () => {
  test('1 segment', () => {
    assert.deepStrictEqual(pessimisticRange('2'), { lower: '2.0.0', upper: '3.0.0' })
  })

  test('2 segments', () => {
    assert.deepStrictEqual(pessimisticRange('2.1'), { lower: '2.1.0', upper: '3.0.0' })
  })

  test('3 segments', () => {
    assert.deepStrictEqual(pessimisticRange('2.1.3'), { lower: '2.1.3', upper: '2.2.0' })
  })

  test('4 segments', () => {
    assert.deepStrictEqual(pessimisticRange('2.1.3.4'), { lower: '2.1.3.4', upper: '2.1.4.0' })
  })
})

describe('compareVersions', () => {
  test('equal versions', () => {
    assert.strictEqual(compareVersions('1.0.0', '1.0.0'), 0)
  })

  test('major difference', () => {
    assert.ok(compareVersions('2.0.0', '1.0.0') > 0)
    assert.ok(compareVersions('1.0.0', '2.0.0') < 0)
  })

  test('minor difference', () => {
    assert.ok(compareVersions('1.2.0', '1.1.0') > 0)
  })

  test('patch difference', () => {
    assert.ok(compareVersions('1.0.1', '1.0.0') > 0)
  })

  test('different number of segments', () => {
    assert.ok(compareVersions('2.0.0', '2') === 0)
    assert.ok(compareVersions('2.0.1', '2.0') > 0)
  })

  test('4-segment comparison', () => {
    assert.ok(compareVersions('3.25.3.1', '3.25.3.0') > 0)
    assert.strictEqual(compareVersions('3.25.3.0', '3.25.3.0'), 0)
  })
})

describe('getEffectiveRange', () => {
  test('null constraint returns null', () => {
    assert.strictEqual(getEffectiveRange(null), null)
  })

  test('non-pessimistic constraint returns null', () => {
    const c: ParsedConstraint = {
      pessimisticVersion: undefined,
      additionalOps: [{ op: '>=', version: '5.0' }],
      constraintType: 'non-pessimistic',
      rawStart: 0,
      rawEnd: 0,
    }
    assert.strictEqual(getEffectiveRange(c), null)
  })

  test('pessimistic-2 range', () => {
    const c = makePessimisticConstraint('7.0', 'pessimistic-2')
    const range = getEffectiveRange(c)
    assert.ok(range)
    assert.strictEqual(range.lower, '7.0.0')
    assert.strictEqual(range.upper, '8.0.0')
    assert.strictEqual(range.lowerInclusive, true)
    assert.strictEqual(range.upperInclusive, false)
  })

  test('compound constraint intersects >= lower bound', () => {
    const c = makeCompoundConstraint('7.0', [{ op: '>=', version: '7.0.4' }])
    const range = getEffectiveRange(c)
    assert.ok(range)
    assert.strictEqual(range.lower, '7.0.4')
    assert.strictEqual(range.upper, '8.0.0')
  })

  test('compound constraint with empty intersection returns null', () => {
    // ~> 2.0 is [2.0.0, 3.0.0), but >= 5.0 has lower=5.0 > upper=3.0
    const c = makeCompoundConstraint('2.0', [{ op: '>=', version: '5.0' }])
    const range = getEffectiveRange(c)
    assert.strictEqual(range, null)
  })

  test('compound constraint with = collapses to point', () => {
    const c = makeCompoundConstraint('7.0', [{ op: '=', version: '7.0.5' }])
    const range = getEffectiveRange(c)
    assert.ok(range)
    assert.strictEqual(range.lower, '7.0.5')
    assert.strictEqual(range.upper, '7.0.5')
    assert.strictEqual(range.lowerInclusive, true)
    assert.strictEqual(range.upperInclusive, true)
  })

  test('!= operator adds to excludeVersions', () => {
    const c = makeCompoundConstraint('7.0', [{ op: '!=', version: '7.0.3' }])
    const range = getEffectiveRange(c)
    assert.ok(range)
    assert.deepStrictEqual(range.excludeVersions, ['7.0.3'])
  })
})

describe('getUpgradeLevel', () => {
  test('major difference', () => {
    assert.strictEqual(getUpgradeLevel('1.0.0', '2.0.0'), 'major')
  })

  test('minor difference', () => {
    assert.strictEqual(getUpgradeLevel('2.1.0', '2.3.0'), 'minor')
  })

  test('patch difference', () => {
    assert.strictEqual(getUpgradeLevel('2.1.3', '2.1.9'), 'patch')
  })

  test('lower bound with fewer segments', () => {
    assert.strictEqual(getUpgradeLevel('7.0.0', '7.1.2'), 'minor')
  })
})

describe('getGemUpgradeInfo', () => {
  before(() => {
    setConfig(testConfig)
  })

  test('non-pessimistic constraint offers pin actions', () => {
    const cache = makeCacheItem(['7.1.2', '7.0.0', '6.0.0'], '7.1.2')
    const c: ParsedConstraint = {
      pessimisticVersion: undefined,
      additionalOps: [{ op: '>=', version: '5.0' }],
      constraintType: 'non-pessimistic',
      rawStart: 0,
      rawEnd: 0,
    }
    const info = getGemUpgradeInfo(cache, c)
    assert.strictEqual(info.decorationVersion, undefined)
    assert.strictEqual(info.pinToLatestMajor, '~> 7')
    assert.strictEqual(info.pinToLatestMinor, '~> 7.1')
    assert.strictEqual(info.pinToLatestPatch, '~> 7.1.2')
  })

  test('null constraint (no version) offers pin actions', () => {
    const cache = makeCacheItem(['7.1.2', '7.0.0'], '7.1.2')
    const info = getGemUpgradeInfo(cache, null)
    assert.strictEqual(info.pinToLatestMajor, '~> 7')
    assert.strictEqual(info.pinToLatestMinor, '~> 7.1')
    assert.strictEqual(info.pinToLatestPatch, '~> 7.1.2')
    assert.strictEqual(info.decorationVersion, undefined)
  })

  test('pessimistic-2 shows decoration version within range', () => {
    const cache = makeCacheItem(['7.1.2', '7.0.5', '7.0.0', '6.0.0'], '7.1.2')
    const c = makePessimisticConstraint('7.0', 'pessimistic-2')
    const info = getGemUpgradeInfo(cache, c)
    assert.strictEqual(info.decorationVersion, '7.1.2')
    assert.strictEqual(info.upgradeLevel, 'minor')
  })

  test('pessimistic-2 no decoration when already at latest within range', () => {
    const cache = makeCacheItem(['7.0.0'], '7.0.0')
    const c = makePessimisticConstraint('7.0', 'pessimistic-2')
    const info = getGemUpgradeInfo(cache, c)
    assert.strictEqual(info.decorationVersion, undefined)
  })

  test('pessimistic-2 offers bump-major when newer major exists', () => {
    const cache = makeCacheItem(['8.0.0', '7.1.2', '7.0.0'], '8.0.0')
    const c = makePessimisticConstraint('7.0', 'pessimistic-2')
    const info = getGemUpgradeInfo(cache, c)
    assert.strictEqual(info.bumpMajor, '~> 8')
  })

  test('pessimistic-2 no bump-major when already at latest major', () => {
    const cache = makeCacheItem(['7.1.2', '7.0.0'], '7.1.2')
    const c = makePessimisticConstraint('7.0', 'pessimistic-2')
    const info = getGemUpgradeInfo(cache, c)
    assert.strictEqual(info.bumpMajor, undefined)
  })

  test('pessimistic-2 offers pin-to-latest-patch within range', () => {
    const cache = makeCacheItem(['7.1.2', '7.0.5', '7.0.0', '6.0.0'], '7.1.2')
    const c = makePessimisticConstraint('7.0', 'pessimistic-2')
    const info = getGemUpgradeInfo(cache, c)
    assert.strictEqual(info.pinToLatestPatchInRange, '~> 7.1.2')
  })

  test('pessimistic-3 shows patch-level decoration', () => {
    const cache = makeCacheItem(['7.0.9', '7.0.5', '7.0.0', '7.1.0'], '7.1.0')
    const c = makePessimisticConstraint('7.0.3', 'pessimistic-3')
    const info = getGemUpgradeInfo(cache, c)
    // ~> 7.0.3 allows [7.0.3, 7.1.0), so 7.0.9 is the latest within range
    assert.strictEqual(info.decorationVersion, '7.0.9')
    assert.strictEqual(info.upgradeLevel, 'patch')
  })

  test('pessimistic-3 offers bump-minor', () => {
    const cache = makeCacheItem(['7.1.2', '7.0.9', '7.0.0'], '7.1.2')
    const c = makePessimisticConstraint('7.0.3', 'pessimistic-3')
    const info = getGemUpgradeInfo(cache, c)
    assert.strictEqual(info.bumpMinor, '~> 7.1')
  })

  test('pessimistic-1 offers pin-to-latest-minor-in-range', () => {
    const cache = makeCacheItem(['2.9.5', '2.3.0', '2.1.0', '1.0.0'], '2.9.5')
    const c = makePessimisticConstraint('2', 'pessimistic-1')
    const info = getGemUpgradeInfo(cache, c)
    assert.strictEqual(info.decorationVersion, '2.9.5')
    assert.strictEqual(info.pinToLatestMinorInRange, '~> 2.9')
    assert.strictEqual(info.pinToLatestPatchInRange, '~> 2.9.5')
  })

  test('compound constraint intersects range', () => {
    const cache = makeCacheItem(['7.1.2', '7.0.8', '7.0.4', '7.0.2', '7.0.0', '6.0.0'], '7.1.2')
    const c = makeCompoundConstraint('7.0', [{ op: '>=', version: '7.0.4' }])
    const info = getGemUpgradeInfo(cache, c)
    // Range: [7.0.4, 8.0.0), so 7.1.2 is within range
    assert.strictEqual(info.decorationVersion, '7.1.2')
    // 7.0.2 should be excluded (below 7.0.4 lower bound)
  })

  test('compound constraint with empty intersection marks as invalid', () => {
    const cache = makeCacheItem(['5.0.0', '4.0.0'], '5.0.0')
    const c = makeCompoundConstraint('2.0', [{ op: '>=', version: '5.0' }])
    const info = getGemUpgradeInfo(cache, c)
    assert.strictEqual(info.invalidConstraint, true)
    assert.strictEqual(info.decorationVersion, undefined)
  })

  test('homepage and changelog are propagated', () => {
    const cache = makeCacheItem(['7.1.2'], '7.1.2')
    cache.homepageUri = 'https://rubyonrails.org'
    cache.changelogUri = 'https://github.com/rails/rails/releases'
    const info = getGemUpgradeInfo(cache, null)
    assert.strictEqual(info.homepageUri, 'https://rubyonrails.org')
    assert.strictEqual(info.changelogUri, 'https://github.com/rails/rails/releases')
  })
})
