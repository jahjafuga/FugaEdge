// format.ts — display and conversion helpers shared across the app.
//
// Two families live here, both pure (no DOM, no React) so they run in the
// renderer and the Electron main process alike:
//   • compact-display helpers — money / int / price / percent / compactShares
//     / longDate / shortDate / duration. Numbers pass through these before
//     hitting the DOM so sign and decimals stay consistent.
//   • timezone helpers (Day 8.5) — easternToUtc / localEasternToUtc convert
//     broker wall-clock to stored UTC; utcToEasternParts / formatEastern
//     render stored UTC back to Eastern for display and hour-of-day
//     bucketing. See the section at the foot of this file.

const usdFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function money(n: number): string {
  return usdFmt.format(n)
}

const intFmt = new Intl.NumberFormat('en-US')
export function int(n: number): string {
  return intFmt.format(n)
}

const px2 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})
export function price(n: number): string {
  return px2.format(n)
}

// Fraction (0..1) → percent string. 0.625 → "62.5%". 1-decimal default per
// the Day 8 number-formatting spec; pass `decimals` to override. Returns "—"
// for null / undefined / non-finite, consistent with compactShares. The input
// is a 0..1 fraction (matches win_rate / scratch_pct storage) — not an
// already-scaled percentage. Out-of-range fractions are not clamped: a 2.5x
// return formats as "250.0%", a loss as "-25.0%".
export function percent(
  fraction: number | null | undefined,
  decimals = 1,
): string {
  if (fraction == null || !Number.isFinite(fraction)) return '—'
  return `${(fraction * 100).toFixed(decimals)}%`
}

// Renders profit factor (Σ wins / |Σ losses|). Promoted in v0.2.2 Day 2 from
// the inline pf() helper in FullStatsTable.tsx so the new day-scoped
// Performance tab and the existing whole-account stats table render the
// same string. Convention is documented in the v0.2.2 plan addendum:
//   - finite → toFixed(2)
//   - Infinity → "∞"  (winners but no losers — a real winning-only-day
//                       outcome, not an error)
//   - null → "—"      (no decided trades; all scratches or empty day)
export function formatProfitFactor(n: number | null): string {
  if (n == null) return '—'
  if (!Number.isFinite(n)) return '∞'
  return n.toFixed(2)
}

// Returns the Tailwind class for a P&L value's color. Uses the themed
// win/loss/muted tokens so the same green/red automatically darkens for
// light mode (text-win → #16a34a) without each caller knowing.
export function pnlClass(n: number): string {
  if (n > 0) return 'text-win'
  if (n < 0) return 'text-loss'
  return 'text-fg-tertiary'
}

export function signed(n: number): string {
  if (n > 0) return `+${money(n)}`
  return money(n)
}

const SHORT_MONTH = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// "2026-05-11" → "May 11 2026". Used everywhere user-visible ISO dates appear;
// the date <input> stays ISO since the browser widget requires it.
export function longDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d || m < 1 || m > 12) return iso
  return `${SHORT_MONTH[m - 1]} ${d} ${y}`
}

// "2026-05-11" → "May 11" (no year — used in dense chart axes).
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d || m < 1 || m > 12) return iso ?? ''
  return `${SHORT_MONTH[m - 1]} ${d}`
}

