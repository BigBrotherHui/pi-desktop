import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLanguageSetting, resolveLanguage } from './resolve'

const AVAILABLE = ['en', 'de', 'pt-BR', 'zh-Hans', 'zh-Hant']

test('an explicit available setting wins over the system languages', () => {
  assert.equal(resolveLanguage('de', ['pt-BR'], AVAILABLE), 'de')
})

test('system setting takes an exact match, case-insensitive', () => {
  assert.equal(resolveLanguage('system', ['PT-br'], AVAILABLE), 'pt-BR')
})

test('system setting falls back from a region to the same language', () => {
  assert.equal(resolveLanguage('system', ['de-AT'], AVAILABLE), 'de')
})

test('system setting maps Chinese regions to the matching script', () => {
  assert.equal(resolveLanguage('system', ['zh-TW'], AVAILABLE), 'zh-Hant')
  assert.equal(resolveLanguage('system', ['zh-CN'], AVAILABLE), 'zh-Hans')
})

test('system languages are tried in order', () => {
  assert.equal(resolveLanguage('system', ['fr-FR', 'de-DE', 'en-US'], AVAILABLE), 'de')
})

test('no match and invalid tags resolve to English', () => {
  assert.equal(resolveLanguage('system', ['fr-FR', 'not a tag!'], AVAILABLE), 'en')
  assert.equal(resolveLanguage('system', [], AVAILABLE), 'en')
})

test('a setting that is not available follows the system languages', () => {
  assert.equal(resolveLanguage('fr', ['de-DE'], AVAILABLE), 'de')
})

test('normalizeLanguageSetting keeps available codes and resets the rest to system', () => {
  assert.equal(normalizeLanguageSetting('de', AVAILABLE), 'de')
  assert.equal(normalizeLanguageSetting('system', AVAILABLE), 'system')
  assert.equal(normalizeLanguageSetting('fr', AVAILABLE), 'system')
  assert.equal(normalizeLanguageSetting(42, AVAILABLE), 'system')
  assert.equal(normalizeLanguageSetting(undefined, AVAILABLE), 'system')
})
