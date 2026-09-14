// The renderer sends its computed body background (always `rgb()`/`rgba()`
// from getComputedStyle) so the native window background matches the theme
// in areas the page has not painted yet, such as live-resize edges on Windows
// and macOS. Only that form is accepted: Electron reads 8-digit hex as ARGB,
// not CSS RGBA, so hex would flip alpha and red.
const RGB_COLOR = /^rgba?\((\d{1,3}), (\d{1,3}), (\d{1,3})(?:, (0|1|0?\.\d+))?\)$/
const MAX_CHANNEL = 255

export function toWindowBackgroundColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = RGB_COLOR.exec(value)
  if (!match) return null
  const channels = match.slice(1, 4).map(Number)
  if (channels.some((channel) => channel > MAX_CHANNEL)) return null
  return value
}
