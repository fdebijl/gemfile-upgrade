import {
  DecorationRenderOptions,
  OverviewRulerLane,
  TextEditorDecorationType,
  ThemableDecorationRenderOptions,
  window,
} from 'vscode'

import { getConfig } from './config'
import { UpgradeLevel } from './types'

type DecorationTypeConfigurables = {
  overviewRulerColor: string
  light: ThemableDecorationRenderOptions
  dark: ThemableDecorationRenderOptions
  contentText: string
}

const decorateUpdatedGem = ({
  overviewRulerColor,
  light,
  dark,
  contentText,
}: DecorationTypeConfigurables) => {
  const config = getConfig()
  const decorationType: DecorationRenderOptions = {
    isWholeLine: false,
    after: {
      margin: '2em',
      contentText,
    },
    light,
    dark,
  }

  if (config.showOverviewRulerColor) {
    decorationType.overviewRulerLane = OverviewRulerLane.Right
    decorationType.overviewRulerColor = overviewRulerColor
  }

  return window.createTextEditorDecorationType(decorationType)
}

const getCorrectColor = (settingsColor: string, defaultColor: string): string => {
  if (settingsColor === '') {
    return defaultColor
  }
  if (settingsColor.startsWith('#')) {
    return settingsColor
  } else {
    return `#${settingsColor}`
  }
}

const decorateMajorUpdate = (contentText: string) => {
  const settingsColor = getConfig().majorUpgradeColorOverwrite
  return decorateUpdatedGem({
    overviewRulerColor: getCorrectColor(settingsColor, '#578EFF'),
    light: { after: { color: getCorrectColor(settingsColor, '#0028A3') } },
    dark: { after: { color: getCorrectColor(settingsColor, '#578EFF') } },
    contentText,
  })
}

const decorateMinorUpdate = (contentText: string) => {
  const settingsColor = getConfig().minorUpgradeColorOverwrite
  return decorateUpdatedGem({
    overviewRulerColor: getCorrectColor(settingsColor, '#FFC757'),
    light: { after: { color: getCorrectColor(settingsColor, '#A37B00') } },
    dark: { after: { color: getCorrectColor(settingsColor, '#FFC757') } },
    contentText,
  })
}

const decoratePatchUpdate = (contentText: string) => {
  const settingsColor = getConfig().patchUpgradeColorOverwrite
  return decorateUpdatedGem({
    overviewRulerColor: getCorrectColor(settingsColor, '#57FF73'),
    light: { after: { color: getCorrectColor(settingsColor, '#00A329') } },
    dark: { after: { color: getCorrectColor(settingsColor, '#57FF73') } },
    contentText,
  })
}

export const decorateDiscreet = (contentText: string): TextEditorDecorationType => {
  return decorateUpdatedGem({
    overviewRulerColor: 'darkgray',
    light: { color: 'lightgray', after: { color: 'lightgray' } },
    dark: { color: 'darkgray', after: { color: 'darkgray' } },
    contentText,
  })
}

export const getDecoratorForUpdate = (
  level: UpgradeLevel,
  text: string,
): TextEditorDecorationType => {
  switch (level) {
    case 'major':
      return decorateMajorUpdate(text)
    case 'minor':
      return decorateMinorUpdate(text)
    case 'patch':
      return decoratePatchUpdate(text)
  }
}

export function getUpdateDescription(latestVersion: string): string {
  return getConfig().decorationString.replace('%s', latestVersion)
}
