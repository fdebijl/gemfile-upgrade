import * as vscode from 'vscode'

import { getGemDeclarations } from './gemfile'
import { parseLockfile } from './lockfile'

export async function pinGemsFromLockfile(editor: vscode.TextEditor): Promise<void> {
  const lockfileUri = vscode.Uri.joinPath(editor.document.uri, '..', 'Gemfile.lock')

  let lockfileText: string
  try {
    const bytes = await vscode.workspace.fs.readFile(lockfileUri)
    lockfileText = Buffer.from(bytes).toString('utf8')
  } catch {
    void vscode.window.showWarningMessage(
      'Gemfile.lock not found alongside this Gemfile. Run `bundle install` first.',
    )
    return
  }

  const lockedVersions = parseLockfile(lockfileText)
  const gems = getGemDeclarations(editor.document.getText())
  const edit = new vscode.WorkspaceEdit()
  let skipped = 0

  for (const gem of gems) {
    const lockedVersion = lockedVersions.get(gem.gemName)
    if (lockedVersion === undefined) {
      skipped++
      continue
    }

    const newConstraint = `~> ${lockedVersion}`
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

    edit.replace(
      editor.document.uri,
      new vscode.Range(gem.line, 0, gem.line, lineText.length),
      newLineText,
    )
  }

  await vscode.workspace.applyEdit(edit)

  if (skipped > 0) {
    void vscode.window.showInformationMessage(
      `${skipped} gem${skipped === 1 ? '' : 's'} not found in Gemfile.lock and ${skipped === 1 ? 'was' : 'were'} skipped.`,
    )
  }
}
