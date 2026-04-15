export interface Config {
  showUpdatesAtStart: boolean
  showOverviewRulerColor: boolean
  majorUpgradeColorOverwrite: string
  minorUpgradeColorOverwrite: string
  patchUpgradeColorOverwrite: string
  decorationString: string
  ignoreGems: string[]
  msUntilRowLoading: number
  openChangelogInEditor: boolean
}

let currentConfig: Config | undefined

export const getConfig = (): Config => {
  if (currentConfig === undefined) {
    throw new Error('config should be loaded')
  }
  return currentConfig
}

export const setConfig = (newConfig: Config) => {
  currentConfig = newConfig
}
