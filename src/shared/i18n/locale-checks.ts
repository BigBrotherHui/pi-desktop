import { SOURCE_LANGUAGE } from './languages'

export type LocaleTree = { [key: string]: string | LocaleTree }

const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const
const PLURAL_SUFFIX = new RegExp(`_(${PLURAL_CATEGORIES.join('|')})$`)
// {{name}} and {{name, format}} both name the value "name".
const PLACEHOLDER = /\{\{\s*([^,}\s]+)[^}]*\}\}/g
// <link>, </link>, <1/>: the tag name is what <Trans> matches on.
const TAG = /<\/?([A-Za-z0-9]+)\s*\/?>/g
const NATIVE_NAME_KEY = 'language.nativeName'
const NO_FORM = ''

export function flattenLocale(tree: LocaleTree, prefix = ''): Map<string, string> {
  const flat = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') flat.set(path, value)
    else for (const [nestedKey, nestedValue] of flattenLocale(value, path)) flat.set(nestedKey, nestedValue)
  }
  return flat
}

// base key -> (plural category, or NO_FORM for a plain key) -> text
function groupByBase(flat: Map<string, string>): Map<string, Map<string, string>> {
  const groups = new Map<string, Map<string, string>>()
  for (const [key, text] of flat) {
    const match = key.match(PLURAL_SUFFIX)
    const base = match ? key.slice(0, -match[0].length) : key
    const form = match ? match[1] : NO_FORM
    if (!groups.has(base)) groups.set(base, new Map())
    groups.get(base)!.set(form, text)
  }
  return groups
}

function namesIn(text: string, pattern: RegExp): Set<string> {
  return new Set([...text.matchAll(pattern)].map((match) => match[1]))
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item))
}

function sorted(set: Set<string>): string {
  return [...set].sort().join(', ')
}

/**
 * Problems in one language file compared with English. A translation may
 * leave a value empty (the app then shows English); English may not.
 */
export function checkLocale(language: string, tree: LocaleTree, english: LocaleTree): string[] {
  const problems: string[] = []
  const englishGroups = groupByBase(flattenLocale(english))
  const flat = flattenLocale(tree)
  const groups = groupByBase(flat)
  const pluralCategories = new Set<string>(new Intl.PluralRules(language).resolvedOptions().pluralCategories)

  for (const base of englishGroups.keys()) {
    if (!groups.has(base)) problems.push(`${language}: missing key ${base}`)
  }

  for (const [base, forms] of groups) {
    const englishForms = englishGroups.get(base)
    if (!englishForms) {
      problems.push(`${language}: unknown key ${base}`)
      continue
    }

    const isPlural = !englishForms.has(NO_FORM)
    const formNames = new Set(forms.keys())
    if (isPlural && !sameSet(formNames, pluralCategories)) {
      problems.push(`${language}: ${base} needs plural forms ${sorted(pluralCategories)}`)
    } else if (!isPlural && (formNames.size !== 1 || !formNames.has(NO_FORM))) {
      problems.push(`${language}: ${base} must not have plural forms`)
    }

    const englishText = [...englishForms.values()].join(' ')
    const allowedPlaceholders = namesIn(englishText, PLACEHOLDER)
    const englishTags = namesIn(englishText, TAG)
    for (const [form, text] of forms) {
      const key = form === NO_FORM ? base : `${base}_${form}`
      if (text === '') {
        if (language === SOURCE_LANGUAGE || key === NATIVE_NAME_KEY) problems.push(`${language}: ${key} is empty`)
        continue
      }
      for (const name of namesIn(text, PLACEHOLDER)) {
        if (!allowedPlaceholders.has(name)) problems.push(`${language}: ${key} uses unknown placeholder {{${name}}}`)
      }
      if (!sameSet(namesIn(text, TAG), englishTags)) {
        problems.push(`${language}: ${key} must keep the tags ${sorted(englishTags)}`)
      }
    }
  }

  return problems
}
