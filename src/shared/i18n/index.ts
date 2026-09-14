import i18next, { type TFunction } from 'i18next'
import { BUNDLED_LANGUAGES, LANGUAGE_RESOURCES } from './resources'
import { PSEUDO_LANGUAGE, SOURCE_LANGUAGE } from './languages'
import { pseudoLocalizeTree } from './pseudo'

const NAMESPACE = 'translation'

// One instance per process (main, renderer, and each test process). Init is
// synchronous because the resources are bundled, so t() works as soon as this
// module is imported, always starting in English.
//
// The pseudo-language is a generated resource bundle, not a post-processor
// run on every t() result: a post-processor runs after interpolation, so it
// would also mangle already-substituted placeholder values and mark English
// text pulled in via an explicit { lng: 'en' } lookup. Generating the bundle
// once here, from the English tree, keeps placeholders and explicit English
// lookups untouched — only the English text itself is pseudo-localized.
if (!i18next.isInitialized) {
  void i18next.init({
    resources: {
      ...LANGUAGE_RESOURCES,
      [PSEUDO_LANGUAGE]: { translation: pseudoLocalizeTree(LANGUAGE_RESOURCES.en.translation) },
    },
    lng: SOURCE_LANGUAGE,
    fallbackLng: SOURCE_LANGUAGE,
    defaultNS: NAMESPACE,
    initAsync: false,
    // An empty value means "not translated yet" and must show English.
    returnEmptyString: false,
    // React escapes output; menus, dialogs, and notifications are not HTML.
    interpolation: { escapeValue: false },
  })
}

export const i18n = i18next
export const t = i18next.t
/** English whatever the interface language: for logs and the diagnostics report, which stay English. */
export const tEnglish = i18next.getFixedT(SOURCE_LANGUAGE)
/** A translator: `t` for interface text, `tEnglish` for logs and the diagnostics report. */
export type Translate = TFunction

/** Codes the Language picker offers. The pseudo-language only when enabled. */
export function availableLanguages(pseudoEnabled: boolean): string[] {
  return pseudoEnabled ? [...BUNDLED_LANGUAGES, PSEUDO_LANGUAGE] : [...BUNDLED_LANGUAGES]
}

/** A language's own name ("Deutsch"), as its translator wrote it. */
export function languageNativeName(code: string): string {
  return i18next.t('language.nativeName', { lng: code })
}
