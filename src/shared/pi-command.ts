import { t } from './i18n'

/** A command exposed by Pi via the RPC `get_commands` request. */
export interface PiCommand {
  name: string
  description: string
  source: 'skill' | 'prompt' | 'extension' | string
}

/**
 * Source used for Pi built-in commands that map to a GUI action rather than
 * being inserted as text. Pi's RPC only expands `/skill:` and `/template` from
 * typed input, so these built-ins run the equivalent GUI action directly.
 */
export const BUILTIN_SOURCE = 'builtin'

/** Pi lists skills under their invocation token: "skill:<name>". */
export const SKILL_COMMAND_PREFIX = 'skill:'

/** Bare skill name, with the "skill:" invocation prefix removed if present. */
export function skillDisplayName(name: string): string {
  return name.startsWith(SKILL_COMMAND_PREFIX) ? name.slice(SKILL_COMMAND_PREFIX.length) : name
}

/**
 * Name shown in command lists. Skills drop the redundant "skill:" prefix (the
 * source badge already says it); GUI built-ins show their slash form.
 */
export function commandDisplayName(cmd: PiCommand): string {
  if (cmd.source === 'skill') return skillDisplayName(cmd.name)
  if (cmd.source === BUILTIN_SOURCE) return `/${cmd.name}`
  return cmd.name
}

/** Command sources that get their own group, in display order. */
const GROUP_SOURCES = ['skill', 'prompt', BUILTIN_SOURCE, 'extension'] as const

/** Group id of the catch-all for commands from any other source. */
const OTHER_GROUP_ID = 'other'

export type CommandGroupId = (typeof GROUP_SOURCES)[number] | typeof OTHER_GROUP_ID

/** The display label for one command group, in the interface language. */
function groupLabel(id: CommandGroupId): string {
  switch (id) {
    case 'skill':
      return t('commandGroups.skills')
    case 'prompt':
      return t('commandGroups.prompts')
    case BUILTIN_SOURCE:
      return t('commandGroups.commands')
    case 'extension':
      return t('commandGroups.extensions')
    case OTHER_GROUP_ID:
      return t('commandGroups.other')
  }
}

export interface CommandGroup {
  /** Stable group id (the command source, or the catch-all id), for React keys. */
  id: CommandGroupId
  label: string
  items: PiCommand[]
}

/**
 * Filter commands for the slash palette. A single leading "/" in the query is
 * ignored so typing "/rev" matches the same as "rev". Matching is
 * case-insensitive across name and description.
 */
export function filterCommands(commands: PiCommand[], query: string): PiCommand[] {
  const q = query.replace(/^\//, '').trim().toLowerCase()
  if (!q) return commands
  return commands.filter(
    (c) =>
      c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
  )
}

/**
 * True while the composer holds a bare slash-command token (`/` followed by a
 * command name, no whitespace yet). Once whitespace appears the user is typing
 * arguments after a chosen command, so command suggestions must not trigger.
 */
export function isSlashCommandToken(value: string): boolean {
  return value.startsWith('/') && !/\s/.test(value)
}

/** Token inserted into the composer when a skill/prompt/extension is chosen. */
export function invocationToken(name: string, source: string): string {
  if (source === 'skill') return `/${SKILL_COMMAND_PREFIX}${skillDisplayName(name)} `
  return `/${name} `
}

/**
 * Group commands by source in display order (empty groups dropped), with an
 * "Other" catch-all for any unexpected source so nothing is silently hidden.
 * `flat` matches the visual order — keyboard navigation indexes it.
 */
export function groupCommands(results: PiCommand[]): {
  grouped: CommandGroup[]
  flat: PiCommand[]
} {
  const known = new Set<string>(GROUP_SOURCES)
  const groups: Array<{ id: CommandGroupId; items: PiCommand[] }> = [
    ...GROUP_SOURCES.map((source) => ({ id: source, items: results.filter((r) => r.source === source) })),
    { id: OTHER_GROUP_ID, items: results.filter((r) => !known.has(r.source)) },
  ]
  const grouped = groups
    .filter((g) => g.items.length > 0)
    .map((g) => ({ id: g.id, label: groupLabel(g.id), items: g.items }))
  return { grouped, flat: grouped.flatMap((g) => g.items) }
}
