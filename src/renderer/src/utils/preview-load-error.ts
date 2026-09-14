/**
 * Data shape for a file/image preview load or save failure. Keeping the
 * outcome as data (instead of a translated string built inside the effect)
 * lets the JSX translate it at render time, so the effect that produced it
 * never needs the `t` function in its dependency array — a language change
 * cannot re-run the load and discard unsaved edits or refetch the file.
 */
export type PreviewLoadError<GenericKind extends string> =
  | { kind: 'message'; text: string }
  | { kind: GenericKind }

/**
 * Maps a caught value to preview-error data: an `Error` keeps its own
 * message verbatim, anything else falls back to the given generic failure
 * kind (translated by the caller at render time).
 */
export function toPreviewLoadError<GenericKind extends string>(
  err: unknown,
  genericKind: GenericKind
): PreviewLoadError<GenericKind> {
  return err instanceof Error ? { kind: 'message', text: err.message } : { kind: genericKind }
}