// Compact share count → "1.47M", "150M", "2.30B", "450K", "850". Returns "—"
// for null / zero / invalid. Used by the Float / shares-outstanding display
// where the full integer is too noisy. Bucket rules (Day 8 number-formatting
// spec) — the M bucket carries 2 decimals so 1,470,000 reads "1.47M", not a
// lossy "1.5M":
//   < 1,000                   → exact integer ("850")
//   1,000 – 999,999           → whole-number K ("450K")
//   1,000,000 – 99,999,999    → 2-decimal M ("1.47M")
//   100,000,000 – 999,999,999 → whole-number M ("150M")
//   ≥ 1,000,000,000           → 2-decimal B ("2.30B")
export function compactShares(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 100_000_000) return `${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return intFmt.format(n)
}

// Seconds → "12s" / "3m 12s" / "1h 4m". Returns "—" for null.
export function duration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  if (s < 3600) {
    const m = Math.floor(s / 60)
    const r = s % 60
    return r > 0 ? `${m}m ${r}s` : `${m}m`
  }
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ── Timezone helpers (Day 8.5) ────────────────────────────────────────────
//
// FugaEdge's import parsers receive broker timestamps in US/Eastern wall-clock
// and (as of Day 8.5) store true UTC. These helpers are that conversion
// boundary. All pure (Intl only) — no new dependency, runs in both processes.

const EASTERN_TZ = 'America/New_York'

// Zero-pad to two digits. Local to the timezone helpers — the compact-display
// formatters above use Intl.NumberFormat instead.
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

// Eastern wall-clock → UTC ISO 8601 (with Z), given the UTC offset in minutes.
// `offsetMinutes` is the minutes to ADD to UTC to reach local — EDT = -240,
// EST = -300. The Webull Mobile parser passes this straight from the file's
// literal EDT/EST suffix, skipping DST inference entirely.
export function easternToUtc(
  date: string,
  time: string,
  offsetMinutes: number,
): string {
  const localMs = Date.parse(`${date}T${time}Z`)
  if (Number.isNaN(localMs)) {
    throw new Error(`easternToUtc: unparseable date/time "${date}T${time}"`)
  }
  const utcMs = localMs - offsetMinutes * 60_000
  // toISOString() is always YYYY-MM-DDTHH:MM:SS.sssZ; inputs are second-
  // precision so .sss is always .000 — drop it for a clean stored value.
  return `${new Date(utcMs).toISOString().slice(0, 19)}Z`
}

// The America/New_York UTC offset (minutes) in effect at a real UTC instant.
// Read from Intl's IANA data via the shortOffset name ("GMT-4" / "GMT-5"), so
// DST — and any future change to US DST rules — needs no code change.
function easternOffsetAtUtc(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TZ,
    timeZoneName: 'shortOffset',
  }).formatToParts(new Date(utcMs))
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  const m = raw.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/)
  if (!m) throw new Error(`easternOffsetAtUtc: could not parse offset "${raw}"`)
  const hours = Number(m[1])
  const mins = m[2] ? Number(m[2]) : 0
  return hours * 60 + (hours < 0 ? -mins : mins)
}

// Eastern wall-clock → UTC ISO 8601 (with Z), inferring the EDT/EST offset for
// the date. Used by the three DAS parsers, whose timestamps carry no offset.
//
// DST is handled by a two-step fixed point: probe the offset at the
// provisional instant, then re-probe at the computed instant. The re-probe
// matters — a single probe is wrong when the provisional-as-UTC instant and
// the real instant straddle a transition (e.g. 04:00 ET pre-market on
// spring-forward day: 04:00 is unambiguously EDT, but 04:00-as-UTC lands
// before the 07:00-UTC transition and would probe as EST).
//
// The only inputs with no single correct answer are wall-clock times that do
// not exist (02:00-02:59 on spring-forward day) or occur twice (01:00-01:59 on
// fall-back day); for those this resolves to the offset just after the gap /
// the second occurrence — deterministic and documented. It is also unreachable
// in practice: US DST transitions are always a Sunday, when the equity market
// (incl. 04:00-20:00 ET extended hours) is closed, so no real trade timestamp
// lands there.
export function localEasternToUtc(date: string, time: string): string {
  const provisionalMs = Date.parse(`${date}T${time}Z`)
  if (Number.isNaN(provisionalMs)) {
    throw new Error(`localEasternToUtc: unparseable date/time "${date}T${time}"`)
  }
  const firstGuess = easternOffsetAtUtc(provisionalMs)
  const refined = easternOffsetAtUtc(provisionalMs - firstGuess * 60_000)
  return easternToUtc(date, time, refined)
}

// UTC ISO → numeric Eastern wall-clock parts, or null for an unparseable
// input. The shared conversion path: formatEastern renders these to strings,
// and the backend hour-of-day consumers (reports byHour, analytics time-of-
// day buckets, insights, performance comparison) read `.hour` directly.
// One Intl call, one place DST is resolved.
//
// TODO(timezone-preference): the zone is hard-coded to America/New_York for
// the US-market-hours convention. A future Settings preference would replace
// EASTERN_TZ with the user's choice.
export function utcToEasternParts(utcIso: string): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} | null {
  const ms = Date.parse(utcIso)
  if (Number.isNaN(ms)) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  // Some Intl implementations emit "24" for midnight — normalize to "00".
  // The date is left exactly as Intl reported it (not rolled) — this matches
  // the long-standing formatEastern behaviour and is deliberately preserved.
  let hh = get('hour')
  if (hh === '24') hh = '00'
  const year = Number(get('year'))
  const month = Number(get('month'))
  const day = Number(get('day'))
  const hour = Number(hh)
  const minute = Number(get('minute'))
  const second = Number(get('second'))
  if (
    [year, month, day, hour, minute, second].some((n) => !Number.isFinite(n))
  ) {
    return null
  }
  return { year, month, day, hour, minute, second }
}

// UTC ISO → Eastern wall-clock string. Default returns "HH:MM:SS"; pass
// { withDate: true } for "YYYY-MM-DDTHH:MM:SS". The inverse of
// localEasternToUtc. Returns "—" for an unparseable input. Thin string
// wrapper over utcToEasternParts.
export function formatEastern(
  utcIso: string,
  opts?: { withDate?: boolean },
): string {
  const p = utcToEasternParts(utcIso)
  if (!p) return '—'
  const time = `${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`
  if (opts?.withDate) {
    return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${time}`
  }
  return time
}
