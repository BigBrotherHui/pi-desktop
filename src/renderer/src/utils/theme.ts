import type { AppSettings } from '../../../shared/ipc-contracts'
import { DEFAULT_SETTINGS } from '../../../shared/default-settings'
import type { ThemeFile } from '../../../shared/theme/theme-file'
import { resolveThemeVars } from '../../../shared/theme/resolve'
import { BUILTIN_THEMES } from '../themes'
import { applyThemeVars } from '../theme/engine'

export interface RegisteredTheme { id: string; file: ThemeFile }
export type ThemeKind = ThemeFile['kind']
export type ThemeSettings = Pick<AppSettings, 'theme' | 'systemLightTheme' | 'systemDarkTheme'>

export const SYSTEM_THEME_ID = 'system'
const FALLBACK_THEME_ID = 'dark'
const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'
const SYSTEM_THEME_DEFAULTS: Readonly<Record<ThemeKind, string>> = {
  light: DEFAULT_SETTINGS.systemLightTheme,
  dark: DEFAULT_SETTINGS.systemDarkTheme,
}

const BUILTIN_IDS = new Set(BUILTIN_THEMES.map((t) => t.id))
const registry = new Map<string, ThemeFile>(BUILTIN_THEMES.map((t) => [t.id, t.file]))
let appliedVarKeys: string[] = []
// The themes 'system' maps to, set by applyThemeSettings from the saved
// settings or the unsaved draft, so every applyTheme('system') honors them.
let systemThemes: Record<ThemeKind, string> = { ...SYSTEM_THEME_DEFAULTS }
let appliedThemeId: string | null = null
const appliedThemeListeners = new Set<() => void>()

// Additive: adds or updates the given themes. Use for a single fresh
// add/update (import, URL install, editor save) where nothing needs removing.
export function registerThemes(themes: ReadonlyArray<RegisteredTheme>): void {
  for (const theme of themes) registry.set(theme.id, theme.file)
}

// Authoritative reconcile against the full user-theme set from themes.list():
// drops every current user (non-built-in) entry, then re-adds the given ones,
// so a deleted or renamed-away theme leaves the dropdown without an app
// restart. Built-in entries are never touched.
export function setUserThemes(themes: ReadonlyArray<RegisteredTheme>): void {
  for (const id of [...registry.keys()]) {
    if (!BUILTIN_IDS.has(id)) registry.delete(id)
  }
  for (const theme of themes) registry.set(theme.id, theme.file)
}

export function getRegisteredThemes(): ReadonlyArray<RegisteredTheme> {
  return [...registry.entries()].map(([id, file]) => ({ id, file }))
}

let systemThemeWatched = false
let previewActive = false

// While a live preview owns the document's theme variables (the theme editor),
// external re-applies must yield or they overwrite the unsaved preview. The
// editor sets this for its lifetime; watchSystemTheme checks it.
export function setThemePreviewActive(active: boolean): void {
  previewActive = active
}

// Re-applies the theme when the OS light/dark preference changes while the
// app is open, but only when the currently-effective theme is 'system' and no
// live preview is in progress. Subscribes once for the app's lifetime;
// repeated calls are no-ops.
export function watchSystemTheme(getEffectiveThemeId: () => string): void {
  if (systemThemeWatched) return
  systemThemeWatched = true
  window.matchMedia(DARK_SCHEME_QUERY).addEventListener('change', () => {
    if (previewActive) return
    if (getEffectiveThemeId() === SYSTEM_THEME_ID) applyTheme(SYSTEM_THEME_ID)
  })
}

// A System slot keeps the user's choice only while it names a registered
// theme of the slot's kind. A deleted, renamed, or kind-flipped theme falls
// back to the built-in default, so 'system' never lands on a missing theme.
export function resolveSystemThemeSlot(kind: ThemeKind, themeId: string): string {
  return registry.get(themeId)?.kind === kind ? themeId : SYSTEM_THEME_DEFAULTS[kind]
}

// Turns 'system' into the concrete theme id for the current OS preference;
// any other id is already concrete.
export function resolveThemeId(themeId: string): string {
  if (themeId !== SYSTEM_THEME_ID) return themeId
  const kind: ThemeKind = window.matchMedia(DARK_SCHEME_QUERY).matches ? 'dark' : 'light'
  return resolveSystemThemeSlot(kind, systemThemes[kind])
}

export function applyTheme(themeId: string): void {
  const resolvedId = resolveThemeId(themeId)
  const id = registry.has(resolvedId) ? resolvedId : FALLBACK_THEME_ID
  const file = registry.get(id)!
  const html = document.documentElement
  appliedVarKeys = applyThemeVars(html, resolveThemeVars(file), appliedVarKeys)
  html.classList.toggle('light', file.kind === 'light')
  html.style.colorScheme = file.kind
  if (id === appliedThemeId) return
  appliedThemeId = id
  for (const listener of appliedThemeListeners) listener()
}

// Applies a theme settings snapshot (saved or unsaved draft), recording its
// System slots first so 'system' resolves to the user's light/dark choices.
export function applyThemeSettings(settings: ThemeSettings): void {
  systemThemes = { light: settings.systemLightTheme, dark: settings.systemDarkTheme }
  applyTheme(settings.theme)
}

// The concrete id of the theme on screen, for consumers that restyle on an
// OS light/dark switch, not only on a settings change. Shaped for
// useSyncExternalStore.
export function getAppliedThemeId(): string | null {
  return appliedThemeId
}

export function subscribeAppliedTheme(listener: () => void): () => void {
  appliedThemeListeners.add(listener)
  return () => {
    appliedThemeListeners.delete(listener)
  }
}

export function isLightTheme(themeId: string | null | undefined): boolean {
  if (!themeId) return false
  return registry.get(resolveThemeId(themeId))?.kind === 'light'
}
