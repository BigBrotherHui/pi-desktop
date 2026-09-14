import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  classifyProviderKey,
  countPathEntries,
  extractVersionLine,
  reportModelsReadFailure,
  reportPiStartFailure,
  summarizeProviders,
} from './diagnostics-report'
import { describePiStartFailure, PI_FALLBACK_BINARY_POSIX, type PiStartFailure } from './pi-binary-resolution'
import type { ModelsConfig } from '../shared/ipc-contracts'
import { PSEUDO_LANGUAGE, SOURCE_LANGUAGE } from '../shared/i18n/languages'

test('classifyProviderKey covers literal, env, shell, and missing keys', () => {
  const env = { OPENAI_KEY: 'sk-real', EMPTY_KEY: '' }
  assert.deepEqual(classifyProviderKey('sk-abc123', env), { keyState: 'literal' })
  assert.deepEqual(classifyProviderKey('$OPENAI_KEY', env), { keyState: 'env-set', envVar: 'OPENAI_KEY' })
  assert.deepEqual(classifyProviderKey('$MISSING_KEY', env), { keyState: 'env-missing', envVar: 'MISSING_KEY' })
  assert.deepEqual(classifyProviderKey('$EMPTY_KEY', env), { keyState: 'env-missing', envVar: 'EMPTY_KEY' })
  assert.deepEqual(classifyProviderKey('!op read secret', env), { keyState: 'shell' })
  assert.deepEqual(classifyProviderKey(undefined, env), { keyState: 'none' })
  assert.deepEqual(classifyProviderKey('   ', env), { keyState: 'none' })
  assert.deepEqual(classifyProviderKey(42, env), { keyState: 'none' })
})

test('summarizeProviders counts models and classifies each provider', () => {
  const config: ModelsConfig = {
    providers: {
      openai: { apiKey: '$OPENAI_KEY', models: [{ id: 'gpt-5' }, { id: 'gpt-5-mini' }] },
      local: { baseUrl: 'http://localhost:11434' },
    },
  }
  const rows = summarizeProviders(config, { OPENAI_KEY: 'x' })
  assert.deepEqual(rows, [
    { name: 'openai', modelCount: 2, keyState: 'env-set', envVar: 'OPENAI_KEY' },
    { name: 'local', modelCount: 0, keyState: 'none' },
  ])
})

test('summarizeProviders tolerates null and non-object provider entries', () => {
  const config = {
    providers: { broken: null, alsoBroken: 'oops', ok: { apiKey: 'sk-x' } },
  } as unknown as ModelsConfig
  assert.deepEqual(summarizeProviders(config, {}), [
    { name: 'broken', modelCount: 0, keyState: 'none' },
    { name: 'alsoBroken', modelCount: 0, keyState: 'none' },
    { name: 'ok', modelCount: 0, keyState: 'literal' },
  ])
})

test('extractVersionLine takes the first non-empty line', () => {
  assert.equal(extractVersionLine('0.31.0\n'), '0.31.0')
  assert.equal(extractVersionLine('\n  pi 0.31.0 \nextra noise'), 'pi 0.31.0')
  assert.equal(extractVersionLine('   '), null)
  assert.equal(extractVersionLine(''), null)
})

test('reportModelsReadFailure withholds parse detail that can quote file content', () => {
  assert.equal(
    reportModelsReadFailure('models.json', {
      kind: 'invalid-syntax',
      format: 'json',
      detail: 'Unexpected token s, ..."apiKey": sk-live-ab"...',
    }),
    'models.json is not valid JSON',
  )
  assert.equal(
    reportModelsReadFailure('models.yml', {
      kind: 'invalid-syntax',
      format: 'yaml',
      detail: 'Nested mappings are not allowed at line 3:\n\n    apiKey: sk-live-abcdef: oops\n            ^',
    }),
    'models.yml is not valid YAML',
  )
})

test('reportModelsReadFailure keeps safe detail', () => {
  assert.equal(
    reportModelsReadFailure('models.json', { kind: 'missing-providers' }),
    'models.json is not a valid models config (missing "providers")',
  )
  assert.equal(
    reportModelsReadFailure('models.json', { kind: 'unreadable', detail: 'EACCES: permission denied' }),
    'Could not read models.json: EACCES: permission denied',
  )
})

test('reportModelsReadFailure does not depend on the interface language', async () => {
  const { i18n } = await import('../shared/i18n')
  await i18n.changeLanguage(PSEUDO_LANGUAGE)
  try {
    assert.equal(
      reportModelsReadFailure('models.json', { kind: 'invalid-syntax', format: 'json', detail: 'apiKey: sk-live' }),
      'models.json is not valid JSON',
    )
  } finally {
    await i18n.changeLanguage(SOURCE_LANGUAGE)
  }
})

test('reportPiStartFailure stays English under the pseudo-language', async () => {
  const { i18n, t } = await import('../shared/i18n')
  const notFound: PiStartFailure = {
    kind: 'pi-not-found',
    resolution: {
      script: PI_FALLBACK_BINARY_POSIX,
      useNode: false,
      needsShell: false,
      source: 'fallback',
      found: false,
      rejectedOverride: null,
      pathEnv: '',
    },
  }
  const node = '/usr/bin/node'
  const nodeMissing: PiStartFailure = { kind: 'node-not-found', node }
  await i18n.changeLanguage(PSEUDO_LANGUAGE)
  try {
    const notFoundReport = reportPiStartFailure(notFound) ?? ''
    assert.match(notFoundReport, /^Pi binary not found\. /)
    assert.match(notFoundReport, /Settings > Agent Configuration > Agent Installation\.$/)
    assert.equal(
      reportPiStartFailure(nodeMissing),
      `Node binary not found at resolved path:\n  ${node}\n\nPi's .js entry point requires Node. ` +
        'Install Node from https://nodejs.org or set the NODE env var to your Node binary path.',
    )
    // The UI rendering of the same failure is in the interface language.
    assert.notEqual(describePiStartFailure(nodeMissing, t), reportPiStartFailure(nodeMissing))
  } finally {
    await i18n.changeLanguage(SOURCE_LANGUAGE)
  }
  assert.equal(reportPiStartFailure(null), null)
})

test('countPathEntries splits on the platform delimiter and drops blanks', () => {
  assert.equal(countPathEntries('/usr/bin:/usr/local/bin::/opt/bin', false), 3)
  assert.equal(countPathEntries('C:\\Windows;C:\\Tools;', true), 2)
  assert.equal(countPathEntries('', false), 0)
})
