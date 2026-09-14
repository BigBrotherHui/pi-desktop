/**
 * Pure helpers for the extension-UI dialog (issue #61).
 *
 * Extensions such as pi-ask-user pack a whole question into the dialog title
 * ("<question>\n\nContext:\n<context>"). The first line is the heading; the
 * rest is body text whose line breaks must survive.
 */

const LINE_BREAK = '\n'

/**
 * Chord that hides or shows the pending prompt, mirroring Pi's terminal UI.
 * Matched on the physical key: on macOS Option+O reports `key` as a symbol.
 */
export const DIALOG_TOGGLE_CODE = 'KeyO'
export const DIALOG_TOGGLE_LABEL = 'Alt+O'

export interface PromptText {
  heading: string
  body: string
}

/** Split multi-line prompt text into a one-line heading and the remaining body. */
export function splitPromptText(text: string): PromptText {
  const trimmed = text.trim()
  const breakAt = trimmed.indexOf(LINE_BREAK)
  if (breakAt === -1) return { heading: trimmed, body: '' }
  return {
    heading: trimmed.slice(0, breakAt).trim(),
    body: trimmed.slice(breakAt + LINE_BREAK.length).trim(),
  }
}

export interface ToggleKeyEvent {
  code: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

/** True for the bare Alt+O chord (no other modifier) on any keyboard layout. */
export function isDialogToggleKey(event: ToggleKeyEvent): boolean {
  return (
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.code === DIALOG_TOGGLE_CODE
  )
}
