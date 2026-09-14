import en from '../../../resources/locales/en/translation.json'

/**
 * Every bundled language. To add a language, import its
 * resources/locales/<code>/translation.json here and add one entry.
 */
export const LANGUAGE_RESOURCES = {
  en: { translation: en },
} as const

export const BUNDLED_LANGUAGES: string[] = Object.keys(LANGUAGE_RESOURCES)
