import type { TourStep } from './types'

// The 10-step tour. Order matters — the renderer walks the array
// sequentially, auto-skipping steps whose anchors aren't currently in
// the DOM (e.g. dashboard-only anchors when launched from another
// route). The "chart-tab" step has no anchor and renders centered.

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'sidebar',
    anchor: 'sidebar',
    title: 'Your workspace',
    body:
      'Everything lives in one place — Dashboard, Trades, Calendar, Reports, ' +
      'Playbook, Analytics, Journal, Import, Settings. Collapse it anytime ' +
      'with Ctrl+B for more chart space.',
  },
  {
    id: 'today-session',
    anchor: 'today-session',
    title: 'Start every day here',
    body:
      "Log a no-trade day, mark market sentiment, or jump straight to your " +
      'journal. Building the discipline of showing up matters more than any ' +
      'single trade.',
  },
  {
    id: 'sentiment',
    anchor: 'sentiment',
    title: 'Rate the market 1-5',
    body:
      '5 = 3+ stocks running 100%+ (hot), 1 = nothing running (cold). Track ' +
      "which sentiment days you trade best — your edge lives in this data.",
  },
  {
    id: 'edge-intelligence',
    anchor: 'edge-intelligence',
    title: 'Patterns surface automatically',
    body:
      "We analyze your trades for catalysts that work, setups that don't, " +
      'time-of-day strength, sentiment correlations, and more. The more you ' +
      'tag, the smarter this gets.',
  },
  {
    id: 'import',
    anchor: 'nav-import',
    title: 'Your account menu',
    body:
      'Profile, Settings, and importing trades all live here, top-right. ' +
      'Import takes your DAS Trader CSVs — the Trades.csv and the daily summary — ' +
      'and we auto-fetch shares outstanding, EMA9 distance, and intraday bars from Massive. ' +
      'Lightspeed and Webull support coming soon.',
  },
  {
    id: 'trades',
    anchor: 'nav-trades',
    title: 'Tag every trade',
    body:
      'Click any trade to open the detail modal. Set the playbook, ' +
      'confidence, catalyst type, planned stop, mistakes. The richer your ' +
      'tagging, the better your edge analysis.',
  },
  {
    // The Chart tab only lives inside the Trade Detail Modal, which
    // isn't mounted until the user clicks a row. Option A (auto-open the
    // modal at the Chart tab from inside the tour) would require routing
    // + async DOM-wait + modal lifecycle coordination across several
    // files. Going with Option B per the spec: anchor on the Trades nav
    // and tell the user how to get to the chart from there. Reuses the
    // existing `nav-trades` anchor — distinct copy from step 6 so the
    // two consecutive Trades-nav steps say two different things.
    id: 'chart-tab',
    anchor: 'nav-trades',
    title: 'Replay every entry on the chart',
    body:
      'Click any trade in your Trades list to open it and see its intraday ' +
      'chart with entry/exit markers, EMA9/EMA20/VWAP, and a ' +
      '10s/1m/5m/Daily timeframe toggle. Use it for self-coaching after ' +
      'every session.',
  },
  {
    id: 'playbook',
    anchor: 'nav-playbook',
    title: 'Define your setups',
    body:
      'Your A+ playbooks live here. Entry rules, ideal conditions, ' +
      'performance stats per setup. We pre-seeded the Ross Cameron classics ' +
      '— edit, add, or archive any.',
  },
  {
    id: 'reports',
    anchor: 'nav-reports',
    title: 'Period vs period analysis',
    body:
      'Compare this week vs last week, this month vs last year, or any ' +
      'custom range. See exactly what\'s improving and what\'s regressing. ' +
      'This is where you find your real edge.',
  },
  {
    id: 'theme',
    anchor: 'theme-toggle',
    title: 'Trade your way',
    body:
      'Dark mode for late nights, light mode for daylight. Toggle anytime ' +
      '— your preference is saved. Welcome to FugaEdge.',
    finalLabel: 'Start trading',
  },
]
