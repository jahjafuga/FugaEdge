// Branded P&L calendar card — the app's own calendar, drawn for export.
//
// THE BRIEF IS THE APP. The in-app calendar was better than the card exporting
// it, so this stopped being a design exercise and became a port. Every element
// below already exists on screen and every number already comes back from the
// calendar query — CalendarMonth carries days[] (with winners, losers,
// avg_winner, avg_loser, day_tags, has_journal, no_trade_day, is_holiday) and
// weeks[] (the entire weekly panel). Nothing here is new maths.
//
// THE THREAD IS GONE. A cumulative line over four points is two segments and a
// diagonal — a stray mark, not a signature. Removed with its tests.
//
// THE WEEK RAIL IS THE SIGNATURE. WeeklyPanel is the thing no other journal has:
// a week's roll-up, its streak, its journaling coverage, its top tagged mistake
// and its fee drag, all already computed. It is ported whole.
//
// SHARED WITH THE CHART CARD, by import rather than copy: the icon asset,
// chartColors(theme) for every colour, `unit = W / 1000`, MASKED_AMOUNT and the
// streamer read. A second brand vocabulary is the likeliest thing to go wrong
// here, so there isn't one.
//
// GRID SHAPE IS THE APP'S: SUNDAY-first, forty-two cells, six rows, padded with
// adjacent-month days — ported from CalendarGrid.buildCells. Not a preference:
// WeeklySummary.week_start values are Sundays, so a Monday-first grid could not
// line its rows up with the rail at all.
//
// TRADED / TOUCHED / UNTOUCHED, the grid's own three states. `trade_count > 0`
// is traded. A day merely journalled, rated or sat out keeps a quiet outline and
// says which it was. A day nobody touched is a faint numeral and no box —
// twenty-seven outlined empties is what made a sparse month read as broken.

import iconUrl from '@/assets/fugaedge-icon-light.png'
import closedSignUrl from '@/assets/closed-sign.svg'
import { chartColors } from '@/lib/chartColors'
import {
  dominantMistake,
  feeShareOfNet,
  journalCoverage,
} from '@/core/calendar/monthFold'
import { MASKED_AMOUNT } from '@/lib/chartScreenshot'
import { readStreamerMode } from '@/lib/streamerMode'
import { int, money, percent, signed } from '@/lib/format'
import type { ResolvedTheme } from '@/lib/theme'

const FONT = 'JetBrains Mono, ui-monospace, monospace'

/** Every unit the card can draw, in offer order. Exported so the reachability
 *  guard can hold the UI to it: a mode the compositor implements and the share
 *  control never offers is a dead engine, and this feature produced one. */
export const CALENDAR_CARD_UNITS = ['percent', 'dollars'] as const

/** How a day's number is written. Percentage is the default because it says how
 *  the month went without saying how much money exists. */
export type CalendarCardUnit = (typeof CALENDAR_CARD_UNITS)[number]

/**
 * The four shapes, and the LAYOUT each one uses. A format is not a different
 * canvas size around one picture — a picture that fits 1600x900 leaves eleven
 * hundred pixels of nothing in a story frame, and a card with that much dead
 * space has not earned its size. So each format arranges the same elements
 * differently:
 *
 *   grid-rail-right  the app's own shape: month grid left, week rail right
 *   grid-rail-below  grid on top, the rail as full-width rows beneath it
 *   poster           for the story frame: brand, a hero NET, the supporting
 *                    stats, a compact grid and a closing line — inside the
 *                    platform safe area, readable at arm's length
 *   grid-footer      grid plus the compact totals band
 */
export const CALENDAR_CARD_FORMATS = {
  square: { w: 1080, h: 1080, layout: 'grid-footer' },
  portrait: { w: 1080, h: 1350, layout: 'grid-rail-below' },
  story: { w: 1080, h: 1920, layout: 'poster' },
  wide: { w: 1600, h: 900, layout: 'grid-rail-right' },
} as const

/**
 * THE STORY SAFE AREA.
 *
 * Instagram and TikTok both overlay their own chrome on a 1080x1920 frame — the
 * account row and caption at the top, the action rail and controls at the
 * bottom. Nothing readable may live outside this band. The background may fill
 * the whole frame; the words may not.
 *
 * A story is looked at full-screen for about five seconds, which is why the
 * story layout is a POSTER rather than the week rail: a rail is a reference
 * object, read leaning in, and nobody leans into a story.
 */
export const STORY_SAFE_TOP = 250
export const STORY_SAFE_BOTTOM = 1670

export type CalendarCardFormat = keyof typeof CALENDAR_CARD_FORMATS
export type CalendarCardLayout =
  (typeof CALENDAR_CARD_FORMATS)[CalendarCardFormat]['layout']
export const CALENDAR_CARD_FORMAT_IDS = Object.keys(
  CALENDAR_CARD_FORMATS,
) as CalendarCardFormat[]

/** Whether a percentage can honestly be computed, and if not, why not. Mirrors
 *  useContributedCapital's three outcomes, plus 'unknown' for the window before
 *  its read resolves — a card composed in that window must say the denominator
 *  is unavailable, not quietly print a grid of dashes. */
export type DenominatorState = 'ok' | 'no-anchor' | 'non-positive' | 'unknown'

/** One day, carrying exactly what the grid cell draws. */
export interface CalendarCardDay {
  /** YYYY-MM-DD. */
  date: string
  /** Net P&L, summed from net_pnl_precise. */
  pnl: number
  /** The day as a percentage of contributed capital, or null with no anchor.
   *  Computed by the caller; the card never derives it. */
  pct: number | null
  tradeCount: number
  winners: number
  losers: number
  /** winners / (winners + losers), null when nothing was decided. */
  winRate: number | null
  /** avg_winner / |avg_loser|, null where it cannot divide. */
  plRatio: number | null
  /** The trader marked this day a sit-out. */
  noTrade: boolean
  /** The sit-out was a market holiday. */
  holiday: boolean
  /** Any journal content on the day. */
  hasJournal: boolean
  /** Per-day labels (FOMC, Earnings…). */
  tags: string[]
  /** The day's fees. Already on CalendarDay; carried so a straddling week can
   *  be re-totalled from the month's own days without a new query. */
  fees: number
}

/** One week, carrying exactly what WeeklyPanel draws. Every field is lifted
 *  straight off WeeklySummary — no field here is derived. */
export interface CalendarCardWeek {
  weekStart: string
  weekEnd: string
  inMonth: boolean
  tradeCount: number
  netPnl: number
  /** The week as a percentage of contributed capital, or null. Same pctOf as
   *  everywhere else — the rail's hero is money and must follow the unit. */
  netPct: number | null
  totalFees: number
  winners: number
  losers: number
  winRate: number | null
  plRatio: number | null
  /** The week's fees as a percentage of contributed capital, or null. Computed
   *  by the caller with the same pctOf every other percentage uses. */
  feesPct: number | null
  daysTraded: number
  daysJournaled: number
  streak: { kind: 'win' | 'loss' | 'none'; days: number }
  topMistake: { name: string; count: number } | null
  /** True when this week's figures have been re-totalled to the card's month
   *  because the week straddles the boundary and traded on both sides. */
  scoped?: boolean
}

export interface CalendarCardData {
  /** e.g. "July 2026" — pre-formatted, one formatting path. */
  monthLabel: string
  year: number
  /** 1-12. */
  month: number
  /** Every day the calendar knows about — traded days AND days merely touched.
   *  A day in neither category is not in here and gets no box. */
  days: CalendarCardDay[]
  /** Six entries, one per grid row, straight from CalendarMonth.weeks. */
  weeks: CalendarCardWeek[]
  monthPnl: number
  monthPct: number | null
  monthFees: number
  monthFeesPct: number | null
  tradeCount: number
  monthWinners: number
  monthLosers: number
  longestGreenRun: number
  currentStreak: { kind: 'win' | 'loss' | 'none'; days: number }
  unit: CalendarCardUnit
  /** Why a percentage can or cannot be drawn. Drives the denominator line —
   *  the difference between "we don't know" and a dash read as zero. */
  denominator: DenominatorState
}

