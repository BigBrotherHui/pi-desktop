import type { PermissionMode } from './ipc-contracts'

/** Every permission mode, in the order the UI lists them. */
export const PERMISSION_MODES: readonly PermissionMode[] = ['plan-readonly', 'ask-edits', 'ask-commands', 'trusted']

export function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === 'string' && (PERMISSION_MODES as readonly string[]).includes(value)
}
