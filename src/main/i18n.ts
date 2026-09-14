import { app } from 'electron'
import { availableLanguages, i18n } from '../shared/i18n'
import { PSEUDO_LANGUAGE_ENV, PSEUDO_LANGUAGE_ENV_ON } from '../shared/i18n/languages'
import { resolveLanguage } from '../shared/i18n/resolve'
import type { I18nEnvironment } from '../shared/ipc-contracts'

export function isPseudoLanguageEnabled(): boolean {
  return process.env[PSEUDO_LANGUAGE_ENV] === PSEUDO_LANGUAGE_ENV_ON
}

/** Only valid after `app.whenReady()`: the OS language list comes from Electron. */
export function getI18nEnvironment(): I18nEnvironment {
  return {
    systemLanguages: app.getPreferredSystemLanguages(),
    pseudoLanguageEnabled: isPseudoLanguageEnabled(),
  }
}

/**
 * Switch the main process to the language a setting resolves to. The app
 * menu and the tray listen to i18next's `languageChanged` event and rebuild.
 */
export function applyLanguageSetting(setting: string): void {
  const environment = getI18nEnvironment()
  const language = resolveLanguage(
    setting,
    environment.systemLanguages,
    availableLanguages(environment.pseudoLanguageEnabled),
  )
  if (language !== i18n.language) void i18n.changeLanguage(language)
}
