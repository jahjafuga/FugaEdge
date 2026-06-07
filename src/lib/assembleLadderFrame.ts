import type { TradeMarker } from '@/core/charts/buildTradeMarkers'
import type { IntradayBarLike } from './buildOccupancy'
import { layoutFillLadder, type FillPoint } from './fillLadderLayout'
import { buildOccupancy } from './buildOccupancy'
import { fillLabel } from '@/lib/format'

export interface LadderDot { x: number; y: number; r: number; side: 'B' | 'S' }
export interface LadderLeader { x1: number; y1: number; x2: number; y2: number }
export interface LadderPill { cx: number; cy: number; w: number; h: number; label: string; side: 'B' | 'S' }

export interface AssembleLadderOpts {
  paneWidth: number
  paneHeight: number
  pillWidth: number
  pillHeight: number
  minGap: number
  leaderMin: number
  leaderMax: number
  bandThickness: number
}

const DOT_BASE_R = 2.5  // + marker size; matches the canvas primitive's dot ring

// Pure per-frame assembly: markers (+ avg-entry/avg-exit prices, + bars for
// candle occupancy) -> renderable ladder geometry. Coordinate conversion is
// passed IN as toX/toY, so this imports nothing chart-specific and ports to the
// web target unchanged. Internally calls buildOccupancy + layoutFillLadder.
export function assembleLadderFrame(
  markers: readonly TradeMarker[],
  bars: IntradayBarLike[],
  avgEntry: number | null,
  avgExit: number | null,
  toX: (timeMs: number) => number | null,
  toY: (price: number) => number | null,
  opts: AssembleLadderOpts,
): { dots: LadderDot[]; leaders: LadderLeader[]; pills: LadderPill[] } {
  // 1. Convert markers to pixel-space FillPoints, dropping any off-screen
  //    (toX/toY null). Keep the surviving markers aligned index-for-index with
  //    the FillPoints, so layoutFillLadder's output (input order preserved) maps
  //    back to the right marker for color/label/dot-size.
  const visible: { m: TradeMarker; fp: FillPoint }[] = []
  for (const m of markers) {
    const x = toX(m.time)
    const y = toY(m.price)
    if (x === null || y === null) continue
    visible.push({
      m,
      fp: { x, y, qty: m.qty, price: m.price, kind: m.kind, side: m.side },
    })
  }
  if (visible.length === 0) return { dots: [], leaders: [], pills: [] }

  // 2. Build candle/avg occupancy (pure helper; same toX/toY).
  const { candleRects, avgBands } = buildOccupancy(bars, avgEntry, avgExit, toX, toY, {
    paneWidth: opts.paneWidth,
    paneHeight: opts.paneHeight,
    bandThickness: opts.bandThickness,
  })

  // 3. Place the pills (pure layout; flip/inward/flush already handled inside).
  const placed = layoutFillLadder(
    visible.map((v) => v.fp),
    {
      paneWidth: opts.paneWidth,
      paneHeight: opts.paneHeight,
      pillWidth: opts.pillWidth,
      pillHeight: opts.pillHeight,
      minGap: opts.minGap,
      leaderMin: opts.leaderMin,
      leaderMax: opts.leaderMax,
      candleRects,
      avgBands,
    },
  )

  // 4. Derive renderable geometry. Leader connects the dot to the pill edge
  //    NEAREST the dot: pill RIGHT of dot -> its LEFT edge; pill LEFT of dot ->
  //    its RIGHT edge (flip-aware — a pill can be on either side post-flip).
  const halfW = opts.pillWidth / 2
  const dots: LadderDot[] = []
  const leaders: LadderLeader[] = []
  const pills: LadderPill[] = []
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i]
    const m = visible[i].m
    const leaderEndX = Math.max(p.pillX - halfW, Math.min(p.pillX + halfW, p.x))
    dots.push({ x: p.x, y: p.y, r: DOT_BASE_R + m.size, side: p.side })
    leaders.push({ x1: p.x, y1: p.y, x2: leaderEndX, y2: p.pillY })
    pills.push({
      cx: p.pillX,
      cy: p.pillY,
      w: opts.pillWidth,
      h: opts.pillHeight,
      label: fillLabel(p.qty, p.price),
      side: p.side,
    })
  }

  return { dots, leaders, pills }
}
