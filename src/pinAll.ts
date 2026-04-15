import * as vscode from 'vscode'

import { getGemDeclarations } from './gemfile'
import { getCachedGemData } from './rubygems'
import { AsyncState } from './types'

function makeMajorPin(version: string): string {
  return `~> ${version.split('.')[0] ?? '0'}`
}

function makeMinorPin(version: string): string {
  const segs = version.split('.')
  return `~> ${segs[0] ?? '0'}.${segs[1] ?? '0'}`
}

function makePatchPin(version: string): string {
  const segs = version.split('.')
  return `~> ${segs[0] ?? '0'}.${segs[1] ?? '0'}.${segs[2] ?? '0'}`
}

export async function pinAllGems(
  editor: vscode.TextEditor,
  level: 'major' | 'minor' | 'patch',
): Promise<void> {
  const document = editor.document
  const text = document.getText()
  const gems = getGemDeclarations(text)

  const edit = new vscode.WorkspaceEdit()

  for (const gem of gems) {
    const cache = getCachedGemData(gem.gemName)
    if (
      cache === undefined ||
      cache.asyncstate !== AsyncState.Fulfilled ||
      cache.item === undefined
    ) {
      continue
    }

    const latestVersion = cache.item.latestVersion
    const latestMajor = latestVersion.split('.')[0] ?? '0'

    // Never offer "pin to ~> 0"
    if (level === 'major' && latestMajor === '0') {
      continue
    }

    let newConstraint: string
    if (level === 'major') {
      newConstraint = makeMajorPin(latestVersion)
    } else if (level === 'minor') {
      newConstraint = makeMinorPin(latestVersion)
    } else {
      newConstraint = makePatchPin(latestVersion)
    }

    const lineText = gem.lineText
    let newLineText: string

    if (gem.constraint === null) {
      newLineText =
        lineText.substring(0, gem.insertPos) +
        `, '${newConstraint}'` +
        lineText.substring(gem.insertPos)
    } else {
      newLineText =
        lineText.substring(0, gem.constraint.rawStart) +
        `'${newConstraint}'` +
        lineText.substring(gem.constraint.rawEnd)
    }

    const lineRange = new vscode.Range(gem.line, 0, gem.line, lineText.length)
    edit.replace(document.uri, lineRange, newLineText)
  }

  await vscode.workspace.applyEdit(edit)
}
