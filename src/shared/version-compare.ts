const VERSION_CORE_PARTS = 3

/** Parse a version like "0.0.5-alpha" into numeric core + prerelease tag. */
function parseVersion(version: string): { core: number[]; pre: string } {
  const clean = version.replace(/^v/, '').trim()
  const [core, pre = ''] = clean.split('-')
  const nums = core.split('.').map((n) => parseInt(n, 10) || 0)
  while (nums.length < VERSION_CORE_PARTS) nums.push(0)
  return { core: nums.slice(0, VERSION_CORE_PARTS), pre }
}

/**
 * True when `latest` is a newer version than `current`. Handles the
 * `x.y.z-prerelease` scheme: a release with no prerelease tag outranks one with
 * the same core that has a tag; two prerelease tags compare lexically
 * (alpha < beta < rc).
 */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  for (let i = 0; i < VERSION_CORE_PARTS; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i]
  }
  if (a.pre === b.pre) return false
  if (!a.pre) return true
  if (!b.pre) return false
  return a.pre > b.pre
}
