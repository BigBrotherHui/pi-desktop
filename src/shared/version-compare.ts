const VERSION_CORE_PARTS = 3

/** Parse a version like "0.0.5-alpha" into numeric core + prerelease tag. */
function parseVersion(version: string): { core: number[]; pre: string } {
  const clean = version.replace(/^v/, '').trim()
  const [core, pre = ''] = clean.split('-')
  const nums = core.split('.').map((n) => parseInt(n, 10) || 0)
  while (nums.length < VERSION_CORE_PARTS) nums.push(0)
  return { core: nums.slice(0, VERSION_CORE_PARTS), pre }
}

const NUMERIC_IDENTIFIER = /^\d+$/

/**
 * SemVer 11.4 prerelease order: identifiers compare one by one, numeric ones as
 * numbers, numeric below alphanumeric, and a shorter equal prefix ranks lower.
 * Returns a positive number when `a` outranks `b`.
 */
function comparePrerelease(a: string, b: string): number {
  const left = a.split('.')
  const right = b.split('.')
  const shared = Math.min(left.length, right.length)
  for (let i = 0; i < shared; i++) {
    if (left[i] === right[i]) continue
    const leftNumeric = NUMERIC_IDENTIFIER.test(left[i])
    const rightNumeric = NUMERIC_IDENTIFIER.test(right[i])
    if (leftNumeric && rightNumeric) return Number(left[i]) - Number(right[i])
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return left[i] > right[i] ? 1 : -1
  }
  return left.length - right.length
}

/**
 * True when `latest` is a newer version than `current`. Handles the
 * `x.y.z-prerelease` scheme: a release with no prerelease tag outranks one with
 * the same core that has a tag; two prerelease tags follow SemVer order
 * (alpha < beta < rc, beta.9 < beta.10).
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
  return comparePrerelease(a.pre, b.pre) > 0
}
