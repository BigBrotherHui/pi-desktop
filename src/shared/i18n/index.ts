import i18next, { type PostProcessorModule } from 'i18next'
import { BUNDLED_LANGUAGES, LANGUAGE_RESOURCES } from './resources'
import { PSEUDO_LANGUAGE, SOURCE_LANGUAGE } from './languages'
import { pseudoLocalize } from './pseudo'

const PSEUDO_POST_PROCESSOR = 'pseudo'
const NAMESPACE = 'translation'

// Runs on every t() result. An explicit { lng } (the English word next to the
// Language label) is honored, so only text in the pseudo-language is marked.
const pseudoPostProcessor: PostProcessorModule = {
  type: 'postProcessor',
  name: PSEUDO_POST_PROCESSOR,
  process(value, _key, options, translator) {
    const language = (options as { lng?: string }).lng ?? translator.language
    return language === PSEUDO_LANGUAGE ? pseudoLocalize(value) : value
  },
}

// One instance per process (main, renderer, and each test process). Init is
// synchronous because the resources are bundled, so t() works as soon as this
// module is imported, always starting in English.
if (!i18next.isInitialized) {
  void i18next.use(pseudoPostProcessor).init({
    resources: LANGUAGE_RESOURCES,
    lng: SOURCE_LANGUAGE,
    fallbackLng: SOURCE_LANGUAGE,
    defaultNS: NAMESPACE,
    initAsync: false,
    // An empty value means "not translated yet" and must show English.
    returnEmptyString: false,
    // React escapes output; menus, dialogs, and notifications are not HTML.
    interpolation: { escapeValue: false },
    postProcess: [PSEUDO_POST_PROCESSOR],
  })
}

export const i18n = i18next
export const t = i18next.t

/** Codes the Language picker offers. The pseudo-language only when enabled. */
export function availableLanguages(pseudoEnabled: boolean): string[] {
  return pseudoEnabled ? [...BUNDLED_LANGUAGES, PSEUDO_LANGUAGE] : [...BUNDLED_LANGUAGES]
}

/** A language's own name ("Deutsch"), as its translator wrote it. */
export function languageNativeName(code: string): string {
  return i18next.t('language.nativeName', { lng: code })
}
