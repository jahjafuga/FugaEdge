// Branded P&L calendar card — a month grid drawn on a canvas, wearing the same
// brand furniture as the chart card.
//
// WHY CANVAS AND NOT THE DOM. The month grid on screen is React. There is no
// DOM-to-image dependency in this app and this commit does not add one: the chart
// card is Canvas 2D and its save path is Canvas 2D, so a second rasterisation
// stack would be a whole new failure surface for one feature. The grid is drawn.
//
// SHARED WITH THE CHART CARD, deliberately and by import rather than by copy:
// the icon asset, chartColors(theme) for every colour, the `unit = W / 1000`
// scaling rule so a card is the same shape at any width, MASKED_AMOUNT, and the
// streamer read. A second brand vocabulary is the thing most likely to go wrong
// here, so there isn't one.
//
// DATA. Days arrive already summed from the calendar's OWN source —
// electron/calendar/get.ts, SUM(net_pnl_precise) ... GROUP BY date. Not
// daily_summary (nothing reads it for this) and not the 2dp net_pnl column that
// Analytics sums. A share card must not disagree with the app that produced it.

import iconUrl from '@/assets/fugaedge-icon-light.png'
import { chartColors } from '@/lib/chartColors'
import { MASKED_AMOUNT } from '@/lib/chartScreenshot'
import { readStreamerMode } from '@/lib/streamerMode'
import { signed } from '@/lib/format'
import type { ResolvedTheme } from '@/lib/theme'

const FONT = 'JetBrains Mono, ui-monospace, monospace'

/** Every unit the card can draw, in offer order. The list is exported so the
 *  reachability guard can hold the UI to it: a mode the compositor implements
 *  and the share control never offers is a dead engine, and this feature has
 *  already produced one of those. */
export const CALENDAR_CARD_UNITS = ['percent', 'dollars'] as const

/** How a day's number is written. Percentage is the default because it says how
 *  the month went without saying how much money exists. */
export type CalendarCardUnit = (typeof CALENDAR_CARD_UNITS)[number]

export interface CalendarCardDay {
  /** YYYY-MM-DD. */
  date: string
  /** Net P&L for the day, summed from net_pnl_precise. */
  pnl: number
  /** The day as a percentage of account equity, or null when no balance is set.
   *  Computed by the caller; the card never derives it. */
  pct: number | null
  tradeCount: number
}

export interface CalendarCardData {
  /** e.g. "July 2026" — pre-formatted, one formatting path. */
  monthLabel: string
  year: number
  /** 1-12. */
  month: number
  /** Only days that were traded. Empty cells are derived from the calendar. */
  days: CalendarCardDay[]
  monthPnl: number
  monthPct: number | null
  /** Longest run of consecutive GREEN trading days in the month. */
  longestGreenRun: number
  /** The run in progress at the month's end, from computeStreak. */
  currentStreak: { kind: 'win' | 'loss' | 'none'; days: number }
  unit: CalendarCardUnit
}

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

/** Days in a month, and the Monday-based column its 1st falls in. Pure date maths
 *  on a UTC noon anchor so no timezone can shift a cell by a day. */
export function monthLayout(year: number, month: number): { days: number; firstCol: number } {
  const first = new Date(Date.UTC(year, month - 1, 1, 12))
  const next = new Date(Date.UTC(year, month, 1, 12))
  const days = Math.round((next.getTime() - first.getTime()) / 86_400_000)
  // getUTCDay: 0=Sun..6=Sat. Monday-first columns: Mon=0 ... Sun=6.
  const firstCol = (first.getUTCDay() + 6) % 7
  return { days, firstCol }
}

/** The text in a day cell, honouring the unit and the mask.
 *
 *  Streamer mode forces percentage regardless of what was chosen — the choice is
 *  a preference, the mask is a rule. When a percentage cannot be computed the
 *  cell shows the withheld mark rather than falling back to dollars: a privacy
 *  setting that degrades to the thing it hides is not a privacy setting. */
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

