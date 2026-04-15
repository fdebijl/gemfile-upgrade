/**
 * Strip platform suffix from a Gemfile.lock version string.
 * e.g. "1.19.2-x86_64-linux-gnu" → "1.19.2"
 *
 * In Gemfile.lock, platform identifiers are appended with a hyphen and always
 * start with a letter (e.g. "x86_64-linux", "arm64-darwin", "java"). RubyGems
 * version strings never contain hyphens, so the first hyphen is always a
 * platform separator.
 */
function stripPlatform(version: string): string {
  const hyphen = version.indexOf('-')
  return hyphen >= 0 ? version.substring(0, hyphen) : version
}

/**
 * Parse a Gemfile.lock text and return a map of gem name → resolved version.
 *
 * Gemfile.lock has one or more sections (GEM, PATH, GIT) each containing a
 * `specs:` block. Within a specs block, resolved gems are indented 4 spaces:
 *
 *     rails (8.1.3)
 *
 * Their transitive dependency constraints are indented 6 spaces and skipped:
 *
 *       activesupport (= 8.1.3)
 *
 * The 4-space vs 6-space distinction is enforced implicitly: after consuming
 * the leading 4 spaces, `[a-zA-Z0-9_\-.]` fails on the extra space that a
 * 6-space-indented line presents at that position.
 *
 * Platform-specific entries (e.g. "nokogiri (1.19.2-x86_64-linux-gnu)") are
 * normalised by stripping the platform suffix — all platform variants of the
 * same gem share the same base version, so last-write-wins is harmless.
 *
 * Blank lines mark section boundaries and reset the parser state.
 */
export function parseLockfile(text: string): Map<string, string> {
  const versions = new Map<string, string>()
  let inSpecs = false

  for (const line of text.split('\n')) {
    if (line.trimEnd() === '') {
      inSpecs = false
      continue
    }

    if (line === '  specs:') {
      inSpecs = true
      continue
    }

    if (!inSpecs) {
      continue
    }

    // 4-space indent = resolved gem entry (6-space dependency lines won't match
    // because the character at position 4 is a space, which the name class rejects)
    const match = /^    ([a-zA-Z0-9_\-.]+) \(([^)]+)\)/.exec(line)
    if (match) {
      versions.set(match[1], stripPlatform(match[2]))
    }
  }

  return versions
}
