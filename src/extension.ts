import * as vscode from 'vscode'

import { Config, getConfig, setConfig } from './config'
import { initLogger } from './log'
import { pinAllGems } from './pinAll'
import { cleanGemCache } from './rubygems'
import { clearDecorations, handleFileDecoration } from './texteditor'
import { UpdateAction } from './updateAction'

export const OPEN_URL_COMMAND = 'gemfile-upgrade.open-url-command'

export async function activate(context: vscode.ExtensionContext) {
  try {
    await activateWrapped(context)
  } catch (e) {
    console.error('failed to start gemfile-upgrade')
    if (e instanceof Error) {
      console.error(e.name, e.message)
      console.error(e.stack)
    }
  }
}

async function activateWrapped(context: vscode.ExtensionContext) {
  initLogger(context)
  fixConfig()

  let showDecorations = getConfig().showUpdatesAtStart

  const onConfigChange = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('gemfile-upgrade')) {
      fixConfig()
      cleanGemCache()
      clearDecorations()
      checkCurrentFiles(showDecorations)
    }
  })

  const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor(
    (textEditor: vscode.TextEditor | undefined) => {
      if (textEditor !== undefined) {
        clearDecorations()
        if (showDecorations) {
          handleFileDecoration(textEditor.document)
        }
      }
    },
  )

  let timeout: ReturnType<typeof setTimeout>
  const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(
    (e: vscode.TextDocumentChangeEvent) => {
      if (e.document !== vscode.window.activeTextEditor?.document) {
        return
      }

      clearTimeout(timeout)
      timeout = setTimeout(() => {
        clearDecorations()
        if (showDecorations) {
          handleFileDecoration(e.document)
        }
      }, 500)
    },
  )

  checkCurrentFiles(showDecorations)

  const toggleShowCommand = vscode.commands.registerCommand('gemfile-upgrade.toggle-show', () => {
    showDecorations = !showDecorations
    checkCurrentFiles(showDecorations)
  })

  context.subscriptions.push(
    onConfigChange,
    onDidChangeActiveTextEditor,
    onDidChangeTextDocument,
    toggleShowCommand,
  )

  activateCodeActionStuff(context)
}

const checkCurrentFiles = (showDecorations: boolean) => {
  vscode.window.visibleTextEditors.forEach((textEditor) => {
    if (showDecorations) {
      handleFileDecoration(textEditor.document)
    } else {
      clearDecorations()
    }
  })
}

const activateCodeActionStuff = (context: vscode.ExtensionContext) => {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider({ pattern: '**/Gemfile' }, new UpdateAction(), {
      providedCodeActionKinds: UpdateAction.providedCodeActionKinds,
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      OPEN_URL_COMMAND,
      async (url: string, isChangelog: boolean) => {
        if (isChangelog && getConfig().openChangelogInEditor) {
          await vscode.commands.executeCommand('simpleBrowser.show', url)
        } else {
          await vscode.env.openExternal(vscode.Uri.parse(url))
        }
      },
    ),
  )

  const makePinAllCommand = (level: 'major' | 'minor' | 'patch') => async () => {
    const editor = vscode.window.activeTextEditor
    if (editor !== undefined) {
      await pinAllGems(editor, level)
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'gemfile-upgrade.pin-all-to-latest-major',
      makePinAllCommand('major'),
    ),
    vscode.commands.registerCommand(
      'gemfile-upgrade.pin-all-to-latest-minor',
      makePinAllCommand('minor'),
    ),
    vscode.commands.registerCommand(
      'gemfile-upgrade.pin-all-to-latest-patch',
      makePinAllCommand('patch'),
    ),
  )
}

export function deactivate() {
  //
}

const fixConfig = () => {
  const workspaceConfig = vscode.workspace.getConfiguration('gemfile-upgrade')

  const decorationString = workspaceConfig.get<string>('decorationString')

  const config: Config = {
    showUpdatesAtStart: workspaceConfig.get<boolean>('showUpdatesAtStart') === true,
    showOverviewRulerColor: workspaceConfig.get<boolean>('showOverviewRulerColor') === true,
    majorUpgradeColorOverwrite: workspaceConfig.get<string>('majorUpgradeColorOverwrite') ?? '',
    minorUpgradeColorOverwrite: workspaceConfig.get<string>('minorUpgradeColorOverwrite') ?? '',
    patchUpgradeColorOverwrite: workspaceConfig.get<string>('patchUpgradeColorOverwrite') ?? '',
    decorationString:
      decorationString !== undefined && decorationString !== '' ? decorationString : '\t-> %s',
    ignoreGems: workspaceConfig.get<string[]>('ignoreGems') ?? [],
    msUntilRowLoading: workspaceConfig.get<number>('msUntilRowLoading') ?? 10000,
    openChangelogInEditor: workspaceConfig.get<boolean>('openChangelogInEditor') !== false,
  }
  setConfig(config)
}