let iconPromise: Promise<HTMLImageElement> | null = null
function loadIcon(): Promise<HTMLImageElement> {
  if (!iconPromise) {
    iconPromise = (async () => {
      const img = new Image()
      img.src = iconUrl
      await img.decode()
      return img
    })()
  }
  return iconPromise
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

/**
 * Compose the card. Width is fixed at 1600 to match the chart card's capture
 * width, and every dimension derives from `unit = W / 1000` exactly as the chart
 * card's does, so the two are the same object at different aspect ratios.
 *
 * A LOSING MONTH IS A FINISHED CARD. Every element a winning month draws, a
 * losing one draws — header, grid, totals, streak. The only difference is the
 * colour of the numbers and which streak line is true. A red month that renders
 * as a degraded green one is the fastest way to make the feature unusable for
 * the months a trader most needs to look at.
 */
export async function composeCalendarCard(
  data: CalendarCardData,
  theme: ResolvedTheme,
): Promise<HTMLCanvasElement> {
  const W = 1600
  const unitPx = W / 1000
  const px = (n: number): number => Math.round(n * unitPx)

  const palette = chartColors(theme)
  const BG = palette.background
  const GOLD = palette.sideA
  const WHITE = palette.fgPrimary
  const WIN = palette.win
  const LOSS = palette.loss
  const MUTED = palette.axis
  const DIVIDER = palette.grid

  const streamer = readStreamerMode()

  const headerH = px(64)
  const weekdayH = px(28)
  const cellH = px(88)
  const gap = px(6)
  const pad = px(20)
  const gridW = W - pad * 2
  const cellW = (gridW - gap * 6) / 7

  const { days: daysInMonth, firstCol } = monthLayout(data.year, data.month)
  const rows = Math.ceil((firstCol + daysInMonth) / 7)
  const gridH = rows * cellH + (rows - 1) * gap
  const footerH = px(96)
  const H = headerH + weekdayH + gridH + footerH + pad * 2

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable for calendar card composite')
  if (document.fonts?.ready) await document.fonts.ready

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  // ── Header: icon, wordmark, month. NO ACCOUNT NAME, ever — the card is made
  //    to be shared, and which account it came from is nobody else's business.
  const midY = Math.round(headerH / 2)
  const icon = await loadIcon()
  const iconSize = px(32)
  ctx.drawImage(icon, pad, midY - iconSize / 2, iconSize, iconSize)
  ctx.font = `700 ${px(20)}px ${FONT}`
  ctx.fillStyle = GOLD
  ctx.fillText('FUGAEDGE', pad + iconSize + px(12), midY)
  ctx.font = `600 ${px(20)}px ${FONT}`
  ctx.fillStyle = WHITE
  ctx.textAlign = 'right'
  ctx.fillText(data.monthLabel, W - pad, midY)
  ctx.textAlign = 'left'

  // ── Weekday strip
  const weekdayY = headerH + Math.round(weekdayH / 2)
  ctx.font = `600 ${px(11)}px ${FONT}`
  ctx.fillStyle = MUTED
  WEEKDAYS.forEach((wd, i) => {
    ctx.fillText(wd, Math.round(pad + i * (cellW + gap)), weekdayY)
  })

  // ── Grid. EVERY cell in the month is drawn, traded or not: a month with four
  //    trading days in it is a real month, and skipping its empty days would
  //    make the card look broken rather than quiet.
  const byDate = new Map(data.days.map((d) => [d.date, d]))
  const gridTop = headerH + weekdayH
  for (let i = 0; i < daysInMonth; i++) {
    const col = (firstCol + i) % 7
    const row = Math.floor((firstCol + i) / 7)
    const x = Math.round(pad + col * (cellW + gap))
    const y = gridTop + row * (cellH + gap)
    const dom = i + 1
    const iso = `${data.year}-${String(data.month).padStart(2, '0')}-${String(dom).padStart(2, '0')}`
    const day = byDate.get(iso)

    const tone = day == null ? null : day.pnl > 0 ? WIN : day.pnl < 0 ? LOSS : MUTED
    ctx.fillStyle = day == null ? BG : `${tone}1a`
    roundRect(ctx, x, y, cellW, cellH, px(8))
    ctx.fill()
    ctx.strokeStyle = DIVIDER
    ctx.lineWidth = Math.max(1, px(1))
    roundRect(ctx, x, y, cellW, cellH, px(8))
    ctx.stroke()

    ctx.font = `600 ${px(11)}px ${FONT}`
    ctx.fillStyle = MUTED
    ctx.fillText(String(dom), x + px(10), y + px(16))

    if (day != null) {
      ctx.font = `700 ${px(17)}px ${FONT}`
      ctx.fillStyle = tone as string
      ctx.fillText(dayCellText(day, data.unit, streamer), x + px(10), y + px(44))
      ctx.font = `600 ${px(10)}px ${FONT}`
      ctx.fillStyle = MUTED
      ctx.fillText(
        `${day.tradeCount} ${day.tradeCount === 1 ? 'trade' : 'trades'}`,
        x + px(10),
        y + px(68),
      )
    }
  }

  // ── Footer: the month's own totals and its streak. Both are honest on a losing
  //    month — a red total is a total, and a losing streak is a streak.
  const footerY = gridTop + gridH + pad
  ctx.strokeStyle = DIVIDER
  ctx.lineWidth = Math.max(1, px(1))
  ctx.beginPath()
  ctx.moveTo(0, footerY + 0.5)
  ctx.lineTo(W, footerY + 0.5)
  ctx.stroke()

  const traded = data.days.length
  const green = data.days.filter((d) => d.pnl > 0).length
  const streakText =
    data.currentStreak.kind === 'none'
      ? '—'
      : `${data.currentStreak.days} ${data.currentStreak.kind === 'win' ? 'green' : 'red'}`
  const cells: { label: string; value: string; color: string }[] = [
    {
      label: 'Month',
      value: dayCellText({ pnl: data.monthPnl, pct: data.monthPct }, data.unit, streamer),
      color: data.monthPnl >= 0 ? WIN : LOSS,
    },
    { label: 'Trading days', value: String(traded), color: WHITE },
    { label: 'Green days', value: `${green} of ${traded}`, color: WHITE },
    { label: 'Best green run', value: `${data.longestGreenRun}`, color: WHITE },
    { label: 'Ending streak', value: streakText, color: WHITE },
  ]
  const fCellW = W / cells.length
  const labelY = footerY + Math.round(footerH * 0.36)
  const valueY = footerY + Math.round(footerH * 0.64)
  cells.forEach((cell, i) => {
    const cx = Math.round(i * fCellW) + pad
    if (i > 0) {
      const dx = Math.round(i * fCellW) + 0.5
      ctx.strokeStyle = DIVIDER
      ctx.beginPath()
      ctx.moveTo(dx, footerY + px(18))
      ctx.lineTo(dx, footerY + footerH - px(18))
      ctx.stroke()
    }
    ctx.font = `600 ${px(10)}px ${FONT}`
    ctx.fillStyle = MUTED
    ctx.fillText(cell.label.toUpperCase(), cx, labelY)
    ctx.font = `600 ${px(16)}px ${FONT}`
    ctx.fillStyle = cell.color
    ctx.fillText(cell.value, cx, valueY)
  })

  return canvas
}

/** The visible-sum rule, the same one the fee table follows: the total printed on
 *  the card is the sum of the days printed on it. Exported so the guard can call
 *  the same arithmetic the card claims rather than a second copy of it. */
export function sumOfDays(days: readonly CalendarCardDay[]): number {
  return days.reduce((a, d) => a + d.pnl, 0)
}

/** Longest run of consecutive GREEN trading days, over the traded days in order.
 *  A fold over the same per-day map computeStreak walks — no new data. */
export function longestGreenRun(days: readonly CalendarCardDay[]): number {
  const ordered = [...days].sort((a, b) => (a.date < b.date ? -1 : 1))
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
