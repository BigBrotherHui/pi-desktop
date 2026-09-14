import type { LocaleTree } from './locale-checks'

const ACCENTED: Readonly<Record<string, string>> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ',
  n: 'ñ', o: 'ö', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'û', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Á', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Î', J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ',
  N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Û', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
}

// Placeholders and <Trans> tags must survive so interpolation and rich text
// still work. split() with a capture group keeps them at odd indexes.
const PROTECTED_PARTS = /(\{\{[^}]*\}\}|<[^>]*>)/
// Longer languages (German, Finnish) run about 30% longer than English.
const EXPANSION_RATIO = 0.35
const PADDING_CHAR = '~'

/**
 * Test-language form of a string: "Settings" becomes "[Šéţţîñĝš ~~~]".
 * Text on screen without brackets was never translated; cut-off text shows
 * where a longer language breaks the layout.
 */
export function pseudoLocalize(text: string): string {
  if (text === '') return text
  const accented = text
    .split(PROTECTED_PARTS)
    .map((part, index) => (index % 2 === 1 ? part : [...part].map((char) => ACCENTED[char] ?? char).join('')))
    .join('')
  const padding = PADDING_CHAR.repeat(Math.ceil(text.length * EXPANSION_RATIO))
  return `[${accented} ${padding}]`
}

/**
 * Deep copy of a locale tree with every string value run through
 * `pseudoLocalize`. Keys are left exactly as they are, so plural suffixes
 * (`_one`, `_other`) and context variants (`_global`, `_workspace`) keep
 * matching the code that looks them up.
 */
export function pseudoLocalizeTree<T extends LocaleTree>(tree: T): T {
  const result: LocaleTree = {}
  for (const [key, value] of Object.entries(tree)) {
    result[key] = typeof value === 'string' ? pseudoLocalize(value) : pseudoLocalizeTree(value)
  }
  return result as T
}
