import { realpathSync } from 'fs'
import { platform } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'

/**
 * The only file the main window is allowed to load/navigate to in production,
 * and the only frame URL that privileged IPC accepts as a sender. Its preload
 * exposes terminal + full IPC, so this must stay pinned to the packaged renderer.
 */
export const RENDERER_INDEX_PATH = join(__dirname, '../renderer/index.html')

function pathsEqual(a: string, b: string): boolean {
  return platform() === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

/** file: URL pathname → real filesystem path (strip the /C:/ drive slash). */
function fileUrlPathToFsPath(pathname: string): string {
  return decodeURIComponent(pathname).replace(/^\/([A-Za-z]:\/)/, '$1')
}

/**
 * True when `frameUrl` belongs to the app's own renderer: the dev server's exact
 * origin in development, or the packaged index file (ignoring hash/query used by
 * client-side routing) in production. Parses the URL so a look-alike host or a
 * sibling local file cannot pass a naive string-prefix check.
 *
 * The production comparison resolves both sides to real paths before comparing:
 * a portable (self-extracting) launch receives an 8.3 short exe path, so
 * __dirname says ADMINI~1 while the frame URL reports the long form Electron's
 * loadFile resolved to — a lexical compare fails and every trusted-sender IPC
 * call dies with "Unauthorized IPC sender".
 */
export function isTrustedRendererUrl(
  frameUrl: string,
  opts: { devServerUrl?: string; rendererIndexPath: string }
): boolean {
  let parsed: URL
  try {
    parsed = new URL(frameUrl)
  } catch {
    return false
  }
  if (opts.devServerUrl) {
    try {
      return parsed.origin === new URL(opts.devServerUrl).origin
    } catch {
      return false
    }
  }
  if (parsed.protocol !== 'file:') return false
  const expectedUrl = pathToFileURL(opts.rendererIndexPath)
  try {
    // realpathSync is Electron's asar-aware patch in the main process, so
    // paths inside app.asar resolve too; it also expands 8.3 short names,
    // which a portable (self-extracting) launch can pass in.
    const framePath = fileUrlPathToFsPath(parsed.pathname)
    return pathsEqual(realpathSync(framePath), realpathSync(opts.rendererIndexPath))
  } catch {
    // Either side missing on disk — keep the original lexical compare rather
    // than rejecting a frame that merely failed to resolve.
    return pathsEqual(parsed.pathname, expectedUrl.pathname)
  }
}
