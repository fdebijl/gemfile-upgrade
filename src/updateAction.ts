import * as vscode from 'vscode'

import { OPEN_URL_COMMAND } from './extension'
import { GemDeclaration, getGemFromLine, isGemfile } from './gemfile'
import { getCachedGemData, GemUpgradeInfo, getGemUpgradeInfo } from './rubygems'

export class UpdateAction implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix]

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
  ): vscode.CodeAction[] | undefined {
    if (!isGemfile(document)) {
      return
    }

    if (!range.isSingleLine) {
      return
    }

    const gem = getGemFromLine(document.getText(), range.start.line)
    if (gem === undefined) {
      return
    }

    const cache = getCachedGemData(gem.gemName)
    if (cache === undefined || cache.item === undefined) {
      return
    }

    const upgradeInfo = getGemUpgradeInfo(cache.item, gem.constraint)
    if (upgradeInfo.invalidConstraint === true) {
      return
    }

    const actions: vscode.CodeAction[] = []

    // Version upgrade actions
    if (upgradeInfo.bumpMajor !== undefined) {
      actions.push(
        this.createPinAction(document, gem, `Bump major to ${upgradeInfo.bumpMajor}`, upgradeInfo.bumpMajor),
      )
    }
    if (upgradeInfo.bumpMinor !== undefined) {
      actions.push(
        this.createPinAction(document, gem, `Bump minor to ${upgradeInfo.bumpMinor}`, upgradeInfo.bumpMinor),
      )
    }
    if (upgradeInfo.pinToLatestMinorInRange !== undefined) {
      actions.push(
        this.createPinAction(
          document,
          gem,
          `Pin to latest minor (${upgradeInfo.pinToLatestMinorInRange})`,
          upgradeInfo.pinToLatestMinorInRange,
        ),
      )
    }
    if (upgradeInfo.pinToLatestPatchInRange !== undefined) {
      actions.push(
        this.createPinAction(
          document,
          gem,
          `Pin to latest patch (${upgradeInfo.pinToLatestPatchInRange})`,
          upgradeInfo.pinToLatestPatchInRange,
        ),
      )
    }
    if (upgradeInfo.pinToLatestMajor !== undefined) {
      actions.push(
        this.createPinAction(
          document,
          gem,
          `Pin to latest major (${upgradeInfo.pinToLatestMajor})`,
          upgradeInfo.pinToLatestMajor,
        ),
      )
    }
    if (upgradeInfo.pinToLatestMinor !== undefined) {
      actions.push(
        this.createPinAction(
          document,
          gem,
          `Pin to latest minor (${upgradeInfo.pinToLatestMinor})`,
          upgradeInfo.pinToLatestMinor,
        ),
      )
    }
    if (upgradeInfo.pinToLatestPatch !== undefined) {
      actions.push(
        this.createPinAction(
          document,
          gem,
          `Pin to latest patch (${upgradeInfo.pinToLatestPatch})`,
          upgradeInfo.pinToLatestPatch,
        ),
      )
    }

    // URL actions
    if (upgradeInfo.homepageUri !== undefined) {
      actions.push(this.createUrlAction('Open homepage', upgradeInfo.homepageUri, false))
    }
    if (upgradeInfo.changelogUri !== undefined) {
      actions.push(this.createUrlAction('Open changelog', upgradeInfo.changelogUri, true))
    }

    return actions
  }

  private createPinAction(
    document: vscode.TextDocument,
    gem: GemDeclaration,
    label: string,
    newConstraint: string,
  ): vscode.CodeAction {
    const lineText = gem.lineText
    let newLineText: string

    if (gem.constraint === null) {
      // No existing version: insert constraint after gem name
      newLineText =
        lineText.substring(0, gem.insertPos) +
        `, '${newConstraint}'` +
        lineText.substring(gem.insertPos)
    } else {
      // Replace existing constraint using stored column offsets
      newLineText =
        lineText.substring(0, gem.constraint.rawStart) +
        `'${newConstraint}'` +
        lineText.substring(gem.constraint.rawEnd)
    }

    const lineRange = new vscode.Range(gem.line, 0, gem.line, lineText.length)
    const fix = new vscode.CodeAction(label, vscode.CodeActionKind.Empty)
    fix.edit = new vscode.WorkspaceEdit()
    fix.edit.replace(document.uri, lineRange, newLineText)
    return fix
  }

  private createUrlAction(label: string, url: string, isChangelog: boolean): vscode.CodeAction {
    const action = new vscode.CodeAction(label, vscode.CodeActionKind.Empty)
    action.command = {
      command: OPEN_URL_COMMAND,
      title: label,
      tooltip: `This will open the gem ${label.toLowerCase()}.`,
      arguments: [url, isChangelog],
    }
    return action
  }
}

// Re-export for use in texteditor.ts (avoids circular imports by going through extension.ts)
export function buildUpgradeActions(upgradeInfo: GemUpgradeInfo): string[] {
  const descriptions: string[] = []
  if (upgradeInfo.bumpMajor !== undefined) descriptions.push(`Bump major to ${upgradeInfo.bumpMajor}`)
  if (upgradeInfo.bumpMinor !== undefined) descriptions.push(`Bump minor to ${upgradeInfo.bumpMinor}`)
  if (upgradeInfo.pinToLatestMinorInRange !== undefined)
    descriptions.push(`Pin to latest minor (${upgradeInfo.pinToLatestMinorInRange})`)
  if (upgradeInfo.pinToLatestPatchInRange !== undefined)
    descriptions.push(`Pin to latest patch (${upgradeInfo.pinToLatestPatchInRange})`)
  return descriptions
}
