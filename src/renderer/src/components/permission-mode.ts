import type { PermissionMode } from '../../../shared/ipc-contracts'
import { t } from '../../../shared/i18n'

export const DEFAULT_PERMISSION_MODE: PermissionMode = 'ask-edits'

export const PERMISSION_MODE_OPTIONS: Array<{
  value: PermissionMode
  tone: 'safe' | 'review' | 'command' | 'trusted'
}> = [
  { value: 'plan-readonly', tone: 'safe' },
  { value: 'ask-edits', tone: 'review' },
  { value: 'ask-commands', tone: 'command' },
  { value: 'trusted', tone: 'trusted' },
]

const PERMISSION_MODE_VALUES = new Set<PermissionMode>(
  PERMISSION_MODE_OPTIONS.map((option) => option.value)
)

export function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === 'string' && PERMISSION_MODE_VALUES.has(value as PermissionMode)
}

/**
 * Explicit key maps so `i18next-cli` can resolve every literal key (the
 * lookup value has a union type it cannot trace through a template literal).
 * Components build `t(PERMISSION_MODE_LABEL_KEYS[option.value])` with their
 * own `useTranslation()` hook's `t` so the text re-renders on language change.
 */
export const PERMISSION_MODE_LABEL_KEYS = {
  'plan-readonly': 'permissionMode.plan-readonly.label',
  'ask-edits': 'permissionMode.ask-edits.label',
  'ask-commands': 'permissionMode.ask-commands.label',
  trusted: 'permissionMode.trusted.label',
} as const satisfies Record<PermissionMode, string>

export const PERMISSION_MODE_DESCRIPTION_KEYS = {
  'plan-readonly': 'permissionMode.plan-readonly.description',
  'ask-edits': 'permissionMode.ask-edits.description',
  'ask-commands': 'permissionMode.ask-commands.description',
  trusted: 'permissionMode.trusted.description',
} as const satisfies Record<PermissionMode, string>

export function getPermissionModeLabel(mode: PermissionMode): string {
  return t(PERMISSION_MODE_LABEL_KEYS[mode])
}

export function getPermissionModeDescription(mode: PermissionMode): string {
  return t(PERMISSION_MODE_DESCRIPTION_KEYS[mode])
}
