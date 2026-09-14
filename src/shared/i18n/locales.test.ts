import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkLocale, type LocaleTree } from './locale-checks'
import { BUNDLED_LANGUAGES, LANGUAGE_RESOURCES } from './resources'
import { SOURCE_LANGUAGE } from './languages'

const ENGLISH: LocaleTree = {
  language: { nativeName: 'English' },
  files: { count_one: 'One file', count_other: '{{count}} files' },
  help: 'See <link>docs</link> for {{topic}}',
}

test('the bundled English file passes', () => {
  const english = LANGUAGE_RESOURCES.en.translation as LocaleTree
  assert.deepEqual(checkLocale(SOURCE_LANGUAGE, english, english), [])
})

test('every bundled language passes', () => {
  const english = LANGUAGE_RESOURCES.en.translation as LocaleTree
  for (const code of BUNDLED_LANGUAGES) {
    const tree = LANGUAGE_RESOURCES[code as keyof typeof LANGUAGE_RESOURCES].translation as LocaleTree
    assert.deepEqual(checkLocale(code, tree, english), [], code)
  }
})

test('English may not have empty values', () => {
  const english: LocaleTree = { ...ENGLISH, help: '' }
  assert.deepEqual(checkLocale('en', english, english), ['en: help is empty'])
})

test('a translation may leave values empty', () => {
  const german: LocaleTree = {
    language: { nativeName: 'Deutsch' },
    files: { count_one: '', count_other: '' },
    help: '',
  }
  assert.deepEqual(checkLocale('de', german, ENGLISH), [])
})

test('missing and unknown keys are reported', () => {
  const german: LocaleTree = {
    language: { nativeName: 'Deutsch' },
    files: { count_one: 'Eine Datei', count_other: '{{count}} Dateien' },
    extra: 'x',
  }
  assert.deepEqual(checkLocale('de', german, ENGLISH), ['de: missing key help', 'de: unknown key extra'])
})

test('plural keys must match the language plural categories', () => {
  const russian: LocaleTree = {
    language: { nativeName: 'Русский' },
    files: { count_one: '{{count}} файл', count_other: '{{count}} файла' },
    help: 'См. <link>документацию</link> о {{topic}}',
  }
  assert.deepEqual(checkLocale('ru', russian, ENGLISH), ['ru: files.count needs plural forms few, many, one, other'])
  const chinese: LocaleTree = {
    language: { nativeName: '简体中文' },
    files: { count_other: '{{count}} 个文件' },
    help: '参见 <link>文档</link> 了解 {{topic}}',
  }
  assert.deepEqual(checkLocale('zh-Hans', chinese, ENGLISH), [])
})

test('unknown placeholders and changed tags are reported', () => {
  const german: LocaleTree = {
    language: { nativeName: 'Deutsch' },
    files: { count_one: 'Eine Datei', count_other: '{{total}} Dateien' },
    help: 'Siehe Doku zu {{topic}}',
  }
  assert.deepEqual(checkLocale('de', german, ENGLISH), [
    'de: files.count_other uses unknown placeholder {{total}}',
    'de: help must keep the tags link',
  ])
})

test('the native name may not be empty', () => {
  const german: LocaleTree = { ...ENGLISH, language: { nativeName: '' } }
  assert.deepEqual(checkLocale('de', german, ENGLISH), ['de: language.nativeName is empty'])
})
