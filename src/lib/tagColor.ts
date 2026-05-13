// Deterministic color mapping for day-tag pills. Some well-known tags get
// fixed semantics (red for risk events, green for trending) — anything else
// hashes into a stable palette slot so users see the same color across sessions.

const FIXED: Record<string, string> = {
  FOMC: '#f87171',
  CPI: '#f87171',
  PPI: '#f87171',
  NFP: '#f87171',
  Earnings: '#60a5fa',
  News: '#60a5fa',
  Halt: '#fb923c',
  Choppy: '#94a3b8',
  Holiday: '#94a3b8',
  Trending: '#34d399',
}

const PALETTE = [
  '#d4af37', // gold
  '#60a5fa', // blue
  '#a78bfa', // violet
  '#34d399', // green
  '#fb923c', // orange
  '#f87171', // red
  '#22d3ee', // cyan
  '#f472b6', // pink
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function colorForTag(tag: string): string {
  if (FIXED[tag]) return FIXED[tag]
  return PALETTE[hash(tag) % PALETTE.length]
}
