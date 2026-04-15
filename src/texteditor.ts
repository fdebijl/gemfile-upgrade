import * as vscode from 'vscode'
import { TextEditorDecorationType } from 'vscode'

import { getConfig } from './config'
import { decorateDiscreet, getDecoratorForUpdate, getUpdateDescription } from './decorations'
import { GemDeclaration, getGemDeclarations, isGemfile } from './gemfile'
import { GemCacheItem, GemLoader, getCachedGemData, getGemUpgradeInfo, refreshGemfileData } from './rubygems'
import { AsyncState } from './types'

interface DecorationWrapper {
  line: number
  text: string
  decoration: TextEditorDecorationType
}

function isDiffView() {
  const schemes = vscode.window.visibleTextEditors.map((editor) => editor.document.uri.scheme)
  return schemes.length === 2 && schemes.includes('git') && schemes.includes('file')
}

// Track the latest start time per document to handle rapid file switches
const decorationStart: Record<string, number> = {}

let rowToDecoration: Record<number, DecorationWrapper | undefined> = {}

export const handleFileDecoration = (document: vscode.TextDocument) => {
  if (isDiffView()) {
    return
  }

  if (!isGemfile(document)) {
    return
  }

  const startTime = new Date().getTime()
  decorationStart[document.fileName] = startTime

  void loadDecoration(document, startTime)
}

const loadDecoration = async (document: vscode.TextDocument, startTime: number) => {
  const text = document.getText()
  const gems = getGemDeclarations(text)

  const textEditor = getTextEditorFromDocument(document)
  if (textEditor === undefined) {
    return
  }

  const promises = refreshGemfileData(text)

  try {
    await Promise.race([...promises, Promise.resolve()])
  } catch (_) {
    //
  }

  // Initial paint
  const stillLoading = promises.length !== 0
  paintDecorations(document, gems, stillLoading, startTime)

  return waitForPromises(promises, document, gems, startTime)
}

const waitForPromises = async (
  promises: Promise<void>[],
  document: vscode.TextDocument,
  gems: GemDeclaration[],
  startTime: number,
) => {
  let newSettled = false

  if (promises.length === 0) {
    return
  }

  promises.forEach((promise) => {
    void promise
      .then(() => {
        newSettled = true
      })
      .catch(() => {
        //
      })
  })

  const interval = setInterval(() => {
    if (newSettled) {
      newSettled = false
      paintDecorations(document, gems, true, startTime)
    }
  }, 1000)

  await Promise.allSettled(promises)

  clearInterval(interval)

  paintDecorations(document, gems, false, startTime)
}

const paintDecorations = (
  document: vscode.TextDocument,
  gems: GemDeclaration[],
  stillLoading: boolean,
  startTime: number,
) => {
  if (decorationStart[document.fileName] !== startTime) {
    return
  }

  const textEditor = getTextEditorFromDocument(document)
  if (textEditor === undefined) {
    return
  }

  const ignored = getConfig().ignoreGems

  // Show "Loading updates..." on the first gem line while data is still fetching
  if (stillLoading && gems.length > 0) {
    const firstGem = gems[0]
    const lineText = document.lineAt(firstGem.line).text
    const range = new vscode.Range(
      new vscode.Position(firstGem.line, lineText.length),
      new vscode.Position(firstGem.line, lineText.length),
    )
    const text = 'Loading updates...'
    const loadingDecoration = decorateDiscreet(text)
    if (updateCache(loadingDecoration, firstGem.line, text)) {
      setDecorator(loadingDecoration, textEditor, range)
    }
  } else if (!stillLoading && gems.length > 0) {
    // Clear the "Loading updates..." decoration from the first gem line if present
    const firstGem = gems[0]
    const current = rowToDecoration[firstGem.line]
    if (current?.text === 'Loading updates...') {
      current.decoration.dispose()
      rowToDecoration[firstGem.line] = undefined
    }
  }

  gems.forEach((gem) => {
    if (ignored.includes(gem.gemName)) {
      return
    }

    const lineText = document.lineAt(gem.line).text
    const range = new vscode.Range(
      new vscode.Position(gem.line, lineText.length),
      new vscode.Position(gem.line, lineText.length),
    )

    const cache: GemLoader<GemCacheItem> | undefined = getCachedGemData(gem.gemName)
    if (cache === undefined) {
      return
    }

    if (cache.asyncstate === AsyncState.Rejected) {
      // For gems in non-default source blocks the rubygems.org lookup will fail
      // for private gems — skip silently rather than showing "Dependency not found"
      if (gem.sourceUrl !== null) {
        return
      }
      const text = 'Dependency not found'
      const notFoundDecoration = decorateDiscreet(text)
      if (updateCache(notFoundDecoration, range.start.line, text)) {
        setDecorator(notFoundDecoration, textEditor, range)
      }
      return
    }

    if (cache.item === undefined) {
      const msUntilRowLoading = getConfig().msUntilRowLoading
      if (
        msUntilRowLoading !== 0 &&
        (msUntilRowLoading < 100 ||
          cache.startTime + msUntilRowLoading < new Date().getTime())
      ) {
        const text = 'Loading...'
        const loadingDecoration = decorateDiscreet(text)
        if (updateCache(loadingDecoration, range.start.line, text)) {
          setDecorator(loadingDecoration, textEditor, range)
        }
      }
      return
    }

    const upgradeInfo = getGemUpgradeInfo(cache.item, gem.constraint)

    let decorator: TextEditorDecorationType | undefined
    let text: string | undefined

    if (upgradeInfo.invalidConstraint === true) {
      text = 'invalid constraint'
      decorator = decorateDiscreet(text)
    } else if (upgradeInfo.decorationVersion !== undefined && upgradeInfo.upgradeLevel !== undefined) {
      text = getUpdateDescription(upgradeInfo.decorationVersion)
      decorator = getDecoratorForUpdate(upgradeInfo.upgradeLevel, text)
    }
    // Non-pessimistic constraints: no inline decoration (quick actions only)

    if (decorator === undefined || text === undefined) {
      return
    }

    if (updateCache(decorator, range.start.line, text)) {
      setDecorator(decorator, textEditor, range)
    }
  })
}

const setDecorator = (
  decorator: TextEditorDecorationType,
  textEditor: vscode.TextEditor,
  range: vscode.Range,
) => {
  textEditor.setDecorations(decorator, [{ range }])
}

const getTextEditorFromDocument = (document: vscode.TextDocument) => {
  return vscode.window.visibleTextEditors.find((textEditor) => {
    return textEditor.document === document
  })
}

export const clearDecorations = () => {
  Object.values(rowToDecoration).forEach((v) => {
    v?.decoration.dispose()
  })
  rowToDecoration = {}
}

const updateCache = (decoration: TextEditorDecorationType, line: number, text: string) => {
  const current = rowToDecoration[line]
  if (current === undefined || current.text !== text) {
    if (current) {
      current.decoration.dispose()
    }
    rowToDecoration[line] = {
      decoration,
      line,
      text,
    }
    return true
  } else {
    return false
  }
}
