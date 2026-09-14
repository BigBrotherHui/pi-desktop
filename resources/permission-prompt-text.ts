/**
 * Permission prompt text for the bundled Pi extension.
 *
 * The extension runs inside the Pi (or OMP) process and cannot import
 * i18next, so this reads the app's language files directly. The GUI passes
 * the folder and the resolved language in PI_DESKTOP_LOCALES_DIR and
 * PI_DESKTOP_LANGUAGE.
 *
 * Must import only from `node:*` — no Electron, no Pi APIs.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const PERMISSION_PROMPT_KEYS = ['title', 'body', 'target', 'command'] as const
export type PermissionPromptKey = (typeof PERMISSION_PROMPT_KEYS)[number]
export type PermissionPromptText = Record<PermissionPromptKey, string>

const LOCALE_FILE_NAME = 'translation.json'
const FALLBACK_LANGUAGE = 'en'
// BCP 47 shape only, so a language value can never name a path outside the folder.
const LANGUAGE_CODE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/
// Used when no language file can be read. No English words (the English file
// is the single source for those), but every value the user must see to
// decide is still shown.
const PLACEHOLDER_TEMPLATES: PermissionPromptText = {
  title: '{{tool}}?',
  body: '{{agent}}: {{tool}}',
  target: '{{path}}',
  command: '{{command}}',
}

function readPromptSection(localesDir: string, language: string): Partial<PermissionPromptText> {
  if (!LANGUAGE_CODE.test(language)) return {}
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(localesDir, language, LOCALE_FILE_NAME), 'utf-8'))
    const section = (parsed as { permissions?: { prompt?: unknown } } | null)?.permissions?.prompt
    if (!section || typeof section !== 'object') return {}
    const text: Partial<PermissionPromptText> = {}
    for (const key of PERMISSION_PROMPT_KEYS) {
      const value = (section as Record<string, unknown>)[key]
      if (typeof value === 'string' && value !== '') text[key] = value
    }
    return text
  } catch {
    return {}
  }
}

/** Prompt templates in `language` (null = English), with English for each missing value. */
export function loadPermissionPromptText(localesDir: string | null, language: string | null): PermissionPromptText {
  if (!localesDir) return { ...PLACEHOLDER_TEMPLATES }
  const english = readPromptSection(localesDir, FALLBACK_LANGUAGE)
  const chosen = language === null || language === FALLBACK_LANGUAGE ? {} : readPromptSection(localesDir, language)
  return { ...PLACEHOLDER_TEMPLATES, ...english, ...chosen }
}

/** Fill {{name}} placeholders. A function replacer keeps `$&` in values literal. */
export function fillTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => values[name] ?? match)
}
