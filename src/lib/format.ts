// Display helpers for money / counts. All numbers should pass through these
// before hitting the DOM so we stay consistent with sign + decimals.

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
