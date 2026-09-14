import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bootLanguageFrom, languagePickerOptions } from './i18n'
import { PSEUDO_LANGUAGE, SOURCE_LANGUAGE, SYSTEM_LANGUAGE } from '../../shared/i18n/languages'

test('bootLanguageFrom accepts a stored available code', () => {
  assert.equal(bootLanguageFrom(SOURCE_LANGUAGE), SOURCE_LANGUAGE)
  assert.equal(bootLanguageFrom(PSEUDO_LANGUAGE), PSEUDO_LANGUAGE)
})

test('bootLanguageFrom falls back to English for missing or unknown values', () => {
  assert.equal(bootLanguageFrom(null), SOURCE_LANGUAGE)
  assert.equal(bootLanguageFrom('xx-unknown'), SOURCE_LANGUAGE)
})

test('the picker starts with System default and names the resolved system language', () => {
  const options = languagePickerOptions({ systemLanguages: ['fr-FR'], pseudoLanguageEnabled: false })
  assert.deepEqual(options, [
    { value: SYSTEM_LANGUAGE, label: 'System default (English)' },
    { value: SOURCE_LANGUAGE, label: 'English' },
  ])
})

test('the picker offers the pseudo-language only when enabled', () => {
  const values = languagePickerOptions({ systemLanguages: [], pseudoLanguageEnabled: true }).map((o) => o.value)
  assert.ok(values.includes(PSEUDO_LANGUAGE))
  const plain = languagePickerOptions({ systemLanguages: [], pseudoLanguageEnabled: false }).map((o) => o.value)
  assert.ok(!plain.includes(PSEUDO_LANGUAGE))
})