/** The app's own weekday header, Sunday-first (CalendarGrid WEEKDAYS). */
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** "Aug 3" — WeeklyPanel's own shortMonthDay. */
export function shortMonthDay(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${SHORT_MONTHS[m - 1]} ${d}`
}

export interface GridCell {
  date: string
  day: number
  inMonth: boolean
}

/**
 * Forty-two cells, Sunday-first, padded from the adjacent months.
 *
 * A PORT of CalendarGrid.buildCells, on a UTC noon anchor so no timezone can
 * shift a cell by a day (the grid runs in the user's locale on screen; a card is
 * an artefact and must not drift). Six rows always, so the rail's six weeks line
 * up with the grid's six rows one for one.
 */
export function buildCells(year: number, month: number): GridCell[] {
  const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))
  const first = new Date(Date.UTC(year, month - 1, 1, 12))
  const lead = first.getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12)).getUTCDate()
  const daysInPrev = new Date(Date.UTC(year, month - 1, 0, 12)).getUTCDate()
  const cells: GridCell[] = []

  for (let i = lead - 1; i >= 0; i--) {
    const d = daysInPrev - i
    const pm = month === 1 ? 12 : month - 1
    const py = month === 1 ? year - 1 : year
    cells.push({ date: `${py}-${pad2(pm)}-${pad2(d)}`, day: d, inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: `${year}-${pad2(month)}-${pad2(d)}`, day: d, inMonth: true })
  }
  let n = 1
  while (cells.length < 42) {
    const nm = month === 12 ? 1 : month + 1
    const ny = month === 12 ? year + 1 : year
    cells.push({ date: `${ny}-${pad2(nm)}-${pad2(n)}`, day: n, inMonth: false })
    n += 1
  }
  return cells
}

/**
 * How many of the six grid rows to draw.
 *
 * A trailing row made ENTIRELY of adjacent-month days is a row of faint numerals
 * and nothing else — the row-scale version of the empty-boxes problem, and worth
 * about a hundred pixels of blank card. It is dropped, and its week card is
 * dropped with it so the rail stays aligned one-to-one with the rows.
 *
 * Leading rows are never dropped: row zero always contains the 1st.
 */
export function visibleRows(cells: readonly GridCell[]): number {
  let rows = Math.ceil(cells.length / 7)
  while (rows > 1 && !cells.slice((rows - 1) * 7, rows * 7).some((c) => c.inMonth)) rows -= 1
  return rows
}

/** A rectangle a layout hands to one element. */
export interface Region {
  name: 'header' | 'grid' | 'rail' | 'footer' | 'note' | 'hero' | 'stats'
  x: number
  y: number
  w: number
  h: number
}

/**
 * WHERE EACH ELEMENT GOES, for one format.
 *
 * Pure, and the SAME object the compositor draws from — so the dead-space guard
 * measures what the layout allocates rather than trying to infer it from ink.
 * Inferring failed repeatedly and for a good reason: untouched cells paint
 * nothing on purpose, so a quiet week and a wasted frame look identical from the
 * outside. A format's claim on its own height is a property of the layout, and
 * this is where the layout lives.
 */
export function cardRegions(format: CalendarCardFormat, hasNote: boolean): Region[] {
  const { w: W, h: H, layout } = CALENDAR_CARD_FORMATS[format]
  const u = W / 1000
  const px = (n: number) => Math.round(n * u)
  const pad = px(20)
  const headerH = headerHeightOf(format, px)
  const noteH = hasNote ? px(26) : 0
  const bodyTop = headerH + px(10)
  const bodyH = H - bodyTop - noteH - pad
  const inner = W - pad * 2

  const out: Region[] = [{ name: 'header', x: 0, y: 0, w: W, h: headerH }]
  if (layout === 'grid-rail-right') {
    const railW = Math.round(inner * 0.26)
    const gridW = inner - railW - px(14)
    out.push({ name: 'grid', x: pad, y: bodyTop, w: gridW, h: bodyH })
    out.push({
      name: 'rail',
      x: pad + gridW + px(14),
      y: bodyTop,
      w: railW,
      h: H - pad - bodyTop,
    })
  } else if (layout === 'grid-rail-below') {
    const gridH = Math.round(bodyH * 0.62)
    out.push({ name: 'grid', x: pad, y: bodyTop, w: inner, h: gridH })
    out.push({
      name: 'rail',
      x: pad,
      y: bodyTop + gridH + px(12),
      w: inner,
      h: bodyH - gridH - px(12),
    })
  } else if (layout === 'poster') {
    // Everything inside the safe band, in reading order. The header is the
    // brand line; `hero` carries the net; `stats` the supporting row; `grid`
    // the compact month; `footer` the closing line.
    const top = STORY_SAFE_TOP
    const bottom = STORY_SAFE_BOTTOM
    const brandH = px(60)
    const heroH = px(220)
    const statsH = px(110)
    const closeH = px(90)
    const gridH = bottom - top - brandH - heroH - statsH - closeH - px(40)
    let y = top
    out.length = 0 // the poster replaces the default header band entirely
    out.push({ name: 'header', x: pad, y, w: inner, h: brandH })
    y += brandH + px(10)
    out.push({ name: 'hero', x: pad, y, w: inner, h: heroH })
    y += heroH + px(10)
    out.push({ name: 'stats', x: pad, y, w: inner, h: statsH })
    y += statsH + px(10)
    out.push({ name: 'grid', x: pad, y, w: inner, h: gridH })
    y += gridH + px(10)
    // Clamped: the derived heights round, and a footer one pixel past the safe
    // bottom is still past it.
    out.push({ name: 'footer', x: pad, y, w: inner, h: Math.min(closeH, bottom - y) })
    if (hasNote) out.push({ name: 'note', x: pad, y: bottom - noteH, w: inner, h: noteH })
    return out
  } else {
    // grid-footer keeps its name and loses its footer: the three facts it
    // carried moved up into the masthead, so the grid takes the whole body.
    out.push({ name: 'grid', x: pad, y: bodyTop, w: inner, h: bodyH })
  }
  if (hasNote) out.push({ name: 'note', x: pad, y: H - noteH - pad, w: inner, h: noteH })
  return out
}

/**
 * The share of the card's height NOT allocated to any element, per column half.
 *
 * The ruling's own test: a format with eleven hundred pixels of nothing has not
 * earned its size. Measured per half because a side-by-side layout can waste one
 * column while the other runs full height.
 */
export function unusedHeightFraction(regions: readonly Region[], format: CalendarCardFormat): number {
  const { w: W, h: H } = CALENDAR_CARD_FORMATS[format]
  const covered = (lo: number, hi: number): number => {
    const spans = regions
      .filter((r) => r.x + r.w > lo && r.x < hi)
      .map((r) => [r.y, r.y + r.h] as [number, number])
      .sort((a, b) => a[0] - b[0])
    let used = 0
    let reach = 0
    for (const [top, bottom] of spans) {
      used += Math.max(0, bottom - Math.max(top, reach))
      reach = Math.max(reach, bottom)
    }
    return used
  }
  return 1 - Math.min(covered(0, W / 2), covered(W / 2, W)) / H
}

/**
 * The supporting tier a week card carries, in DEGRADE ORDER — last in this list
 * is the first to go when the card is short.
 *
 * THE ORDER, and why: FEES go first because a cost figure is a fact the trader
 * can read anywhere and it changes no decision. JOURNALING is process, not
 * outcome. The STREAK is momentum, worth keeping. THE TOP MISTAKE stays longest:
 * it is the only line on the card that tells the trader what to do differently,
 * and a card that drops it to keep a fee total has its priorities backwards.
 *
 * Reading the array forwards gives draw order; popping from the end gives the
 * drop order. One list, so the two cannot disagree.
 */
/** THE TIER IS ADDITIVE. Every line here carries a fact that appears nowhere
 *  else on the card, so dropping one for room costs the reader that fact and
 *  nothing more.
 *
 *  'scoped' USED TO BE FIRST IN THIS LIST and is no longer in it at all. It was
 *  never additive — it is a QUALIFIER on the net, the W/L and the {n}T chip
 *  drawn above it, and a qualifier that can be dropped while the number it
 *  qualifies survives is worse than none: the card then states a re-totalled
 *  figure as if it were the whole week's. Being first bought it nothing, because
 *  a starved rail gives fitTierLines a NEGATIVE budget, room = 0, and
 *  slice(0, 0) keeps nothing. First of nothing is nothing — measured on the
 *  judging book, computed on four straddling weeks and drawn on none of them.
 *  It lives on the header row now, where no fitter can reach it. */
export const WEEK_TIER_ORDER = ['mistake', 'streak', 'journaled', 'fees'] as const
export type WeekTierLine = (typeof WEEK_TIER_ORDER)[number]

/** Which supporting lines a week actually has, in DRAW order. */
export function weekTierLines(w: CalendarCardWeek): WeekTierLine[] {
  const has: Record<WeekTierLine, boolean> = {
    // The panel's own gate: a one-day run is not a streak.
    streak: w.streak.kind !== 'none' && w.streak.days >= 2,
    journaled: w.daysJournaled > 0,
    mistake: w.topMistake != null,
    fees: true,
  }
  return (['streak', 'journaled', 'mistake', 'fees'] as WeekTierLine[]).filter((k) => has[k])
}

/** THE FOLD'S OWN TIER, highest value first — and therefore last to be dropped,
 *  since fitFoldLines keeps a prefix. A month with room for exactly one line
 *  says the thing the weeks could not: what kept going wrong. */
export const FOLD_TIER_ORDER = ['mistake', 'journaled', 'flex', 'fees'] as const
export type FoldLineKind = (typeof FOLD_TIER_ORDER)[number]
export interface FoldLine {
  kind: FoldLineKind
  text: string
  tone: Tone
}

/**
 * The month's fold, in tier order.
 *
 * Every fact is either read off the week rollups or computed by something that
 * already existed. Nothing here is a second implementation:
 *   mistake    core/calendar/monthFold.dominantMistake  (gated; may be absent)
 *   journaled  core/calendar/monthFold.journalCoverage
 *   flex       standsOut and the poster footer's own two lines, reused
 *   fees       core/calendar/monthFold.feeShareOfNet
 */
export function foldLines(
  data: CalendarCardData,
  weeks: readonly CalendarCardWeek[],
): FoldLine[] {
  const out: FoldLine[] = []

  const dom = dominantMistake(weeks)
  if (dom) {
    out.push({
      kind: 'mistake',
      text: `${dom.name.toUpperCase()} · ${dom.count}x ACROSS ${dom.weeks} OF ${dom.ofWeeks} WEEKS`,
      tone: 'loss',
    })
  }

  const cov = journalCoverage(weeks)
  if (cov.traded > 0) {
    out.push({
      kind: 'journaled',
      text: `JOURNALED ${cov.journaled} OF ${cov.traded} DAYS`,
      tone: 'gold',
    })
  }

  // THE FLEX — the poster footer's two facts, by the poster's own rules.
  // standsOut and longestGreenRun both live in THIS file (src/lib); beat 15
  // named them for a move to src/core and this beat deliberately does not.
  const traded = data.days.filter(isTraded)
  const best = traded.reduce<CalendarCardDay | null>(
    (a, d) => (a == null || d.pnl > a.pnl ? d : a),
    null,
  )
  if (best && best.pnl > 0 && standsOut(best, traded)) {
    out.push({
      kind: 'flex',
      text: `BEST DAY ${shortMonthDay(best.date).toUpperCase()}`,
      tone: 'win',
    })
  }
  if (data.currentStreak.kind !== 'none' && data.currentStreak.days >= 2) {
    out.push({
      kind: 'flex',
      text: `${data.currentStreak.days}-DAY ${
        data.currentStreak.kind === 'win' ? 'GREEN' : 'RED'
      } INTO NEXT MONTH`,
      tone: data.currentStreak.kind === 'win' ? 'win' : 'loss',
    })
  } else if (data.longestGreenRun >= 2) {
    out.push({ kind: 'flex', text: `BEST GREEN RUN ${data.longestGreenRun} DAYS`, tone: 'win' })
  }

  // THE FEE LINE. A share of net only where a net exists to take a share of;
  // on a losing month the amount, and wording that cannot be mistaken for the
  // same measurement. Muted in both cases — fees are a cost, not a P&L value,
  // and colouring them would make them read as a result.
  const share = feeShareOfNet(data.monthFees, data.monthPnl)
  if (share != null) {
    out.push({ kind: 'fees', text: `FEES ${share.toFixed(1)}% OF NET`, tone: 'muted' })
  } else if (data.monthFees > 0 && data.monthPnl < 0) {
    out.push({ kind: 'fees', text: `FEES ${money(data.monthFees)} ON TOP OF THE LOSS`, tone: 'muted' })
  }
  return out
}

/** The fold lines that FIT, degraded from the bottom of FOLD_TIER_ORDER. Same
 *  rhythm and the same arithmetic as fitTierLines, so the two cannot drift. */
export function fitFoldLines(
  lines: readonly FoldLine[],
  height: number,
  px: (n: number) => number,
): FoldLine[] {
  const room = Math.max(0, Math.floor(height / px(14)))
  return lines.slice(0, room)
}

/**
 * The height one week card's content actually needs.
 *
 * Six equal cards is what starved portrait and wide (−81px and −109px of room,
 * so the tier painted onto the next card) and bloated story (four empty weeks at
 * 292px each) — all from one line of code. A week with no trades is a thin
 * strip: its range and the words "No trades". A week with a streak, journaling
 * coverage and a tagged mistake gets the room those need.
 */
export function weekContentHeight(
  w: CalendarCardWeek,
  px: (n: number) => number,
  chipRow = false,
): number {
  const chips = chipRow ? px(50) : 0
  if (w.tradeCount === 0) {
    // range px(15) + "NO TRADES" px(32) + the journaled line px(46), each on the
    // populated branch's fixed rhythm, plus a bottom breath.
    return px(w.daysJournaled > 0 ? 56 : 42) + chips
  }
  // range px(15) · hero px(42) · stat line px(60), then the tier at px(14) each
  return px(70) + weekTierLines(w).length * px(14) + px(10) + chips
}

/** The floor a card must clear before its tier can be degraded away: the range,
 *  the hero and the stat line. Below this there is nothing left to drop. */
export function weekMinHeight(
  w: CalendarCardWeek,
  px: (n: number) => number,
  chipRow = false,
): number {
  const chips = chipRow ? px(50) : 0
  if (w.tradeCount === 0) return weekContentHeight(w, px, chipRow)
  return px(70) + px(10) + chips
}

/** The card's own traded days that fall inside a week's span. The rail's scope
 *  question answered from data already on the card — days[] only ever holds
 *  dates in the visible month. */
export function monthDaysIn(
  w: Pick<CalendarCardWeek, 'weekStart' | 'weekEnd'>,
  days: readonly CalendarCardDay[],
): CalendarCardDay[] {
  return days.filter((d) => isTraded(d) && d.date >= w.weekStart && d.date <= w.weekEnd)
}

/**
 * THE RAIL BELONGS TO THE MONTH ON THE CARD.
 *
 * MEASURED on August: the first rail card read JUL 26–AUG 1, 16T, +$0.99 — the
 * whole of July, on an August card. Aug 1 is a Saturday with no trades, so that
 * week contributed nothing to August, and the rail summed to 28 trades / $40.91
 * against a masthead of 12 / $39.92.
 *
 * `in_month` cannot fix it: it asks whether any calendar DATE of the week falls
 * in the month, so a Saturday the 1st makes the whole of the previous week
 * "in month". And every figure on a WeeklySummary is computed over the full
 * seven-day span (electron/calendar/weekly.ts:111), across the boundary.
 *
 * THE RULE, in three cases:
 *   NO traded days in this month  -> not this month's week. Dropped.
 *   trades ONLY in this month     -> kept as it is.
 *   trades on BOTH sides          -> kept, RE-TOTALLED to the month's own days,
 *                                    and marked on its face. Its week-scoped
 *                                    lines (streak, journaling, top mistake) are
 *                                    dropped rather than shown unscoped, and
 *                                    plRatio goes null — a ratio of averages
 *                                    cannot be re-derived from per-day averages,
 *                                    and inventing one would be worse than
 *                                    omitting it.
 */
export function scopeWeeksToMonth(
  weeks: readonly CalendarCardWeek[],
  days: readonly CalendarCardDay[],
): CalendarCardWeek[] {
  const out: CalendarCardWeek[] = []
  for (const w of weeks) {
    const mine = monthDaysIn(w, days)
    const trades = mine.reduce((a, d) => a + d.tradeCount, 0)
    if (trades === 0) {
      // No trades of ours. Keep it only if the week is genuinely inside the
      // month and quiet — a quiet week of THIS month is still this month's.
      if (w.tradeCount === 0 && w.inMonth && monthOwnsSpan(w, days)) out.push(w)
      continue
    }
    if (trades === w.tradeCount) {
      out.push(w)
      continue
    }
    // Straddles, with trades on both sides. Re-total to ours.
    const winners = mine.reduce((a, d) => a + d.winners, 0)
    const losers = mine.reduce((a, d) => a + d.losers, 0)
    const decided = winners + losers
    out.push({
      ...w,
      tradeCount: trades,
      netPnl: mine.reduce((a, d) => a + d.pnl, 0),
      netPct: mine.every((d) => d.pct == null)
        ? null
        : mine.reduce((a, d) => a + (d.pct ?? 0), 0),
      totalFees: mine.reduce((a, d) => a + d.fees, 0),
      feesPct: null,
      winners,
      losers,
      winRate: decided > 0 ? winners / decided : null,
      plRatio: null,
      daysTraded: mine.length,
      daysJournaled: 0,
      streak: { kind: 'none', days: 0 },
      topMistake: null,
      scoped: true,
    })
  }
  return out
}

/** Whether a quiet week sits inside the card's month at all. A tradeless week
 *  from the previous month is not this month's quiet week. */
function monthOwnsSpan(
  w: Pick<CalendarCardWeek, 'weekStart' | 'weekEnd'>,
  days: readonly CalendarCardDay[],
): boolean {
  const prefix = days.length > 0 ? days[0].date.slice(0, 7) : null
  if (prefix == null) return true
  // any date of the span in this month
  const start = new Date(`${w.weekStart}T12:00:00Z`).getTime()
  for (let i = 0; i < 7; i++) {
    const d = new Date(start + i * 86_400_000).toISOString().slice(0, 10)
    if (d.slice(0, 7) === prefix) return true
  }
  return false
}

/**
 * CONSECUTIVE tradeless weeks become ONE strip naming the span.
 *
 * Four identical "NO TRADES" bars are four facts a reader takes in at one
 * glance, and they were eating the room the populated weeks needed — wide's
 * traded card had 114px for 223px of content, which is why the fee line has
 * never once appeared in any format.
 *
 * CONSECUTIVE, detected by ADJACENCY IN THE RAIL, not by date arithmetic: the
 * weeks arrive in order, one per grid row, so a run is a maximal stretch of
 * neighbours with trade_count 0. A gap — one traded week between two quiet ones
 * — ends the run and the two stay separate, because "AUG 9 – SEP 5 quiet" would
 * be a lie if something happened in the middle of it.
 *
 * A collapsed strip keeps trade_count 0 and says so; it is a real week entry
 * spanning several weeks, not a decoration.
 */
export function collapseEmptyWeeks(
  weeks: readonly CalendarCardWeek[],
): (CalendarCardWeek & { spanned: number })[] {
  const out: (CalendarCardWeek & { spanned: number })[] = []
  let i = 0
  while (i < weeks.length) {
    if (weeks[i].tradeCount > 0) {
      out.push({ ...weeks[i], spanned: 1 })
      i += 1
      continue
    }
    let j = i
    while (j + 1 < weeks.length && weeks[j + 1].tradeCount === 0) j += 1
    if (j === i) {
      out.push({ ...weeks[i], spanned: 1 })
    } else {
      out.push({
        ...weeks[i],
        weekEnd: weeks[j].weekEnd,
        inMonth: weeks.slice(i, j + 1).some((w) => w.inMonth),
        // the run's own totals, so the strip is not claiming one week's figures
        totalFees: weeks.slice(i, j + 1).reduce((a, w) => a + w.totalFees, 0),
        daysJournaled: weeks.slice(i, j + 1).reduce((a, w) => a + w.daysJournaled, 0),
        spanned: j - i + 1,
      })
    }
    i = j + 1
  }
  return out
}


/**
 * The supporting lines that FIT in a given height, degraded in the stated order.
 *
 * A tier that silently overflows is worse than a tier that drops its least
 * important line — the first is a card with two weeks' text on top of each
 * other, the second is a card that says slightly less. WEEK_TIER_ORDER decides
 * what goes: fees first, the top mistake last.
 */
export function fitTierLines(
  w: CalendarCardWeek,
  height: number,
  px: (n: number) => number,
  chipRow = false,
): WeekTierLine[] {
  const present = new Set(weekTierLines(w))
  const budget = height - weekMinHeight(w, px, chipRow)
  const room = Math.max(0, Math.floor(budget / px(14)))
  // Keep the most important `room` of them, by WEEK_TIER_ORDER.
  const keep = new Set(WEEK_TIER_ORDER.filter((k) => present.has(k)).slice(0, room))
  return weekTierLines(w).filter((k) => keep.has(k))
}

/**
 * Cut a rail into one box per week, sized by CONTENT and then stretched to fill.
 *
 * Pure, and the same function the compositor draws from and the overflow guard
 * measures against — the third time in this feature that one shared geometry
 * object has been the difference between a guard that works and one that
 * re-derives the layout and agrees with itself about the wrong thing.
 */
export const RAIL_GROW_CAP = 1.5
/** rail-only lifts the cap: the week card IS the layout there, so surplus height
 *  has nowhere else to go, and what it buys is bigger day chips — content, not
 *  air. A rail that shares the frame with a grid keeps the tighter cap. */
export const RAIL_ONLY_GROW_CAP = 2.5

export function railCardBoxes(
  region: Region,
  weeks: readonly CalendarCardWeek[],
  px: (n: number) => number,
  chipRow = false,
  growCap = RAIL_GROW_CAP,
): { x: number; y: number; w: number; h: number }[] {
  const n = weeks.length
  if (n === 0) return []
  const gap = px(6)
  const avail = region.h - gap * (n - 1)
  const mins = weeks.map((w) => weekMinHeight(w, px, chipRow))
  const fulls = weeks.map((w) => weekContentHeight(w, px, chipRow))
  const minTotal = mins.reduce((a, b) => a + b, 0)

  let hs: number[]
  if (avail <= minTotal) {
    // The rail cannot hold even the floors. Share it out proportionally and let
    // fitTierLines strip every card to its hero — nothing is drawn that has no
    // room, which is the invariant; a smaller card is the cost.
    hs = mins.map((m) => (m / minTotal) * avail)
  } else {
    // 1. everyone gets their floor
    // 2. what is left is shared by APPETITE — how much tier each card still
    //    wants — so a full week gets its lines before an empty one gets air
    hs = mins.slice()
    const want = weeks.map((_, i) => Math.max(0, fulls[i] - mins[i]))
    const wantTotal = want.reduce((a, b) => a + b, 0)
    let spare = avail - minTotal
    if (wantTotal > 0) {
      const take = Math.min(spare, wantTotal)
      for (let i = 0; i < n; i++) hs[i] += (want[i] / wantTotal) * take
      spare -= take
    }
    // 3. any slack past full content is spread proportionally, capped so a
    //    month of quiet weeks cannot become six enormous strips
    if (spare > 0) {
      const caps = weeks.map((_, i) => fulls[i] * growCap - hs[i])
      const capTotal = caps.reduce((a, b) => a + Math.max(0, b), 0)
      if (capTotal > 0) {
        const take = Math.min(spare, capTotal)
        for (let i = 0; i < n; i++) hs[i] += (Math.max(0, caps[i]) / capTotal) * take
      }
    }
  }

  const out: { x: number; y: number; w: number; h: number }[] = []
  let y = region.y
  for (let i = 0; i < n; i++) {
    // floor(), not round(): rounding up puts a card a fraction over its cap and
    // past the bottom of the rail, both of which are assertions.
    const h = Math.floor(Math.min(hs[i], fulls[i] * growCap))
    out.push({ x: region.x, y: Math.round(y), w: region.w, h })
    y += hs[i] + gap
  }
  return out
}

/** The height of a week card that has been cut down to one content line. The
 *  header row at px(15), one line carrying the net and the stat tokens at
 *  px(34), and the px(10) bottom breath the empty-week card already uses. */
export function oneLineHeight(w: CalendarCardWeek, px: (n: number) => number): number {
  if (w.tradeCount === 0) return weekContentHeight(w, px)
  return px(44)
}

export interface RailPlan {
  /** True when the rail cannot hold even the floors of its full-height cards. */
  starved: boolean
  cards: { x: number; y: number; w: number; h: number }[]
  /** The leftover below the last card, or null when there is not enough of it
   *  to say anything in. */
  fold: { x: number; y: number; w: number; h: number } | null
}

/** The least a fold may be given before it is not worth carving: one line of
 *  its own rhythm, plus the rule drawn above it. */
const FOLD_MIN = 24

/**
 * HOW THE RAIL IS SPENT — beat 17's whole ruling, in one function.
 *
 * NOT STARVED: railCardBoxes decides, exactly as it always has, and the fold
 * gets whatever is left over. Measured before this was written: today's rail
 * fills itself to 99.8-100%, so on a month with room the leftover is 0-1px and
 * no fold appears at all. That is the ruling working rather than failing — a
 * rail with room for its tiers keeps them, byte for byte.
 *
 * STARVED: every card drops to oneLineHeight and the fold takes the rest. On
 * 2026-03 wide that is five 70px cards inside 629px of rail, and 239px of month
 * for the taking — space previously spent drawing five headers over five
 * numbers, none of which could finish its sentence.
 *
 * railCardBoxes is NOT touched by any of this. It still fills whatever region
 * it is handed, so every guard written against it still measures what it did.
 */
export function planRail(
  region: Region,
  weeks: readonly CalendarCardWeek[],
  px: (n: number) => number,
  chipRow = false,
  growCap = RAIL_GROW_CAP,
): RailPlan {
  const n = weeks.length
  if (n === 0) return { starved: false, cards: [], fold: null }
  const gap = px(6)
  const avail = region.h - gap * (n - 1)
  const minTotal = weeks.reduce((a, w) => a + weekMinHeight(w, px, chipRow), 0)
  const starved = avail <= minTotal

  const carve = (cards: { x: number; y: number; w: number; h: number }[]) => {
    const last = cards[cards.length - 1]
    const bottom = last.y + last.h
    const left = region.y + region.h - bottom - gap
    return left >= FOLD_MIN
      ? { x: region.x, y: bottom + gap, w: region.w, h: left }
      : null
  }

  if (!starved) {
    const cards = railCardBoxes(region, weeks, px, chipRow, growCap)
    return { starved: false, cards, fold: carve(cards) }
  }

  // One line each — unless even THAT does not fit, in which case share the rail
  // out proportionally exactly as railCardBoxes' own starved branch does. Found
  // by halving both rails: without this the cards stacked to 390px inside a
  // 315px rail and walked off the bottom of the card. Real geometry cannot
  // reach it (six weeks at 70px is 470 of 629), but "cannot happen today" is
  // not an invariant, and railCardBoxes has had the equivalent guard all along.
  const wants = weeks.map((w) => oneLineHeight(w, px))
  const wantTotal = wants.reduce((a, b) => a + b, 0)
  const hs = wantTotal <= avail ? wants : wants.map((h) => (h / wantTotal) * avail)
  const cards: { x: number; y: number; w: number; h: number }[] = []
  let y = region.y
  for (let i = 0; i < n; i++) {
    cards.push({ x: region.x, y: Math.round(y), w: region.w, h: Math.floor(hs[i]) })
    y += hs[i] + gap
  }
  return { starved: true, cards, fold: carve(cards) }
}

/** Cut a grid region into its day cells — one box per cell, row-major. */
export function gridCellBoxes(
  region: Region,
  rows: number,
  px: (n: number) => number,
): { x: number; y: number; w: number; h: number }[] {
  const gap = px(6)
  const wdH = px(18)
  const cw = (region.w - gap * 6) / 7
  const ch = (region.h - wdH - gap * (rows - 1)) / rows
  const out: { x: number; y: number; w: number; h: number }[] = []
  for (let i = 0; i < rows * 7; i++) {
    out.push({
      x: Math.round(region.x + (i % 7) * (cw + gap)),
      y: Math.round(region.y + wdH + Math.floor(i / 7) * (ch + gap)),
      w: cw,
      h: ch,
    })
  }
  return out
}

/** A day the trader actually traded. The grid's own predicate — NOT "is it in
 *  the days array", which also holds journalled, rated and sat-out days. */
export function isTraded(day: { tradeCount: number }): boolean {
  return day.tradeCount > 0
}

/** Which palette tone a token takes. The app's own assignment: win% and the
 *  ratio are GOLD, winners GREEN, losers RED, punctuation muted. */
export type Tone = 'gold' | 'win' | 'loss' | 'muted'

export interface Token {
  text: string
  tone: Tone
}

/**
 * The app's compact stat line, as COLOURED TOKENS: `67% · 2/1 · 70.25`.
 *
 * ONE line, exactly as CalendarGrid and WeeklyPanel draw it — win% then W/L then
 * the P&L ratio, each dropped when it is not real rather than faked to 0% or
 * NaN. The card previously stacked four lines; the app never did.
 *
 * TOKENS, not a string, because the app's line is coloured and a single fillText
 * can only be one colour. The first port flattened it to grey, which threw away
 * the whole point: the eye reads green-over-red before it reads the digits.
 */
export function statTokens(d: {
  winners: number
  losers: number
  winRate: number | null
  plRatio: number | null
}): Token[] {
  const out: Token[] = []
  const dot = () => out.push({ text: ' · ', tone: 'muted' })
  if (d.winRate != null) {
    out.push({ text: percent(d.winRate, 0), tone: 'gold' })
    dot()
  }
  out.push({ text: int(d.winners), tone: 'win' })
  out.push({ text: '/', tone: 'muted' })
  out.push({ text: int(d.losers), tone: 'loss' })
  if (d.plRatio != null) {
    dot()
    out.push({ text: d.plRatio.toFixed(2), tone: 'gold' })
  }
  return out
}

/**
 * The tokens that FIT a given width, trimmed in a stated order.
 *
 * MEASURED: the widest real line, `100% · 35/35 · 70.25`, needs ~192px and
 * wide's cell is 151px — the "70.25 over 89%" collision in Lao's export. So the
 * line drops tokens rather than painting over its neighbour:
 *   1. the P&L RATIO goes first. It is derivable from the W/L pair and the day's
 *      averages, and it is the third thing the eye reads.
 *   2. the WIN RATE goes next.
 *   3. W/L NEVER goes. Two integers are the irreducible fact of a trading day;
 *      a cell with no stat line at all is better than one with half a number.
 */
export function fitStatTokens(
  tokens: readonly Token[],
  maxWidth: number,
  widthOf: (text: string) => number,
): Token[] {
  const total = (t: readonly Token[]) => t.reduce((a, x) => a + widthOf(x.text), 0)
  let out = [...tokens]
  if (total(out) <= maxWidth) return out
  // drop the ratio: the trailing ' · ' plus the number after it
  const lastDot = out.map((t) => t.text).lastIndexOf(' · ')
  if (lastDot > 0 && lastDot < out.length - 1) out = out.slice(0, lastDot)
  if (total(out) <= maxWidth) return out
  // drop the win rate: the leading token plus its ' · '
  if (out.length > 2 && out[1]?.text === ' · ') out = out.slice(2)
  return out
}

/** The same line as plain text — what the tokens say, joined. */
export function statLine(d: {
  winners: number
  losers: number
  winRate: number | null
  plRatio: number | null
}): string {
  return statTokens(d).map((t) => t.text).join('')
}

/** The text in a day cell, honouring the unit and the mask.
 *
 *  Streamer mode forces percentage regardless of what was chosen — the choice is
 *  a preference, the mask is a rule. When a percentage cannot be computed the
 *  cell shows the withheld mark rather than falling back to dollars: a privacy
 *  setting that degrades to the thing it hides is not a privacy setting.
 *
 *  Outside streamer mode a missing percentage does NOT reach here, because
 *  resolveCardUnit has already turned the card back to dollars and the footer
 *  has said why. The em dash below is the last resort, not the normal path. */
export function dayCellText(
  day: { pnl: number; pct: number | null },
  unit: CalendarCardUnit,
  streamer: boolean,
): string {
  const effective: CalendarCardUnit = streamer ? 'percent' : unit
  if (effective === 'dollars') return signed(day.pnl)
  if (day.pct == null) return streamer ? MASKED_AMOUNT : '—'
  const s = day.pct >= 0 ? '+' : ''
  return `${s}${day.pct.toFixed(2)}%`
}

/**
 * A fee figure, in the unit the card is drawing.
 *
 * FEES ARE MONEY. A trader who picked percentages to keep dollar amounts off a
 * shareable image did not mean "except the fee line" — and the card was printing
 * `$4.32` in the header strip and again on every week card. Same three rules as
 * a day: the mask wins, then the unit, then an honest em dash when the
 * percentage cannot be computed. Unsigned, because the app's Fees stat is.
 */
export function feeText(
  fees: number,
  feesPct: number | null,
  unit: CalendarCardUnit,
  streamer: boolean,
): string {
  if (streamer) return MASKED_AMOUNT
  if (unit === 'dollars') return money(fees)
  return feesPct == null ? '—' : `${feesPct.toFixed(2)}%`
}

/** What the card actually draws, given what was chosen and what is knowable.
 *
 *  Streamer mode wins outright. Otherwise a percent card with no denominator
 *  falls back to dollars rather than printing a grid of dashes — and the footer
 *  states the fallback, so the reader is told rather than left to guess. */
export function resolveCardUnit(
  chosen: CalendarCardUnit,
  denominator: DenominatorState,
  streamer: boolean,
): CalendarCardUnit {
  if (streamer) return 'percent'
  if (chosen === 'percent' && denominator !== 'ok') return 'dollars'
  return chosen
}

/** The line naming the denominator, or stating its absence in words. Null when
 *  no percentage is drawn and there is nothing to explain. */
export function denominatorNote(
  chosen: CalendarCardUnit,
  denominator: DenominatorState,
  streamer: boolean,
): string | null {
  const drawsPercent = resolveCardUnit(chosen, denominator, streamer) === 'percent'
  if (denominator === 'ok') return drawsPercent ? '% of contributed capital' : null
  const why =
    denominator === 'non-positive'
      ? 'contributed capital is not positive'
      : 'no starting balance set'
  if (streamer) return `Percentages unavailable — ${why}`
  if (chosen === 'percent') return `Percentages unavailable (${why}) — showing dollars`
  return null
}

/** The month's heat scale. TWO numbers, not one.
 *
 *  BEAT 14, measured on the judging book's 2026-03: one day at 3.51x the
 *  second-largest owned 71.5% of the ratio range, so the other nineteen were
 *  squeezed into 32.5% of the usable alpha and the dense month rendered as one
 *  bright cell and nineteen identical ones. No curve fixes that — a sweep over
 *  the whole family that divides by the largest day tops out at 32.5% (powers)
 *  and 41.9% (logs), both far below the 60% the month needs to be legible.
 *
 *  So the body of the month is measured against a high percentile, and the day
 *  that broke the scale gets a reserved band above it. When there is no outlier
 *  the two numbers converge and the ramp is one band again — see heatAlpha. */
export interface HeatScale {
  /** The body's denominator: the 90th-percentile |pnl| over traded days. */
  anchor: number
  /** The largest |pnl| of the month. Always >= anchor. */
  max: number
}

/** How much of the month sits above the body's anchor. A tenth: high enough
 *  that one violent day cannot drag the anchor with it, low enough that the
 *  anchor is still a real trading day and not the middle of the month. */
const HEAT_ANCHOR_Q = 0.9

export function heatScale(days: readonly CalendarCardDay[]): HeatScale {
  const xs = days
    .filter(isTraded)
    .map((d) => Math.abs(d.pnl))
    .sort((a, b) => a - b)
  if (xs.length === 0) return { anchor: 0, max: 0 }
  const max = xs[xs.length - 1]
  // Linear-interpolated quantile. A one-day month gives that day back as the
  // anchor, which is what lands it at HEAT_MAX instead of at the knee.
  const pos = (xs.length - 1) * HEAT_ANCHOR_Q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  const anchor = xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)
  // A month where a tenth of the days scratched to exactly zero would divide by
  // that zero. The largest day is always a safe denominator.
  return { anchor: anchor > 0 ? anchor : max, max }
}

/** The poster's net, in scale units. Deliberately far above every other size in
 *  the module — the whole point of the poster is one number. */
export const HERO_NET_SIZE = 96

/**
 * THE HEADER'S TYPE SCALE. The net is the headline; the rest support it.
 *
 * It used to draw at px(13) alongside the fees, the trade count and W/L — four
 * numbers at one size, so nothing was the point of the card. `net` is a NEW
 * step above the module's existing px(13)/px(19)/px(20); everything else keeps
 * the size it had.
 *
 * Wide can carry more than portrait: a 1600px card has room for a 34-unit
 * headline where a 1080 one starts crowding the month label beside it.
 */
export const HEADER_NET_SIZE: Record<CalendarCardFormat, number> = {
  square: 46,
  portrait: 40,
  story: 26, // unused — the poster has its own hero
  wide: 34,
}

/**
 * How many supporting tiers a format's masthead carries.
 *
 * SQUARE gets TWO because it absorbed a footer: green days, best green run and
 * ending streak had to land somewhere, and they are qualifiers rather than
 * results, so they get their own quieter line.
 *
 * PORTRAIT and WIDE get ONE. They never had a footer, and wide is a landscape
 * card — a three-row masthead there is a third of the frame before the grid
 * starts. Fees joins their single tier rather than earning a row of its own.
 */
export const MASTHEAD_TIERS: Record<CalendarCardFormat, 1 | 2> = {
  square: 1,
  portrait: 1,
  story: 1, // unused
  wide: 1,
}

/**
 * SQUARE IS THE SHAREABLE ONE, so it carries the fewest facts at the largest
 * size. Two tiers of seven stats was still a spec sheet.
 *
 * KEPT: trading days, trades, W/L — the three that make the net BELIEVABLE. A
 * number with no denominator is a claim; with those three it is a result.
 *
 * DROPPED FROM SQUARE (and named in the close rather than vanished): fees, green
 * days, best green run, ending streak. They are reference facts a trader reads
 * in the app, not facts that make a shared number credible. Every one of them is
 * still on portrait and wide, which are the reference formats.
 */
export const MASTHEAD_STAT_COUNT: Record<CalendarCardFormat, number> = {
  square: 3,
  portrait: 4,
  story: 4, // unused
  wide: 4,
}

/**
 * THE MASTHEAD. Square's footer band is gone; its three facts moved up here, and
 * the header became the card's headline block rather than a strip of equals.
 *
 * EIGHT STATS IN A ROW IS A SPEC SHEET, so they are not in a row. Two tiers:
 *
 *   PRIMARY   the ones that describe the RESULT — trading days, trades, W/L.
 *             Larger, drawn first, left to right under the net.
 *   SECONDARY the ones that qualify it — green days, best green run, ending
 *             streak, fees. Smaller, a second line beneath.
 *
 * The split is "what happened" over "how it happened", which is the order a
 * trader reads a month in: the result, then the texture. Fees sits in the second
 * tier deliberately — it is a cost, not an outcome, and putting it level with
 * the net was half of what made the old header read flat.
 */
export const MASTHEAD_FORMATS: CalendarCardFormat[] = ['square', 'portrait', 'wide']

/** Every other stat in the strip. Unchanged from before this step. */
export const HEADER_STAT_SIZE = 13
/** The masthead's two supporting tiers. Primary describes the result; secondary
 *  qualifies it. Both are well below the net — that is the point of a masthead. */
export const MASTHEAD_PRIMARY_SIZE_BY_FORMAT: Record<CalendarCardFormat, number> = {
  square: 30,
  portrait: 17,
  story: 17, // unused
  wide: 17,
}
/** The default, for anything that has not opted into a size of its own. */
export const MASTHEAD_PRIMARY_SIZE = 17
export const MASTHEAD_SECONDARY_SIZE = 12

/** The header band's height, which has to grow with the headline it carries.
 *  Shared by cardRegions and the compositor so the band and its contents cannot
 *  disagree about where the band ends. */

export function headerHeightOf(format: CalendarCardFormat, px: (n: number) => number): number {
  // The stack, spelled out rather than guessed at, so a change to any term moves
  // the band instead of pushing ink out of it:
  //   brand baseline + half its glyph
  //   gap + the NET's own label and full height
  //   gap + the primary tier (label + value)
  //   gap + the secondary tier (label + value)
  //   a bottom breath
  const second =
    MASTHEAD_TIERS[format] === 2 ? px(12) + px(8) + px(MASTHEAD_SECONDARY_SIZE) : 0
  return (
    px(26) +
    px(19) / 2 +
    px(10) +
    px(9) +
    px(HEADER_NET_SIZE[format]) +
    px(14) +
    px(9) +
    px(MASTHEAD_PRIMARY_SIZE_BY_FORMAT[format]) +
    second +
    px(12)
  )
}

/** The footer band's own headline / supporting pair (square). */
export const FOOTER_LEAD_SIZE = 22
export const FOOTER_STAT_SIZE = 15

/** Does one day dominate the month enough to be worth calling out? Twice the
 *  next best, and at least a fifth of the month's green. Otherwise the card says
 *  nothing rather than crowning a day that was merely first. */
export function standsOut(
  day: { pnl: number },
  traded: readonly { pnl: number }[],
): boolean {
  const greens = traded.filter((d) => d.pnl > 0).map((d) => d.pnl).sort((a, b) => b - a)
  if (greens.length < 2) return greens.length === 1
  const total = greens.reduce((a, b) => a + b, 0)
  return day.pnl >= greens[1] * 2 && day.pnl >= total * 0.2
}

const HEAT_MIN = 0.08
const HEAT_MAX = 0.4
/** The body's ceiling once the largest day is at least twice the anchor. The
 *  0.06 above it is the outlier's own band — the same separation that tells the
 *  top two days of an ordinary month apart, reserved for the day that broke the
 *  scale so it still reads as exceptional rather than merely first. */
const HEAT_KNEE = 0.34

/**
 * A day's fill strength, 0..1.
 *
 * TWO BANDS, because one band anchored to the largest day is precisely what made
 * the dense month unreadable (see heatScale). Days up to the anchor spread
 * LINEARLY across [HEAT_MIN, bodyTop]; days above it share the reserved band up
 * to HEAT_MAX. The floor still keeps a real trading day visible at thumbnail
 * size; the ceiling still keeps text readable on top.
 *
 * The square root this replaced was compensating for the wrong denominator. It
 * existed so an outlier month would not render as one coloured cell and thirty
 * ghosts — but the anchor does that job now, and a square root applied on top of
 * an already-normalised body re-compresses exactly the middle this is trying to
 * open up: on the measured March, 68.4% of the usable range with a linear body
 * against 48.7% with sqrt.
 *
 * bodyTop SLIDES with the outlier's excess instead of switching on it, so a
 * month whose largest day is 0.1% above the anchor is not painted like a month
 * with a genuine outlier. That is what stops contrast being manufactured out of
 * noise — a rank-position ramp would score perfectly on spread and lie.
 */
export function heatAlpha(pnl: number, scale: HeatScale): number {
  const { anchor, max } = scale
  if (!(max > 0) || !Number.isFinite(max) || !(anchor > 0)) return HEAT_MIN
  const x = Math.abs(pnl)
  const excess = Math.min(1, (max - anchor) / anchor)
  const bodyTop = HEAT_MAX - (HEAT_MAX - HEAT_KNEE) * excess
  if (x <= anchor) return HEAT_MIN + (bodyTop - HEAT_MIN) * (x / anchor)
  const span = max - anchor
  if (span <= 0) return bodyTop
  return bodyTop + (HEAT_MAX - bodyTop) * Math.min(1, (x - anchor) / span)
}

/** Alpha as the two hex digits a #rrggbb token takes as a suffix. Keeps every
 *  colour a palette token plus transparency — never a new literal. */
function alphaHex(a: number): string {
  const v = Math.max(0, Math.min(255, Math.round(a * 255)))
  return v.toString(16).padStart(2, '0')
}

/** What a touched-but-untraded day says about itself. The app knows which of
 *  these it was, so the card says which rather than flattening all three. */
export function markedLabel(day: {
  noTrade: boolean
  holiday: boolean
  hasJournal?: boolean
}): string {
  if (day.holiday) return 'MARKET CLOSED'
  if (day.noTrade) return 'sat out'
  if (day.hasJournal) return 'journaled'
  return 'no trades'
}

const imageCache = new Map<string, Promise<HTMLImageElement | null>>()
function loadImage(url: string): Promise<HTMLImageElement | null> {
  let p = imageCache.get(url)
  if (!p) {
    p = (async () => {
      try {
        const img = new Image()
        img.src = url
        await img.decode()
        return img
      } catch {
        // A missing decoration must never cost the trader the export.
        return null
      }
    })()
    imageCache.set(url, p)
  }
  return p
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface Paint {
  ctx: CanvasRenderingContext2D
  BORDER: string
  px: (n: number) => number
  BG: string
  GOLD: string
  WHITE: string
  WIN: string
  LOSS: string
  MUTED: string
  DIVIDER: string
  streamer: boolean
  drawnUnit: CalendarCardUnit
  closedSign: HTMLImageElement | null
}

const toneOf = (p: Paint, v: number) => (v > 0 ? p.WIN : v < 0 ? p.LOSS : p.WHITE)

/** A token's tone, resolved against the palette the card already uses. */
function colourOf(p: Paint, tone: Tone): string {
  return tone === 'gold' ? p.GOLD : tone === 'win' ? p.WIN : tone === 'loss' ? p.LOSS : p.MUTED
}

/**
 * Draw a coloured run of tokens on one baseline.
 *
 * Canvas has no inline colour, so each token is its own fillText and the pen
 * advances by the measured width. `align` positions the WHOLE run, since the
 * per-token calls must all be left-aligned to sit end to end.
 */
function drawTokens(
  p: Paint,
  tokens: readonly Token[],
  x: number,
  y: number,
  align: 'left' | 'center' | 'right' = 'left',
): void {
  const { ctx } = p
  const prev = ctx.textAlign
  ctx.textAlign = 'left'
  const total = tokens.reduce((a, t) => a + ctx.measureText(t.text).width, 0)
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x
  for (const t of tokens) {
    ctx.fillStyle = colourOf(p, t.tone)
    ctx.fillText(t.text, cx, y)
    cx += ctx.measureText(t.text).width
  }
  ctx.textAlign = prev
}

/**
 * One day cell, carrying what the app's cell carries.
 *
 * The numeral top-left and the `{n}t` badge top-right, the P&L hero centred, and
 * the app's ONE stat line beneath it. A holiday gets the app's own closed sign
 * and its MARKET CLOSED label; a tagged day gets its first tag. Compact mode
 * drops the stat line when a cell is too short to hold it honestly — a stat line
 * overlapping the numeral above it is worse than no stat line.
 */
/**
 * THE CELL'S OWN TYPE SCALE.
 *
 * MEASURED: wide's cell is 151px against square's 143 — 6% wider — while its
 * type was 48% bigger, because every size in the module scaled from CANVAS
 * width. So the largest card showed the LEAST per cell and was the only one
 * trimming the P&L ratio away.
 *
 * A cell's type belongs to the cell. This returns the same px() shape the rest
 * of the module uses, based on a 150px reference cell — the width both square
 * and wide land near — so a wider cell gets proportionally larger type and a
 * narrower one shrinks instead of overflowing.
 */
export function cellPx(cellW: number): (n: number) => number {
  const k = cellW / 150
  return (n: number) => Math.round(n * k)
}

function drawDayCell(
  p: Paint,
  b: Box,
  cell: GridCell,
  day: CalendarCardDay | undefined,
  scale: HeatScale,
): void {
  const { ctx } = p
  // Type from the CELL; geometry (radius, insets) still from the canvas, since
  // a corner radius is a property of the card's drawing style, not of the cell.
  const px = cellPx(b.w)
  const gpx = p.px
  const traded = day != null && isTraded(day)
  const r = gpx(8)

  // CHROME FOLLOWS THE DAY, not the calendar.
  //
  // MEASURED on the August export: 29 of 31 in-month cells were an opaque
  // border-token outline around nothing, and the two days actually traded
  // had to be found among them. Outlining every cell equally is the one thing
  // that makes three states hard to tell apart at a glance — the box says "a
  // day happened here" about a day on which nothing did.
  //
  // So a cell gets chrome when it has something to say, and the fill still
  // carries which:
  //   traded    heat, scaled to the month's biggest day, plus the outline
  //   touched   a faint wash plus the outline — it happened, it was not a
  //             trading day
  //   untouched nothing. The numeral alone, at 0.45 against out-of-month's
  //             0.30, which is now the ONLY thing separating those two and is
  //             locked down by D6.
  if (cell.inMonth && day) {
    if (traded) {
      ctx.fillStyle = `${toneOf(p, day.pnl)}${alphaHex(heatAlpha(day.pnl, scale))}`
    } else {
      ctx.fillStyle = `${p.MUTED}${alphaHex(0.05)}`
    }
    roundRect(ctx, b.x, b.y, b.w, b.h, r)
    ctx.fill()
    ctx.strokeStyle = p.BORDER
    ctx.lineWidth = 1
    roundRect(ctx, b.x, b.y, b.w, b.h, r)
    ctx.stroke()
  }

  // Numeral. Out-of-month days are quieter still — the app dims them too.
  ctx.textAlign = 'left'
  ctx.font = `600 ${px(11)}px ${FONT}`
  ctx.fillStyle = !cell.inMonth
    ? `${p.MUTED}${alphaHex(0.3)}`
    : day
      ? p.MUTED
      : `${p.MUTED}${alphaHex(0.45)}`
  ctx.fillText(String(cell.day), b.x + px(9), b.y + px(14))

  if (!day || !cell.inMonth) return

  if (!traded) {
    if (day.holiday && p.closedSign) {
      const s = Math.min(b.w, b.h) * 0.42
      ctx.drawImage(p.closedSign, b.x + (b.w - s) / 2, b.y + b.h * 0.24, s, s)
    }
    ctx.textAlign = 'center'
    ctx.font = `600 ${px(9)}px ${FONT}`
    ctx.fillStyle = `${p.MUTED}${alphaHex(0.75)}`
    ctx.fillText(markedLabel(day), b.x + b.w / 2, b.y + b.h * 0.78)
    ctx.textAlign = 'left'
    return
  }

  // The trade-count badge, top-right — the app's `{n}t`.
  ctx.textAlign = 'right'
  ctx.font = `600 ${px(10)}px ${FONT}`
  ctx.fillStyle = p.MUTED
  ctx.fillText(`${day.tradeCount}t`, b.x + b.w - px(9), b.y + px(14))

  // Hero, centred, then the app's one stat line under it.
  ctx.textAlign = 'center'
  const cx = b.x + b.w / 2
  // Two thresholds, in scaled units so they mean the same thing at 1080 and at
  // 1600: a cell tall enough for the stat line under the hero, and a taller one
  // that can also carry the day's tag. Below the first, the hero alone — a stat
  // line overlapping the numeral above it is worse than no stat line.
  const roomy = b.h >= px(56)
  const tagRoom = b.h >= px(78)
  ctx.font = `700 ${px(roomy ? 17 : 14)}px ${FONT}`
  ctx.fillStyle = toneOf(p, day.pnl)
  ctx.fillText(dayCellText(day, p.drawnUnit, p.streamer), cx, b.y + b.h * (roomy ? 0.5 : 0.58))

  if (roomy) {
    ctx.font = `600 ${px(10)}px ${FONT}`
    const inset = px(9)
    const fitted = fitStatTokens(statTokens(day), b.w - inset * 2, (t) =>
      ctx.measureText(t).width,
    )
    if (fitted.length > 0) drawTokens(p, fitted, cx, b.y + b.h * 0.72, 'center')
    if (tagRoom && day.tags.length > 0) {
      ctx.font = `600 ${px(8)}px ${FONT}`
      ctx.fillStyle = `${p.MUTED}${alphaHex(0.7)}`
      ctx.fillText(
        day.tags.length > 1 ? `${day.tags[0]} +${day.tags.length - 1}` : day.tags[0],
        cx,
        b.y + b.h * 0.88,
      )
    }
  }
  ctx.textAlign = 'left'
}

/**
 * One week card — WeeklyPanel, ported.
 *
 * Range and `{n}t` on the header row, the net P&L hero, the app's stat line, and
 * the quiet supporting tier: the streak (only at two days or more, as the panel
 * gates it), journaling coverage, the top tagged mistake and the fee drag. A
 * week with no trades gets the panel's own reduced variant.
 */
/** What a re-totalled week says about its own figures. Named once so the guard
 *  and the card cannot drift apart on the wording. */
const SCOPED_MARK = 'THIS MONTH ONLY'

/**
 * THE MONTH FOLD, in the space the starved rail gave back.
 *
 * A hairline above it, then one line per fact at the tier's own px(14) rhythm.
 * The rule matters: without it the fold reads as a sixth week card with its
 * header missing. Tones come from the line itself, so a mistake is loss-red and
 * coverage is gold exactly as the same facts are in the week tier.
 */
function drawFold(p: Paint, b: Box, lines: readonly FoldLine[]): void {
  const { ctx, px } = p
  if (lines.length === 0) return
  ctx.strokeStyle = p.DIVIDER
  ctx.lineWidth = Math.max(1, px(1))
  ctx.beginPath()
  ctx.moveTo(b.x, b.y)
  ctx.lineTo(b.x + b.w, b.y)
  ctx.stroke()

  // DISTRIBUTED, not top-packed. Measured before this: 47-69% of the fold's
  // region was air below the last line, which read as a block that had fallen
  // to the top of an empty box rather than a composed panel.
  //
  // THE LEADING IS CAPPED at px(26), a little under twice the px(14) minimum.
  // Without a cap a two-line fold stretches to the region's edges and stops
  // being one thing — the reader gets two unrelated sentences at opposite ends
  // of a gap. Capped, five lines and two lines both read as a block; the air
  // that is left over is then SPLIT above and below, so the block sits in its
  // region instead of hanging from the top of it.
  const n = lines.length
  const leading =
    n > 1
      ? Math.min(px(26), Math.max(px(14), Math.floor((b.h - px(16) - px(10)) / (n - 1))))
      : 0
  let y = b.y + (b.h - leading * (n - 1)) / 2
  for (const l of lines) {
    ctx.font = `600 ${px(10)}px ${FONT}`
    ctx.fillStyle =
      l.tone === 'win'
        ? p.WIN
        : l.tone === 'loss'
          ? `${p.LOSS}${alphaHex(0.9)}`
          : l.tone === 'gold'
            ? `${p.GOLD}${alphaHex(0.8)}`
            : `${p.MUTED}${alphaHex(0.8)}`
    ctx.fillText(l.text, b.x + px(12), y)
    y += leading
  }
}

function drawWeekCard(
  p: Paint,
  b: Box,
  w: CalendarCardWeek,
  chipRow = false,
  oneLine = false,
): void {
  const { ctx, px } = p
  ctx.fillStyle = `${p.MUTED}${alphaHex(w.inMonth ? 0.06 : 0.03)}`
  roundRect(ctx, b.x, b.y, b.w, b.h, px(8))
  ctx.fill()
  ctx.strokeStyle = w.netPnl !== 0 ? `${p.GOLD}${alphaHex(0.3)}` : p.DIVIDER
  ctx.lineWidth = Math.max(1, px(1))
  roundRect(ctx, b.x, b.y, b.w, b.h, px(8))
  ctx.stroke()

  const lx = b.x + px(12)
  ctx.textAlign = 'left'
  ctx.font = `600 ${px(9)}px ${FONT}`
  ctx.fillStyle = p.MUTED
  // UPPERCASE, matching WeeklyPanel: its range, its trade count and its entire
  // supporting tier all carry `uppercase tracking-wider`, so on screen they read
  // JUL 26-AUG 1 / 16T / 3-DAY LOSS. The card was drawing them mixed-case, which
  // is the one casing difference between the two.
  const range = `${shortMonthDay(w.weekStart)}–${shortMonthDay(w.weekEnd)}`.toUpperCase()
  ctx.fillText(range, lx, b.y + px(15))
  // THE STRADDLE MARK RIDES THE RANGE LINE. The range says WHICH week; this says
  // which PART of it the figures cover, and it sits beside the thing it
  // qualifies instead of at the bottom of a stack that gets cut for room.
  //
  // It costs no height: the row already exists and the row already ends early.
  // Measured room between the range and the right-aligned {n}T chip, on the
  // book's own straddles — wide 235px for a 126px string, portrait 920px for
  // 90px. The wording stays "THIS MONTH ONLY"; "PART WEEK" fits too but leaves a
  // reader guessing WHICH part.
  if (w.scoped === true) {
    ctx.fillStyle = `${p.GOLD}${alphaHex(0.8)}`
    ctx.fillText(SCOPED_MARK, lx + ctx.measureText(range).width + px(8), b.y + px(15))
    ctx.fillStyle = p.MUTED
  }
  ctx.textAlign = 'right'
  ctx.fillText(`${int(w.tradeCount)}T`, b.x + b.w - px(12), b.y + px(15))
  ctx.textAlign = 'left'

  if (w.tradeCount === 0) {
    // FIXED offsets, on the populated branch's rhythm.
    //
    // These two used to be a fixed px(15) range and a PROPORTIONAL b.h * 0.55
    // "No trades". At the floor height that put them 4px into each other in
    // portrait and 6px in wide — two lines printed through one another, on every
    // quiet week of every export. A card twice the floor looked fine, which is
    // why only empty weeks ever showed it. Mixing a fixed offset with a
    // proportional one inside a box whose height varies is the whole bug.
    ctx.font = `600 ${px(11)}px ${FONT}`
    ctx.fillStyle = `${p.MUTED}${alphaHex(0.8)}`
    ctx.fillText('NO TRADES', lx, b.y + px(32))
    if (w.daysJournaled > 0) {
      ctx.font = `600 ${px(9)}px ${FONT}`
      ctx.fillStyle = `${p.GOLD}${alphaHex(0.7)}`
      ctx.fillText(`${int(w.daysJournaled)} JOURNALED`, lx, b.y + px(46))
    }
    return
  }

  if (oneLine) {
    // ONE LINE, starved rail only. The net drops from px(20) to px(15) and the
    // stat line moves up beside it instead of onto its own row at px(60).
    //
    // WHY THE STAT LINE STAYS. Dropping it would have been 18 scale-units
    // cheaper and it was the first thing I tried to cut: it is the only place
    // the rail says W/L, win rate and P:L, and statTokens is shared with the day
    // cell, so cutting it here would have made the rail the one surface in the
    // app that reports a week without reporting how it was won. The net alone is
    // a scoreboard; the net with its stat line is a week.
    const net = dayCellText({ pnl: w.netPnl, pct: w.netPct }, p.drawnUnit, p.streamer)
    ctx.font = `700 ${px(15)}px ${FONT}`
    ctx.fillStyle = toneOf(p, w.netPnl)
    ctx.fillText(net, lx, b.y + px(34))
    const after = lx + ctx.measureText(net).width + px(10)
    ctx.font = `600 ${px(9)}px ${FONT}`
    drawTokens(p, statTokens(w), after, b.y + px(34))
    return
  }

  ctx.font = `700 ${px(20)}px ${FONT}`
  ctx.fillStyle = toneOf(p, w.netPnl)
  ctx.fillText(
    dayCellText({ pnl: w.netPnl, pct: w.netPct }, p.drawnUnit, p.streamer),
    lx,
    b.y + px(42),
  )

  ctx.font = `600 ${px(10)}px ${FONT}`
  drawTokens(p, statTokens(w), lx, b.y + px(60))

  // The supporting tier, in the panel's own order — and only the lines this box
  // has room for. Six equal cards used to hand portrait 69px for 150px of
  // content and the remainder painted onto the next card.
  const lines = fitTierLines(w, b.h, px, chipRow)
  let ty = b.y + px(78)
  const line = (text: string, color: string) => {
    ctx.font = `600 ${px(9)}px ${FONT}`
    ctx.fillStyle = color
    ctx.fillText(text, lx, ty)
    ty += px(14)
  }
  for (const k of lines) {
    if (k === 'streak') {
      line(
        `${w.streak.days}-DAY ${w.streak.kind.toUpperCase()}`,
        w.streak.kind === 'win' ? p.WIN : p.LOSS,
      )
    } else if (k === 'journaled') {
      line(`${int(w.daysJournaled)}/${int(w.daysTraded)} JOURNALED`, `${p.GOLD}${alphaHex(0.7)}`)
    } else if (k === 'mistake' && w.topMistake) {
      line(w.topMistake.name.toUpperCase(), `${p.LOSS}${alphaHex(0.8)}`)
    } else if (k === 'fees') {
      line(
        `${feeText(w.totalFees, w.feesPct, p.drawnUnit, p.streamer)} FEES`,
        `${p.MUTED}${alphaHex(0.8)}`,
      )
    }
  }
}

/**
 * Compose the card.
 *
 * EXACT PIXEL SIZE, and a layout chosen to fill it. Type and padding scale by
 * `unit = W / 1000`, the chart card's rule; there is no second scaling idiom.
 *
 * A LOSING MONTH IS A FINISHED CARD. Every element a winning month draws, a
 * losing one draws — header, grid, rail, totals. The only difference is the
 * colour of the numbers and which streak is true.
 */
export async function composeCalendarCard(
  data: CalendarCardData,
  theme: ResolvedTheme,
  format: CalendarCardFormat = 'square',
): Promise<HTMLCanvasElement> {
  const spec = CALENDAR_CARD_FORMATS[format]
  const W = spec.w
  const H = spec.h
  const unitPx = W / 1000
  const px = (n: number): number => Math.round(n * unitPx)

  const palette = chartColors(theme)
  const streamer = readStreamerMode()
  const drawnUnit = resolveCardUnit(data.unit, data.denominator, streamer)
  const note = denominatorNote(data.unit, data.denominator, streamer)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable for calendar card composite')
  if (document.fonts?.ready) await document.fonts.ready

  const [icon, closedSign] = await Promise.all([
    loadImage(iconUrl),
    loadImage(closedSignUrl),
  ])

  const p: Paint = {
    ctx,
    px,
    BG: palette.background,
    GOLD: palette.sideA,
    WHITE: palette.fgPrimary,
    WIN: palette.win,
    LOSS: palette.loss,
    MUTED: palette.axis,
    DIVIDER: palette.grid,
    BORDER: palette.border,
    streamer,
    drawnUnit,
    closedSign,
  }

  ctx.fillStyle = p.BG
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  const isPoster = spec.layout === 'poster'

  // THE BANDS. The header strip and the footer sat on the same flat surface as
  // the grid, so the card had no hierarchy — three tiers of information reading
  // as one sheet. Each chrome band now takes a faint wash of the app's own muted
  // token over the ground, with the divider the card already drew. The GRID
  // STAYS THE GROUND: it is the subject, and washing it would flatten the card
  // again from the other direction.
  const BAND = `${p.MUTED}${alphaHex(0.05)}`

  const pad = px(20)
  const headerH = headerHeightOf(format, px)

  // THE POSTER SKIPS ALL OF THIS. It draws its own brand line inside the safe
  // band and its own hero; running this block too put FUGAEDGE and a stat strip
  // at y=19 — 230px above the top of the area a story may put words in.
  if (!isPoster) {
  // ── Header: brand, month, and the app's own strip — Net / Fees / Trading days
  //    / Trades / W/L. NO ACCOUNT NAME, ever.
  // The band, then a hairline at its edge — the app's own cell border at the
  // weight the grid already uses, so the three zones read as three zones rather
  // than as one sheet with a slightly different tint at the top.
  ctx.fillStyle = BAND
  ctx.fillRect(0, 0, W, headerH)
  ctx.strokeStyle = p.BORDER
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, headerH + 0.5)
  ctx.lineTo(W, headerH + 0.5)
  ctx.stroke()

  // Rows derived from the HEADLINE, not from fractions of the band: everything
  // below the net moves when the net does, so a bigger headline grows the band
  // rather than pushing ink out of it.
  const midY = px(26)
  const iconSize = px(30)
  if (icon) ctx.drawImage(icon, pad, midY - iconSize / 2, iconSize, iconSize)
  ctx.font = `700 ${px(19)}px ${FONT}`
  ctx.fillStyle = p.GOLD
  ctx.fillText('FUGAEDGE', pad + iconSize + px(11), midY)
  ctx.font = `600 ${px(19)}px ${FONT}`
  ctx.fillStyle = p.WHITE
  ctx.textAlign = 'right'
  ctx.fillText(data.monthLabel, W - pad, midY)
  ctx.textAlign = 'left'

  const tradedDays = data.days.filter(isTraded)
  const greenDays = tradedDays.filter((d) => d.pnl > 0).length
  const streakText =
    data.currentStreak.kind === 'none'
      ? '—'
      : `${data.currentStreak.days} ${data.currentStreak.kind === 'win' ? 'GREEN' : 'RED'}`

  // TIER ONE — what happened. Tier two — how it happened. A trader reads a
  // month in that order, and eight stats on one line is a table, not a card.
  const fees: { label: string; tokens: Token[] } = {
    label: 'Fees',
    tokens: [
      { text: feeText(data.monthFees, data.monthFeesPct, drawnUnit, streamer), tone: 'muted' as Tone },
    ],
  }
  const allPrimary: { label: string; tokens: Token[] }[] = [
    { label: 'Trading days', tokens: [{ text: int(tradedDays.length), tone: 'muted' }] },
    { label: 'Trades', tokens: [{ text: int(data.tradeCount), tone: 'muted' }] },
    {
      label: 'W/L',
      tokens: [
        { text: int(data.monthWinners), tone: 'win' },
        { text: '/', tone: 'muted' },
        { text: int(data.monthLosers), tone: 'loss' },
      ],
    },
    ...(MASTHEAD_TIERS[format] === 1 ? [fees] : []),
  ]
  const primary = allPrimary.slice(0, MASTHEAD_STAT_COUNT[format])
  const secondary: { label: string; tokens: Token[] }[] = [
    {
      label: 'Green days',
      tokens: [
        { text: int(greenDays), tone: 'win' },
        { text: ` of ${int(tradedDays.length)}`, tone: 'muted' },
      ],
    },
    { label: 'Best green run', tokens: [{ text: int(data.longestGreenRun), tone: 'muted' }] },
    {
      label: 'Ending streak',
      tokens: [
        { text: streakText, tone: data.currentStreak.kind === 'loss' ? 'loss' : ('win' as Tone) },
      ],
    },
    fees,
  ]

  // THE NET, on its own line and at masthead scale — the headline, not one of
  // eight equals. Everything below it is support.
  const netSize = HEADER_NET_SIZE[format]
  const netHalf2 = px(netSize) / 2
  const netLabelY = px(26) + px(19) / 2 + px(10) + px(9) / 2
  const netY = netLabelY + px(9) / 2 + netHalf2
  ctx.textAlign = 'left'
  ctx.font = `600 ${px(9)}px ${FONT}`
  ctx.fillStyle = p.MUTED
  ctx.fillText('NET', pad, netLabelY)
  ctx.font = `700 ${px(netSize)}px ${FONT}`
  ctx.fillStyle = toneOf(p, data.monthPnl)
  ctx.fillText(
    dayCellText({ pnl: data.monthPnl, pct: data.monthPct }, drawnUnit, streamer),
    pad,
    netY,
  )

  const tier = (
    cells: { label: string; tokens: Token[] }[],
    labelY: number,
    valueY: number,
    size: number,
  ) => {
    const step = (W - pad * 2) / cells.length
    cells.forEach((cell, i) => {
      const cx = pad + step * i
      ctx.font = `600 ${px(9)}px ${FONT}`
      ctx.fillStyle = p.MUTED
      ctx.fillText(cell.label.toUpperCase(), cx, labelY)
      ctx.font = `700 ${px(size)}px ${FONT}`
      drawTokens(p, cell.tokens, cx, valueY)
    })
  }
  const primarySize = MASTHEAD_PRIMARY_SIZE_BY_FORMAT[format]
  const p1LabelY = netY + netHalf2 + px(14) + px(9) / 2
  const p1ValueY = p1LabelY + px(9) / 2 + px(primarySize) / 2 + px(4)
  tier(primary, p1LabelY, p1ValueY, primarySize)
  if (MASTHEAD_TIERS[format] === 2) {
    const p2LabelY = p1ValueY + px(primarySize) / 2 + px(12) + px(9) / 2
    const p2ValueY = p2LabelY + px(9) / 2 + px(MASTHEAD_SECONDARY_SIZE) / 2 + px(4)
    tier(secondary, p2LabelY, p2ValueY, MASTHEAD_SECONDARY_SIZE)
  }
  }

  // ── The body. Each layout arranges the SAME elements — grid, rail, note —
  //    into the space its format actually has.
  const allCells = buildCells(data.year, data.month)
  const rows = visibleRows(allCells)
  const regions = cardRegions(format, note != null)
  const regionOf = (n: Region['name']) => regions.find((r) => r.name === n)
  const cells = allCells.slice(0, rows * 7)
  const weeks = data.weeks.slice(0, rows)
  const byDate = new Map(data.days.map((d) => [d.date, d]))
  const scale = heatScale(data.days)

  // Returns the y the grid actually ended at, so a layout can place whatever
  // follows against real content rather than against its own allowance.
  // ONE geometry source for the grid: the compositor draws these boxes and the
  // overflow guard measures against the same call. Re-deriving the layout in the
  // test is how a guard ends up agreeing with itself about the wrong thing.
  const drawGrid = (region: Region) => {
    const wdH = px(18)
    const boxes = gridCellBoxes(region, rows, px)
    ctx.font = `600 ${px(9)}px ${FONT}`
    ctx.fillStyle = p.MUTED
    WEEKDAYS.forEach((wd, i) => {
      ctx.fillText(wd, boxes[i].x, region.y + wdH / 2)
    })
    cells.forEach((cell, i) => {
      if (!boxes[i]) return
      drawDayCell(p, boxes[i], cell, byDate.get(cell.date), scale)
    })
  }

  const drawRailColumn = (region: Region) => {
    const shown = collapseEmptyWeeks(weeks)
    const plan = planRail(region, shown, px)
    plan.cards.forEach((b, i) => drawWeekCard(p, b, shown[i], false, plan.starved))
    if (plan.fold) {
      drawFold(p, plan.fold, fitFoldLines(foldLines(data, shown), plan.fold.h, px))
    }
  }

  const G = regionOf('grid')
  const R = regionOf('rail')
  if (spec.layout === 'grid-rail-right') {
    // The app's own shape: grid left, rail right. The rail runs to the frame —
    // the denominator note is short and sits under the GRID, on the left, so
    // reserving its height on the right too would buy a hundred pixels of
    // nothing beside the last week card.
    drawGrid(G!)
    drawRailColumn(R!)
  } else if (spec.layout === 'grid-rail-below') {
    drawGrid(G!)
    drawRailColumn(R!)
  } else if (spec.layout === 'poster') {
    // THE POSTER. Seen full-screen for about five seconds, so it is built around
    // one number. No week rail, no day chips: a rail is a reference object, read
    // leaning in, and nobody leans into a story.
    const HD = regionOf('header')!
    const HERO = regionOf('hero')!
    const STATS = regionOf('stats')!
    const CLOSE = regionOf('footer')!

    // brand + month, on one line
    ctx.textAlign = 'left'
    ctx.font = `700 ${px(22)}px ${FONT}`
    ctx.fillStyle = p.GOLD
    if (icon) ctx.drawImage(icon, HD.x, HD.y + (HD.h - px(34)) / 2, px(34), px(34))
    ctx.fillText('FUGAEDGE', HD.x + px(34) + px(12), HD.y + HD.h / 2)
    ctx.textAlign = 'right'
    ctx.font = `600 ${px(22)}px ${FONT}`
    ctx.fillStyle = p.MUTED
    ctx.fillText(data.monthLabel.toUpperCase(), HD.x + HD.w, HD.y + HD.h / 2)

    // THE NET, hero scale — by far the largest thing on the card
    ctx.textAlign = 'center'
    ctx.font = `600 ${px(20)}px ${FONT}`
    ctx.fillStyle = p.MUTED
    ctx.fillText('NET', HERO.x + HERO.w / 2, HERO.y + px(22))
    ctx.font = `700 ${px(HERO_NET_SIZE)}px ${FONT}`
    ctx.fillStyle = toneOf(p, data.monthPnl)
    ctx.fillText(
      dayCellText({ pnl: data.monthPnl, pct: data.monthPct }, drawnUnit, streamer),
      HERO.x + HERO.w / 2,
      HERO.y + HERO.h * 0.62,
    )

    // the supporting row, large enough to read at arm's length
    const tradedDays = data.days.filter(isTraded)
    const stats: { label: string; tokens: Token[] }[] = [
      { label: 'TRADING DAYS', tokens: [{ text: int(tradedDays.length), tone: 'muted' }] },
      { label: 'TRADES', tokens: [{ text: int(data.tradeCount), tone: 'muted' }] },
      {
        label: 'W/L',
        tokens: [
          { text: int(data.monthWinners), tone: 'win' },
          { text: '/', tone: 'muted' },
          { text: int(data.monthLosers), tone: 'loss' },
        ],
      },
      {
        label: 'FEES',
        tokens: [
          { text: feeText(data.monthFees, data.monthFeesPct, drawnUnit, streamer), tone: 'muted' },
        ],
      },
    ]
    const sw = STATS.w / stats.length
    stats.forEach((cell, i) => {
      const cx = STATS.x + sw * (i + 0.5)
      ctx.textAlign = 'center'
      ctx.font = `600 ${px(13)}px ${FONT}`
      ctx.fillStyle = p.MUTED
      ctx.fillText(cell.label, cx, STATS.y + px(20))
      ctx.font = `700 ${px(30)}px ${FONT}`
      drawTokens(p, cell.tokens, cx, STATS.y + px(58), 'center')
    })
    ctx.textAlign = 'left'

    // the month grid, compact and full width — the visual signature
    drawGrid(G!)

    // the closing line: the standout day if the month has one, then the streak
    const best = tradedDays.reduce<CalendarCardDay | null>(
      (a, d) => (a == null || d.pnl > a.pnl ? d : a),
      null,
    )
    const closing: string[] = []
    if (best && best.pnl > 0 && standsOut(best, tradedDays)) {
      closing.push(
        `BEST DAY ${shortMonthDay(best.date).toUpperCase()} · ` +
          dayCellText(best, drawnUnit, streamer),
      )
    }
    if (data.currentStreak.kind !== 'none' && data.currentStreak.days >= 2) {
      closing.push(
        `${data.currentStreak.days}-DAY ${data.currentStreak.kind === 'win' ? 'GREEN' : 'RED'} INTO NEXT MONTH`,
      )
    } else if (data.longestGreenRun >= 2) {
      closing.push(`BEST GREEN RUN ${data.longestGreenRun} DAYS`)
    }
    ctx.textAlign = 'center'
    ctx.font = `600 ${px(16)}px ${FONT}`
    ctx.fillStyle = p.MUTED
    closing.slice(0, 2).forEach((line, i) => {
      ctx.fillText(line, CLOSE.x + CLOSE.w / 2, CLOSE.y + px(22) + i * px(30))
    })
    ctx.textAlign = 'left'
  } else {
    // grid-footer keeps its NAME and has lost its footer. Its three facts —
    // green days, best green run, ending streak — moved up into the masthead,
    // where they qualify the net instead of sitting in a band of their own at
    // the bottom of the card. The grid takes the height that released.
    drawGrid(G!)
  }

  // ── The denominator line. A percentage that does not say what it is a
  //    percentage OF is a number nobody can check, and an absent denominator
  //    stated in words beats a dash a reader will take for zero.
  if (note) {
    const N = regionOf('note')!
    ctx.font = `600 ${px(11)}px ${FONT}`
    ctx.fillStyle = p.MUTED
    ctx.fillText(note, N.x, N.y + N.h / 2)
  }

  return canvas
}

/** The visible-sum rule, the same one the fee table follows: the total printed on
 *  the card is the sum of the days printed on it. Exported so the guard can call
 *  the same arithmetic the card claims rather than a second copy of it. */
export function sumOfDays(days: readonly CalendarCardDay[]): number {
  return days.reduce((a, d) => a + d.pnl, 0)
}

/** Longest run of consecutive GREEN trading days, over the traded days in order.
 *  A fold over the same per-day map computeStreak walks — no new data. A day the
 *  trader merely journalled is not a trading day and is not in this walk. */
export function longestGreenRun(days: readonly CalendarCardDay[]): number {
  const ordered = [...days].filter(isTraded).sort((a, b) => (a.date < b.date ? -1 : 1))
  let run = 0
  let best = 0
  for (const d of ordered) {
    if (d.pnl > 0) {
      run += 1
      best = Math.max(best, run)
    } else run = 0
  }
  return best
}
