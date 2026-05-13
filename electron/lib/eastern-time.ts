// DAS Trader execution timestamps come in as TZ-less strings like
// "2026-05-11T08:35:11" — by broker convention they're in US/Eastern time
// (the market's local clock). `Date.parse()` would interpret them as the
// host machine's local time, which is wrong for any user not in ET.
//
// This helper converts such a string to UTC epoch ms by determining whether
// the given calendar date falls in EDT (UTC-4) or EST (UTC-5) and applying
// the offset. DST rules are handled via Intl.DateTimeFormat so we don't
// re-implement them by hand.

function easternOffsetHours(year: number, month: number, day: number): number {
  // Format an arbitrary noon UTC on the target date in NY; the short tz name
  // tells us which side of DST we're on. Noon UTC is far enough from either
  // DST transition (which happen at 02:00 local) that ambiguity is impossible.
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  }).formatToParts(probe)
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value
  return tz === 'EDT' ? -4 : -5
}

/**
 * Parse a TZ-less ISO-like timestamp ("YYYY-MM-DDTHH:MM:SS[.fff]") as US/Eastern
 * time and return UTC epoch ms. Returns NaN if the string doesn't match.
 */
export function parseEasternTimeMs(s: string | null | undefined): number {
  if (!s) return NaN
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/)
  if (!m) return NaN
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const hh = Number(m[4])
  const mm = Number(m[5])
  const ss = Number(m[6])
  const ms = m[7] ? Number(m[7].padEnd(3, '0')) : 0
  const offset = easternOffsetHours(y, mo, d)
  // offset is -4 (EDT) or -5 (EST). To convert Eastern wall-clock to UTC we
  // subtract the offset (UTC = local - offset, where offset is negative for ET).
  return Date.UTC(y, mo - 1, d, hh - offset, mm, ss, ms)
}
