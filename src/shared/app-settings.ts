import type { AgentEngine, AppSettings } from './ipc-contracts'
import { DEFAULT_SETTINGS } from './default-settings'
import { normalizeLanguageSetting } from './i18n/resolve'
import { isPermissionMode } from './permission-mode'

const ENGINE_SETTINGS: readonly AgentEngine[] = ['auto', 'pi', 'omp']

function isEngineSetting(value: unknown): value is AgentEngine {
  return typeof value === 'string' && (ENGINE_SETTINGS as readonly string[]).includes(value)
}

/**
 * Merge a settings file over the defaults and replace every enumerated value
 * the file may hold in a form no build writes (hand edits, other versions), so
 * the renderer never indexes a lookup with an unknown key.
 */
export function normalizeStoredSettings(stored: Record<string, unknown>, languages: readonly string[]): AppSettings {
  const merged: AppSettings = { ...DEFAULT_SETTINGS, ...stored }
  if (!isEngineSetting(merged.piEngine)) merged.piEngine = DEFAULT_SETTINGS.piEngine
  if (!isPermissionMode(merged.permissionMode)) merged.permissionMode = DEFAULT_SETTINGS.permissionMode
  merged.language = normalizeLanguageSetting(merged.language, languages)
  return merged
}
