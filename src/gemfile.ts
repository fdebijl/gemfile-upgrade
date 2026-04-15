import * as vscode from 'vscode'

import { ConstraintType } from './types'

export interface ParsedConstraint {
  /** The version string after ~>, e.g. "7.0" from "~> 7.0". Undefined if no ~> present. */
  pessimisticVersion: string | undefined
  /** Any additional operators: [{op: '>=', version: '7.0.4'}, ...] */
  additionalOps: Array<{ op: string; version: string }>
  constraintType: ConstraintType
  /** Column index in the line of the opening quote of the first version token */
  rawStart: number
  /** Column index in the line just past the closing quote of the last version token */
  rawEnd: number
}

export interface GemDeclaration {
  gemName: string
  constraint: ParsedConstraint | null // null = no version specified
  line: number // 0-indexed
  lineText: string
  /** Column where a new constraint should be inserted (right after gem name closing quote).
   *  Relevant when constraint === null, but also useful for replacement. */
  insertPos: number
}

// Matches a gem declaration line. Groups: [1]=quote char, [2]=gem name, [3]=remainder
const GEM_LINE_RE = /^\s*gem\s+(['"])([^'"]+)\1(.*)/

// A quoted string token: captures content of single or double quoted string
const QUOTED_RE = /('([^']*)'|"([^"]*)")/g

// A string whose content looks like a version spec (starts with operator or digit)
const VERSION_SPEC_RE = /^[\d~><!=]/

interface TokenPosition {
  content: string
  startInLine: number // position of opening quote in the full line
  endInLine: number // position just past closing quote in the full line
}

/** Extract all version-like quoted string tokens from the remainder of a gem line. */
function extractVersionTokens(remainder: string, remainderStartInLine: number): TokenPosition[] {
  const tokens: TokenPosition[] = []
  QUOTED_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = QUOTED_RE.exec(remainder)) !== null) {
    const content: string = m[2] !== undefined ? m[2] : (m[3] ?? '')
    // Only treat as a version token if it looks like a version spec
    if (VERSION_SPEC_RE.test(content)) {
      tokens.push({
        content,
        startInLine: remainderStartInLine + m.index,
        endInLine: remainderStartInLine + m.index + m[0].length,
      })
    }
  }
  return tokens
}

/** Parse a set of version constraint tokens into a ParsedConstraint. */
function buildConstraint(tokens: TokenPosition[]): ParsedConstraint {
  let pessimisticVersion: string | undefined
  const additionalOps: Array<{ op: string; version: string }> = []

  for (const token of tokens) {
    const content = token.content.trim()
    if (content.startsWith('~>')) {
      pessimisticVersion = content.slice(2).trim()
    } else {
      const opMatch = /^([~><!=]+)\s*(.+)$/.exec(content)
      if (opMatch) {
        additionalOps.push({ op: opMatch[1], version: opMatch[2].trim() })
      }
    }
  }

  let constraintType: ConstraintType
  if (pessimisticVersion === undefined) {
    constraintType = 'non-pessimistic'
  } else if (additionalOps.length > 0) {
    constraintType = 'compound'
  } else {
    const segCount = pessimisticVersion.split('.').length
    if (segCount === 1) {
      constraintType = 'pessimistic-1'
    } else if (segCount === 2) {
      constraintType = 'pessimistic-2'
    } else {
      constraintType = 'pessimistic-3'
    }
  }

  return {
    pessimisticVersion,
    additionalOps,
    constraintType,
    rawStart: tokens[0].startInLine,
    rawEnd: tokens[tokens.length - 1].endInLine,
  }
}

/** Parse all gem declarations from a Gemfile text. */
export function getGemDeclarations(text: string): GemDeclaration[] {
  const lines = text.split('\n')
  const declarations: GemDeclaration[] = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]

    // Strip inline comments
    const commentStart = findCommentStart(line)
    const effectiveLine = commentStart >= 0 ? line.substring(0, commentStart) : line

    const match = GEM_LINE_RE.exec(effectiveLine)
    if (!match) {
      continue
    }

    const gemName = match[2]
    const remainder = match[3]

    // Skip local gems (path: keyword argument)
    if (/\bpath\s*:|:path\s*=>/.test(remainder)) {
      continue
    }

    // Position of the remainder within the effective line
    const remainderStartInLine = match[0].length - match[3].length

    // insertPos: right after the closing quote of the gem name
    // The gem name string ends at (remainderStartInLine)
    const insertPos = remainderStartInLine

    const tokens = extractVersionTokens(remainder, remainderStartInLine)

    const constraint = tokens.length > 0 ? buildConstraint(tokens) : null

    declarations.push({
      gemName,
      constraint,
      line: lineIndex,
      lineText: line,
      insertPos,
    })
  }

  return declarations
}

/** Find the gem declaration at a specific 0-indexed line number. */
export function getGemFromLine(text: string, line: number): GemDeclaration | undefined {
  return getGemDeclarations(text).find((d) => d.line === line)
}

/** Returns true if the given document is a Gemfile (exact basename match). */
export function isGemfile(document: vscode.TextDocument): boolean {
  const fileName = document.fileName
  return fileName.endsWith('/Gemfile') || fileName.endsWith('\\Gemfile')
}

/**
 * Find the start of an inline comment in a Ruby line.
 * Returns -1 if no comment found.
 * Accounts for # inside strings.
 */
function findCommentStart(line: string): number {
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
    } else if (ch === '#' && !inSingleQuote && !inDoubleQuote) {
      return i
    }
  }

  return -1
}
