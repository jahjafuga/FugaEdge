import type { TourStep } from './types'

// The 12-step tour. Order matters — the renderer walks the array
// sequentially, auto-skipping steps whose anchors aren't currently in
// the DOM (e.g. dashboard-only anchors when launched from another
// route). The "chart-tab" step has no anchor and renders centered.

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'sidebar',
    anchor: 'sidebar',
    title: 'Your workspace',
    body:
      'Everything lives in one place — Dashboard, Trades, Calendar, Playbook, ' +
      'Analytics, EdgeIQ, and Journal. Collapse the rail anytime with Ctrl+B ' +
      'for more chart space.',
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
    anchor: 'market-sentiment',
    title: 'Rate the market 1-5',
    body:
      '5 = 3+ stocks running 100%+ (hot), 1 = nothing running (cold). Track ' +
      "which sentiment days you trade best — your edge lives in this data.",
  },
  {
    id: 'edge-intelligence',
    anchor: 'nav-intelligence',
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
      'Import reads DAS Trader, Webull, Lightspeed, ThinkorSwim, Ocean One, ' +
      'and TradeZero exports. We auto-fetch shares outstanding, EMA9 distance, ' +
      'and intraday bars from Massive, plus float, sector, and industry from FMP.',
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
    id: 'calendar',
    anchor: 'nav-calendar',
    title: 'Your month at a glance',
    body:
      'Every market day, colored by P&L — green days, red days, and no-trade ' +
      'days. Click any day to drill into its trades and journal. Your weekly ' +
      'and monthly rhythms jump out fast.',
  },
  {
    id: 'analytics',
    anchor: 'nav-analytics',
    title: 'Break down your edge',
    body:
      'Analytics breaks your results down by setup, time of day, and ' +
      'technicals — and compares any period against another, this week vs ' +
      'last or this month vs last year. This is where you find your real edge.',
  },
  {
    id: 'journal',
    anchor: 'nav-journal',
    title: 'Reflect and review',
    body:
      "Close every session here: what you saw, what you'd do differently, by " +
      'voice or text. Entries attach to the day and feed your review. The ' +
      'traders who journal are the ones who improve.',
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
