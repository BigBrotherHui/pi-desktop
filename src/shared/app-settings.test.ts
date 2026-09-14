import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeStoredSettings } from './app-settings'
import { DEFAULT_SETTINGS } from './default-settings'

const LANGUAGES = ['en']

test('normalizeStoredSettings keeps known values', () => {
  const settings = normalizeStoredSettings({ permissionMode: 'trusted', piEngine: 'omp', language: 'en' }, LANGUAGES)
  assert.equal(settings.permissionMode, 'trusted')
  assert.equal(settings.piEngine, 'omp')
  assert.equal(settings.language, 'en')
})

test('normalizeStoredSettings falls back to defaults for unknown values', () => {
  const settings = normalizeStoredSettings({ permissionMode: 'yolo', piEngine: 'codex', language: 'xx' }, LANGUAGES)
  assert.equal(settings.permissionMode, DEFAULT_SETTINGS.permissionMode)
  assert.equal(settings.piEngine, 'auto')
  assert.equal(settings.language, DEFAULT_SETTINGS.language)
})

test('normalizeStoredSettings fills missing keys from the defaults', () => {
  const settings = normalizeStoredSettings({}, LANGUAGES)
  assert.deepEqual(settings, DEFAULT_SETTINGS)
})
