import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS } from '../../../shared/default-settings'
import { BUILTIN_THEMES } from '../themes'
import {
  applyThemeSettings,
  getAppliedThemeId,
  registerThemes,
  resolveSystemThemeSlot,
  resolveThemeId,
  subscribeAppliedTheme,
} from './theme'

// theme.ts reads the OS preference through matchMedia and writes CSS vars to
// <html>; node has neither, so stub the minimum surface those calls touch.
let prefersDark = false
Object.assign(globalThis, {
  window: { matchMedia: () => ({ matches: prefersDark }) },
  document: {
    documentElement: {
      style: { setProperty() {}, removeProperty() {}, colorScheme: '' },
      classList: { toggle() {} },
    },
  },
})

const SYSTEM_WITH_GRUVBOX = { theme: 'system', systemLightTheme: 'breeze-light', systemDarkTheme: 'gruvbox' }

function builtinFile(id: string) {
  const theme = BUILTIN_THEMES.find((candidate) => candidate.id === id)
  assert.ok(theme, `missing built-in theme ${id}`)
  return theme.file
}

test('System is the default theme', () => {
  assert.equal(DEFAULT_SETTINGS.theme, 'system')
})

test('the default System themes are built-in themes of the matching kind', () => {
  assert.equal(builtinFile(DEFAULT_SETTINGS.systemLightTheme).kind, 'light')
  assert.equal(builtinFile(DEFAULT_SETTINGS.systemDarkTheme).kind, 'dark')
})

test('a concrete theme id resolves to itself', () => {
  assert.equal(resolveThemeId('nord'), 'nord')
})

test('System resolves to the chosen light theme when the OS prefers light', () => {
  prefersDark = false
  applyThemeSettings(SYSTEM_WITH_GRUVBOX)
  assert.equal(resolveThemeId('system'), 'breeze-light')
})

test('System resolves to the chosen dark theme when the OS prefers dark', () => {
  prefersDark = true
  applyThemeSettings(SYSTEM_WITH_GRUVBOX)
  assert.equal(resolveThemeId('system'), 'gruvbox')
})

test('a missing System theme falls back to the built-in default for its slot', () => {
  assert.equal(resolveSystemThemeSlot('dark', 'deleted-theme'), DEFAULT_SETTINGS.systemDarkTheme)
})

test('a System theme of the other kind falls back to the built-in default for its slot', () => {
  assert.equal(resolveSystemThemeSlot('light', 'gruvbox'), DEFAULT_SETTINGS.systemLightTheme)
})

test('a registered user theme of the matching kind fills a System slot', () => {
  registerThemes([{ id: 'my-dusk', file: { ...builtinFile('gruvbox'), name: 'My Dusk' } }])
  assert.equal(resolveSystemThemeSlot('dark', 'my-dusk'), 'my-dusk')
})

test('applying System notifies subscribers with the theme it resolved to', () => {
  prefersDark = true
  applyThemeSettings({ ...SYSTEM_WITH_GRUVBOX, theme: 'light' })
  const notified: string[] = []
  const unsubscribe = subscribeAppliedTheme(() => notified.push(getAppliedThemeId() ?? ''))
  applyThemeSettings(SYSTEM_WITH_GRUVBOX)
  unsubscribe()
  assert.deepEqual(notified, ['gruvbox'])
  assert.equal(getAppliedThemeId(), 'gruvbox')
})
