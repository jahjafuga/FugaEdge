import type { ResolvedTheme } from './theme'

// Recharts (and lightweight-charts) need raw hex strings — they don't read
// CSS classes. This helper returns the right hex per theme so chart
// components can switch palette without each one duplicating the logic.
//
// Scope: only the chart values that need theme variants. Reds and golds
// in chart fills stay constant — only the green needs the "less neon on
// white" adjustment, per the polish brief. Axis chrome (text + grid)
// shifts to softer light values so charts don't read as harsh dark insets
// on light cards.

export interface ChartPalette {
  /** Win / positive bar fill. */
  win: string
  /** Loss / negative bar fill. */
  loss: string
  /** Gridlines + soft separators inside chart panes. */
  grid: string
  /** Axis tick text + tick lines. */
  axis: string
  /** Compare Period A series colour (gold). */
  sideA: string
  /** Compare Period B series colour (teal — green/red are reserved for deltas). */
  sideB: string
  /** Chart pane background — the opaque equivalent of the premium card surface
   *  (--card-surface), so the chart blends into the modal's cards per theme. */
  background: string
  /** MACD histogram 4-state momentum palette. Dark uses pale shades for the
   *  "weakening" states (they read on the near-black pane); light needs DARKER
   *  shades for those (pale would vanish on near-white) - so this MUST be themed,
   *  unlike the other chart accents which are fixed both-themes-safe values. */
  macdHist: {
    posRising: string
    posFalling: string
    negRising: string
    negFalling: string
  }
}

export function chartColors(theme: ResolvedTheme): ChartPalette {
  if (theme === 'light') {
    return {
      // Tailwind green-600 — deeper still than the previous #1aad6e for
      // higher contrast on white card surfaces. Matches the --win-text
      // token used by P&L numbers so chart bars and text agree visually.
      win:  '#16a34a',
      loss: '#f87171',   // red is fine on white — already muted enough
      grid: '#e2e6ed',   // matches card border colour
      axis: '#6b7280',   // slate-500, "clearly secondary" per the brief
      // Compare side identity — A gold (matches UI gold), B teal. Green/red stay
      // reserved for delta direction, so Period B must NOT reuse win-green.
      sideA: '#b8962e',  // the light-gold the Compare charts already used
      sideB: '#0d9488',  // teal-700 — darker for contrast on the light surface
      background: '#FCFDFF',  // --card-surface light, opaque
      macdHist: {
        posRising:  '#16a34a',  // strengthening bull - green-600 (darker = strong on white)
        posFalling: '#22c55e',  // weakening bull - green-500 (lighter = weak, still readable)
        negRising:  '#f87171',  // weakening bear - red-400 (lighter = weak, still readable)
        negFalling: '#dc2626',  // strengthening bear - red-600 (darker = strong on white)
      },
    }
  }
  return {
    win:  '#34d399',
    loss: '#f87171',
    grid: '#1e2330',     // --border-subtle in dark
    axis: '#8a94a8',     // --fg-tertiary in dark
    sideA: '#d4af37',    // existing gold (Compare Period A)
    sideB: '#2dd4bf',    // teal-400 — cool against gold, distinct from win-green
    background: '#0A0F1C',  // --card-surface dark, opaque
    macdHist: {
      posRising:  '#26a69a',  // strengthening bull - bright green (unchanged from dark)
      posFalling: '#a3d4cb',  // weakening bull - pale green (reads on the dark pane)
      negRising:  '#f5b3b0',  // weakening bear - pale red (reads on the dark pane)
      negFalling: '#ef5350',  // strengthening bear - bright red (unchanged from dark)
    },
  }
}
