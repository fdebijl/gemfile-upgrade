import { describe, test } from 'node:test'
import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'

import { parseLockfile } from '../lockfile'

// Load the sample lockfile shipped with the repo
const SAMPLE_LOCKFILE = fs.readFileSync(
  path.join(__dirname, '../../sample/Gemfile.lock'),
  'utf8',
)

describe('parseLockfile', () => {
  // ── Sample lockfile ──────────────────────────────────────────────────────

  test('parses resolved version for a simple gem', () => {
    const versions = parseLockfile(SAMPLE_LOCKFILE)
    assert.strictEqual(versions.get('rails'), '8.1.3')
  })

  test('parses all direct dependency gems', () => {
    const versions = parseLockfile(SAMPLE_LOCKFILE)
    assert.strictEqual(versions.get('puma'), '8.0.0')
    assert.strictEqual(versions.get('sidekiq'), '8.1.2')
    assert.strictEqual(versions.get('pg'), '1.6.3')
    assert.strictEqual(versions.get('pundit'), '2.5.2')
    assert.strictEqual(versions.get('ransack'), '4.4.1')
    assert.strictEqual(versions.get('redis'), '5.4.1')
  })

  test('strips platform suffix from versioned entries', () => {
    // nokogiri only appears with platform suffixes in this lockfile
    const versions = parseLockfile(SAMPLE_LOCKFILE)
    assert.strictEqual(versions.get('nokogiri'), '1.19.2')
  })

  test('strips platform suffix when bare entry also exists', () => {
    // pg appears as both bare (1.6.3) and with platform suffixes (1.6.3-x86_64-linux etc.)
    const versions = parseLockfile(SAMPLE_LOCKFILE)
    assert.strictEqual(versions.get('pg'), '1.6.3')
  })

  test('does not capture transitive dependency constraint lines', () => {
    // activesupport (= 8.1.3) appears as a 6-space dep line under many gems
    // but also as a 4-space resolved entry — the resolved version should win
    const versions = parseLockfile(SAMPLE_LOCKFILE)
    assert.strictEqual(versions.get('activesupport'), '8.1.3')
  })

  test('parses transitive gems that are not direct dependencies', () => {
    const versions = parseLockfile(SAMPLE_LOCKFILE)
    assert.strictEqual(versions.get('rack'), '3.2.6')
    assert.strictEqual(versions.get('zeitwerk'), '2.7.5')
    assert.strictEqual(versions.get('tzinfo'), '2.0.6')
  })

  test('returns undefined for a gem not in the lockfile', () => {
    const versions = parseLockfile(SAMPLE_LOCKFILE)
    assert.strictEqual(versions.get('nonexistent-gem'), undefined)
  })

  // ── Inline fixtures ──────────────────────────────────────────────────────

  test('parses a minimal GEM section', () => {
    const text = [
      'GEM',
      '  remote: https://rubygems.org/',
      '  specs:',
      '    rake (13.2.1)',
      '    rails (7.0.8)',
      '      actionpack (= 7.0.8)',
      '',
      'BUNDLED WITH',
      '   2.5.0',
    ].join('\n')
    const versions = parseLockfile(text)
    assert.strictEqual(versions.get('rake'), '13.2.1')
    assert.strictEqual(versions.get('rails'), '7.0.8')
    // Dependency constraint line must not be captured
    assert.strictEqual(versions.get('actionpack'), undefined)
  })

  test('parses multiple sections (GEM + PATH)', () => {
    const text = [
      'GEM',
      '  remote: https://rubygems.org/',
      '  specs:',
      '    rails (7.0.8)',
      '',
      'PATH',
      '  remote: engines/accounts',
      '  specs:',
      '    accounts (0.1.0)',
      '      rails (~> 7.0)',
      '',
      'BUNDLED WITH',
      '   2.5.0',
    ].join('\n')
    const versions = parseLockfile(text)
    assert.strictEqual(versions.get('rails'), '7.0.8')
    assert.strictEqual(versions.get('accounts'), '0.1.0')
  })

  test('blank line resets section state so DEPENDENCIES lines are ignored', () => {
    const text = [
      'GEM',
      '  remote: https://rubygems.org/',
      '  specs:',
      '    rake (13.2.1)',
      '',
      'DEPENDENCIES',
      '  rake (~> 13.0)',
    ].join('\n')
    const versions = parseLockfile(text)
    assert.strictEqual(versions.get('rake'), '13.2.1')
    assert.strictEqual(versions.size, 1)
  })

  test('handles gem names with hyphens and underscores', () => {
    const text = [
      'GEM',
      '  remote: https://rubygems.org/',
      '  specs:',
      '    ruby-openssl-chachapoly (1.0.0)',
      '    active_record_extended (3.2.1)',
    ].join('\n')
    const versions = parseLockfile(text)
    assert.strictEqual(versions.get('ruby-openssl-chachapoly'), '1.0.0')
    assert.strictEqual(versions.get('active_record_extended'), '3.2.1')
  })

  test('stripPlatform: platform entries resolve to the same version as bare entry', () => {
    const text = [
      'GEM',
      '  remote: https://rubygems.org/',
      '  specs:',
      '    nokogiri (1.19.2-arm64-darwin)',
      '    nokogiri (1.19.2-x86_64-linux-gnu)',
    ].join('\n')
    const versions = parseLockfile(text)
    assert.strictEqual(versions.get('nokogiri'), '1.19.2')
  })
})
