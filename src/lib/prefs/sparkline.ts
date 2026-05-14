// Persistence for the Trades table's sparkline column toggle. Off by default
// — the mini-charts add visual noise to a dense table and most users only
// turn them on while reviewing specific symbols.
export const SHOW_SPARKLINE_STORAGE_KEY = 'fuga.trades.showSparkline'

function storage(): Storage | null {
  if (typeof window !== 'undefined') return window.localStorage
  // fall back for non-DOM test envs
  const g = globalThis as { localStorage?: Storage }
  return g.localStorage ?? null
}

export function readShowSparkline(): boolean {
  const s = storage()
  if (!s) return false
  return s.getItem(SHOW_SPARKLINE_STORAGE_KEY) === '1'
}

export function writeShowSparkline(value: boolean): void {
  const s = storage()
  if (!s) return
  s.setItem(SHOW_SPARKLINE_STORAGE_KEY, value ? '1' : '0')
}
