import { i18n, t } from '../../../shared/i18n'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const JUST_NOW_LIMIT = 45 * SECOND
const ONE_MINUTE_LIMIT = 90 * SECOND
const RELATIVE_DAYS_LIMIT = 30 * DAY

/**
 * A friendly relative-time label capped at days — never a coarser unit than
 * "days". Beyond ~30 days it falls back to an absolute date ("Jul 3, 2026" in
 * English). Single unit only (no "1 hour 5 minutes"). `now` is passed in so a
 * single shared ticker can drive every label (see `NowContext`). Uses the
 * interface language, not the OS default.
 */
export function formatRelativeTime(timestamp: number, now: number): string {
  const diff = now - timestamp
  // Clock skew / not-yet timestamps: treat as just now rather than "in -3s".
  if (diff < JUST_NOW_LIMIT) return t('time.justNow')
  const relative = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' })
  if (diff < ONE_MINUTE_LIMIT) return relative.format(-1, 'minute')
  if (diff < HOUR) return relative.format(-Math.floor(diff / MINUTE), 'minute')
  if (diff < DAY) return relative.format(-Math.floor(diff / HOUR), 'hour')
  if (diff < RELATIVE_DAYS_LIMIT) return relative.format(-Math.floor(diff / DAY), 'day')
  return new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric', year: 'numeric' }).format(timestamp)
}
