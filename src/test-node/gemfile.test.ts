import { describe, test } from 'node:test'
import * as assert from 'assert'

import { getGemDeclarations, getGemFromLine } from '../gemfile'

describe('Gemfile Parser', () => {
  // ── Basic parsing ────────────────────────────────────────────────────────

  test('no-version gem', () => {
    const text = "gem 'rails'"
    const gems = getGemDeclarations(text)
    assert.strictEqual(gems.length, 1)
    assert.strictEqual(gems[0].gemName, 'rails')
    assert.strictEqual(gems[0].constraint, null)
    assert.strictEqual(gems[0].line, 0)
  })

  test('no-version gem with double quotes', () => {
    const gems = getGemDeclarations('gem "puma"')
    assert.strictEqual(gems.length, 1)
    assert.strictEqual(gems[0].gemName, 'puma')
    assert.strictEqual(gems[0].constraint, null)
  })

  test('gem with pessimistic-1 constraint', () => {
    const gems = getGemDeclarations("gem 'rails', '~> 7'")
    assert.strictEqual(gems.length, 1)
    const c = gems[0].constraint
    assert.ok(c)
    assert.strictEqual(c.constraintType, 'pessimistic-1')
    assert.strictEqual(c.pessimisticVersion, '7')
    assert.deepStrictEqual(c.additionalOps, [])
  })

  test('gem with pessimistic-2 constraint', () => {
    const gems = getGemDeclarations("gem 'rails', '~> 7.0'")
    const c = gems[0].constraint
    assert.ok(c)
    assert.strictEqual(c.constraintType, 'pessimistic-2')
    assert.strictEqual(c.pessimisticVersion, '7.0')
  })

  test('gem with pessimistic-3 constraint', () => {
    const gems = getGemDeclarations("gem 'rails', '~> 7.0.4'")
    const c = gems[0].constraint
    assert.ok(c)
    assert.strictEqual(c.constraintType, 'pessimistic-3')
    assert.strictEqual(c.pessimisticVersion, '7.0.4')
  })

  test('gem with 4-segment pessimistic constraint', () => {
    const gems = getGemDeclarations("gem 'google-protobuf', '~> 3.25.3.0'")
    const c = gems[0].constraint
    assert.ok(c)
    assert.strictEqual(c.constraintType, 'pessimistic-3')
    assert.strictEqual(c.pessimisticVersion, '3.25.3.0')
  })

  test('gem with compound constraint', () => {
    const gems = getGemDeclarations("gem 'rails', '~> 7.0', '>= 7.0.4'")
    const c = gems[0].constraint
    assert.ok(c)
    assert.strictEqual(c.constraintType, 'compound')
    assert.strictEqual(c.pessimisticVersion, '7.0')
    assert.deepStrictEqual(c.additionalOps, [{ op: '>=', version: '7.0.4' }])
  })

  test('gem with non-pessimistic constraint (>=)', () => {
    const gems = getGemDeclarations("gem 'puma', '>= 5.0'")
    const c = gems[0].constraint
    assert.ok(c)
    assert.strictEqual(c.constraintType, 'non-pessimistic')
    assert.strictEqual(c.pessimisticVersion, undefined)
    assert.deepStrictEqual(c.additionalOps, [{ op: '>=', version: '5.0' }])
  })

  test('gem with exact version constraint', () => {
    const gems = getGemDeclarations("gem 'tzinfo', '= 2.0.0'")
    const c = gems[0].constraint
    assert.ok(c)
    assert.strictEqual(c.constraintType, 'non-pessimistic')
    assert.deepStrictEqual(c.additionalOps, [{ op: '=', version: '2.0.0' }])
  })

  // ── Keyword arguments ────────────────────────────────────────────────────

  test('gem with require keyword arg is not treated as constraint', () => {
    const gems = getGemDeclarations("gem 'bootsnap', require: false")
    assert.strictEqual(gems.length, 1)
    assert.strictEqual(gems[0].constraint, null)
  })

  test('gem with version and require keyword arg', () => {
    const gems = getGemDeclarations("gem 'rails', '~> 7.0', require: false")
    const c = gems[0].constraint
    assert.ok(c)
    assert.strictEqual(c.constraintType, 'pessimistic-2')
    assert.strictEqual(c.pessimisticVersion, '7.0')
  })

  test('compound constraint with keyword arg', () => {
    const gems = getGemDeclarations("gem 'rails', '~> 7.0', '>= 7.0.4', require: false")
    const c = gems[0].constraint
    assert.ok(c)
    assert.strictEqual(c.constraintType, 'compound')
    assert.strictEqual(c.pessimisticVersion, '7.0')
    assert.deepStrictEqual(c.additionalOps, [{ op: '>=', version: '7.0.4' }])
  })

  // ── Comment handling ─────────────────────────────────────────────────────

  test('comment-only line is skipped', () => {
    const text = "# gem 'rails'"
    const gems = getGemDeclarations(text)
    assert.strictEqual(gems.length, 0)
  })

  test('inline comment does not affect parsing', () => {
    const gems = getGemDeclarations("gem 'rails', '~> 7.0' # web framework")
    const c = gems[0].constraint
    assert.ok(c)
    assert.strictEqual(c.pessimisticVersion, '7.0')
  })

  // ── Multi-line Gemfiles ──────────────────────────────────────────────────

  test('multiple gems', () => {
    const text = [
      "source 'https://rubygems.org'",
      '',
      "gem 'rails', '~> 7.0'",
      "gem 'puma', '~> 6.0'",
      "gem 'bootsnap', require: false",
    ].join('\n')
    const gems = getGemDeclarations(text)
    assert.strictEqual(gems.length, 3)
    assert.strictEqual(gems[0].gemName, 'rails')
    assert.strictEqual(gems[0].line, 2)
    assert.strictEqual(gems[1].gemName, 'puma')
    assert.strictEqual(gems[1].line, 3)
    assert.strictEqual(gems[2].gemName, 'bootsnap')
    assert.strictEqual(gems[2].line, 4)
  })

  test('gems inside group blocks are parsed', () => {
    const text = [
      "group :development do",
      "  gem 'pry'",
      "end",
    ].join('\n')
    const gems = getGemDeclarations(text)
    assert.strictEqual(gems.length, 1)
    assert.strictEqual(gems[0].gemName, 'pry')
    assert.strictEqual(gems[0].line, 1)
  })

  // ── rawStart / rawEnd for line replacement ───────────────────────────────

  test('rawStart and rawEnd for simple pessimistic constraint', () => {
    const line = "gem 'rails', '~> 7.0'"
    const gems = getGemDeclarations(line)
    const c = gems[0].constraint!
    // Replacement: line.substring(0, rawStart) + "'~> 8'" + line.substring(rawEnd)
    const replaced = line.substring(0, c.rawStart) + "'~> 8'" + line.substring(c.rawEnd)
    assert.strictEqual(replaced, "gem 'rails', '~> 8'")
  })

  test('rawStart and rawEnd for compound constraint', () => {
    const line = "gem 'rails', '~> 7.0', '>= 7.0.4', require: false"
    const gems = getGemDeclarations(line)
    const c = gems[0].constraint!
    const replaced = line.substring(0, c.rawStart) + "'~> 8'" + line.substring(c.rawEnd)
    assert.strictEqual(replaced, "gem 'rails', '~> 8', require: false")
  })

  test('insertPos for no-version gem', () => {
    const line = "gem 'rails'"
    const gems = getGemDeclarations(line)
    const gem = gems[0]
    assert.strictEqual(gem.constraint, null)
    // Insert constraint at insertPos
    const withConstraint =
      line.substring(0, gem.insertPos) + ", '~> 7'" + line.substring(gem.insertPos)
    assert.strictEqual(withConstraint, "gem 'rails', '~> 7'")
  })

  test('insertPos for no-version gem with keyword arg', () => {
    const line = "gem 'rails', require: false"
    const gems = getGemDeclarations(line)
    const gem = gems[0]
    assert.strictEqual(gem.constraint, null)
    const withConstraint =
      line.substring(0, gem.insertPos) + ", '~> 7'" + line.substring(gem.insertPos)
    assert.strictEqual(withConstraint, "gem 'rails', '~> 7', require: false")
  })

  // ── getGemFromLine ───────────────────────────────────────────────────────

  test('getGemFromLine finds correct line', () => {
    const text = ["gem 'puma'", "gem 'rails', '~> 7.0'"].join('\n')
    const gem = getGemFromLine(text, 1)
    assert.ok(gem)
    assert.strictEqual(gem.gemName, 'rails')
  })

  test('getGemFromLine returns undefined for non-gem line', () => {
    const text = ["source 'https://rubygems.org'", "gem 'rails'"].join('\n')
    const gem = getGemFromLine(text, 0)
    assert.strictEqual(gem, undefined)
  })

  // ── Gem names with hyphens and underscores ───────────────────────────────

  test('gem name with hyphens', () => {
    const gems = getGemDeclarations("gem 'ruby-openssl-chachapoly'")
    assert.strictEqual(gems[0].gemName, 'ruby-openssl-chachapoly')
  })

  test('gem name with underscores', () => {
    const gems = getGemDeclarations("gem 'active_record'")
    assert.strictEqual(gems[0].gemName, 'active_record')
  })

  // ── sourceUrl / non-default source blocks ────────────────────────────────

  test('default gem has sourceUrl null', () => {
    const gems = getGemDeclarations("gem 'rails', '~> 7.0'")
    assert.strictEqual(gems[0].sourceUrl, null)
  })

  test('gem inside source block gets sourceUrl', () => {
    const text = [
      "source 'https://enterprise.contribsys.com/' do",
      "  gem 'sidekiq-pro'",
      "  gem 'sidekiq-ent'",
      'end',
    ].join('\n')
    const gems = getGemDeclarations(text)
    assert.strictEqual(gems.length, 2)
    assert.strictEqual(gems[0].gemName, 'sidekiq-pro')
    assert.strictEqual(gems[0].sourceUrl, 'https://enterprise.contribsys.com/')
    assert.strictEqual(gems[1].gemName, 'sidekiq-ent')
    assert.strictEqual(gems[1].sourceUrl, 'https://enterprise.contribsys.com/')
  })

  test('gems after source block end have sourceUrl null', () => {
    const text = [
      "source 'https://enterprise.contribsys.com/' do",
      "  gem 'sidekiq-pro'",
      'end',
      "gem 'rails', '~> 7.0'",
    ].join('\n')
    const gems = getGemDeclarations(text)
    assert.strictEqual(gems.length, 2)
    assert.strictEqual(gems[0].sourceUrl, 'https://enterprise.contribsys.com/')
    assert.strictEqual(gems[1].sourceUrl, null)
  })

  test('source block with versioned gems preserves constraint', () => {
    const text = [
      "source 'https://rubygems.pkg.github.com/org' do",
      "  gem 'lms-ruby', '~> 2.15.0'",
      'end',
    ].join('\n')
    const gems = getGemDeclarations(text)
    assert.strictEqual(gems.length, 1)
    assert.strictEqual(gems[0].gemName, 'lms-ruby')
    assert.strictEqual(gems[0].sourceUrl, 'https://rubygems.pkg.github.com/org')
    assert.ok(gems[0].constraint)
    assert.strictEqual(gems[0].constraint.pessimisticVersion, '2.15.0')
  })

  test('source block mixed with group block', () => {
    const text = [
      "source 'https://enterprise.contribsys.com/' do",
      "  gem 'sidekiq-pro'",
      'end',
      '',
      'group :development do',
      "  gem 'pry'",
      'end',
    ].join('\n')
    const gems = getGemDeclarations(text)
    assert.strictEqual(gems.length, 2)
    assert.strictEqual(gems[0].sourceUrl, 'https://enterprise.contribsys.com/')
    assert.strictEqual(gems[1].sourceUrl, null)
  })

  // ── Local path gems ───────────────────────────────────────────────────────

  test('gem with path: is skipped', () => {
    const gems = getGemDeclarations("gem 'accounts', path: 'engines/accounts'")
    assert.strictEqual(gems.length, 0)
  })

  test('gem with :path => is skipped', () => {
    const gems = getGemDeclarations("gem 'accounts', :path => 'engines/accounts'")
    assert.strictEqual(gems.length, 0)
  })

  test('other gems on adjacent lines are still parsed when one has path:', () => {
    const text = [
      "gem 'rails', '~> 7.0'",
      "gem 'accounts', path: 'engines/accounts'",
      "gem 'puma', '~> 6'",
    ].join('\n')
    const gems = getGemDeclarations(text)
    assert.strictEqual(gems.length, 2)
    assert.strictEqual(gems[0].gemName, 'rails')
    assert.strictEqual(gems[1].gemName, 'puma')
  })
})
