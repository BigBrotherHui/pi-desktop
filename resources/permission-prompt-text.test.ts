import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fillTemplate, loadPermissionPromptText } from './permission-prompt-text'

function localesWith(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pi-desktop-locales-'))
  for (const [language, content] of Object.entries(files)) {
    mkdirSync(join(dir, language))
    writeFileSync(join(dir, language, 'translation.json'), JSON.stringify(content))
  }
  return dir
}

// A valid code with no language file (the pseudo-language has none).
const LANGUAGE_WITHOUT_FILE = 'en-XA'

const ENGLISH = {
  permissions: { prompt: { title: 'Allow {{tool}}?', body: '{{agent}} wants to run {{tool}}.', target: 'Target: {{path}}', command: 'Command: {{command}}' } },
}

test('reads the chosen language', () => {
  const dir = localesWith({ en: ENGLISH, de: { permissions: { prompt: { title: '{{tool}} erlauben?', body: 'b', target: 't', command: 'c' } } } })
  assert.equal(loadPermissionPromptText(dir, 'de').title, '{{tool}} erlauben?')
})

test('falls back to English for each missing or empty value', () => {
  const dir = localesWith({ en: ENGLISH, de: { permissions: { prompt: { title: '', body: 'Text' } } } })
  const text = loadPermissionPromptText(dir, 'de')
  assert.equal(text.title, 'Allow {{tool}}?')
  assert.equal(text.body, 'Text')
  assert.equal(text.command, 'Command: {{command}}')
})

test('a missing language file uses English', () => {
  const dir = localesWith({ en: ENGLISH })
  assert.equal(loadPermissionPromptText(dir, LANGUAGE_WITHOUT_FILE).title, 'Allow {{tool}}?')
})

test('no language (older GUI) reads English', () => {
  const dir = localesWith({ en: ENGLISH })
  assert.equal(loadPermissionPromptText(dir, null).title, 'Allow {{tool}}?')
})

test('no locales folder uses placeholder-only templates', () => {
  assert.deepEqual(loadPermissionPromptText(null, 'en'), {
    title: '{{tool}}?',
    body: '{{agent}}: {{tool}}',
    target: '{{path}}',
    command: '{{command}}',
  })
})

test('a language code with path parts is not read', () => {
  const dir = localesWith({ en: ENGLISH })
  assert.equal(loadPermissionPromptText(dir, '../en').title, 'Allow {{tool}}?')
})

test('fillTemplate replaces known names and keeps $ patterns literal', () => {
  assert.equal(fillTemplate('Run {{tool}} on {{path}}', { tool: 'bash', path: '$&' }), 'Run bash on $&')
  assert.equal(fillTemplate('{{unknown}} stays', {}), '{{unknown}} stays')
})
