import { SOURCE_LANGUAGE, SYSTEM_LANGUAGE } from './languages'

// "zh-TW" and "zh-Hant" both maximize to "zh-Hant"; "de-AT" and "de" both to
// "de-Latn". Comparing this pair matches a region to the file for its
// language without mixing up scripts. Returns null for a tag Intl rejects.
function languageAndScript(tag: string): string | null {
  try {
    const locale = new Intl.Locale(tag).maximize()
    return `${locale.language}-${locale.script ?? ''}`
  } catch {
    return null
  }
}

/**
 * The language code the app shows. An explicit available setting wins; the
 * 'system' setting (or a code no longer available) takes the first OS
 * language with an exact match, then the first with the same language and
 * script; anything else is English.
 */
export function resolveLanguage(
  setting: string,
  systemLanguages: readonly string[],
  available: readonly string[],
): string {
  if (setting !== SYSTEM_LANGUAGE && available.includes(setting)) return setting
  for (const tag of systemLanguages) {
    const exact = available.find((code) => code.toLowerCase() === tag.toLowerCase())
    if (exact) return exact
    const wanted = languageAndScript(tag)
    if (!wanted) continue
    const sameScript = available.find((code) => languageAndScript(code) === wanted)
    if (sameScript) return sameScript
  }
  return SOURCE_LANGUAGE
}

/** The stored `language` setting, reset to 'system' when it is not an available code. */
export function normalizeLanguageSetting(value: unknown, available: readonly string[]): string {
  return typeof value === 'string' && available.includes(value) ? value : SYSTEM_LANGUAGE
}
