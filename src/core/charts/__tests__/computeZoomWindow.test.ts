import { describe, it, expect } from 'vitest'
import type { IntradayBar } from '@shared/market-types'
// RED: module not implemented yet — this is the only unresolved import.
import { computeZoomWindow } from '../computeZoomWindow'
// computeZoomLogicalRange isn't implemented yet — namespace import so the
// missing export is `undefined` (calls throw at runtime) instead of failing the
// whole file load, which would also break the 14 computeZoomWindow tests.
import * as zoomMod from '../computeZoomWindow'

// ── Fixtures ───────────────────────────────────────────────────────────────
// 2026-05-14 13:30:00Z session anchor; epoch-ms helpers. Bars only need `t`
// for the window math; o/h/l/c/v are dummy constants. Fills carry an ISO-8601
// UTC string with a Z suffix (Day 8.5 Commit B), parsed via the same
// includes('Z') guard as buildTradeMarkers.fillEpochMs.
const BASE = Date.UTC(2026, 4, 14, 13, 30, 0)
const minute = (m: number): number => BASE + m * 60_000
const iso = (ms: number): string => new Date(ms).toISOString()

function bar(tMs: number): IntradayBar {
  return { t: tMs, o: 10, h: 10, l: 10, c: 10, v: 100 }
}

function fill(tMs: number): { time: string } {
  return { time: iso(tMs) }
}

// Bars one per minute across [fromMin, toMin] inclusive.
function barsRange(fromMin: number, toMin: number): IntradayBar[] {
  const out: IntradayBar[] = []
  for (let m = fromMin; m <= toMin; m++) out.push(bar(minute(m)))
  return out
}

// (a) multi-fill well inside bars range → proportional pad both sides ──────────
describe('computeZoomWindow — multi-fill inside the bars range', () => {
  it('pads both sides by duration * padFraction when that exceeds the floor', () => {
    const bars = barsRange(0, 60)
    const fills = [fill(minute(20)), fill(minute(30))] // duration = 10 min
    // duration 600_000 * 0.5 = 300_000 (5 min) > minPadMs 60_000 → pad = 300_000
    const win = computeZoomWindow(fills, bars, { padFraction: 0.5, minPadMs: 60_000 })

    expect(win).not.toBeNull()
    expect(win!.fromMs).toBe(minute(15)) // minFill(20m) − 5m
    expect(win!.toMs).toBe(minute(35))   // maxFill(30m) + 5m
  })
})

// (b) single fill (duration 0) → floor pad, symmetric ─────────────────────────
describe('computeZoomWindow — single-fill trade', () => {
  it('falls back to minPadMs symmetric padding when duration is zero', () => {
    const bars = barsRange(0, 60)
    const fills = [fill(minute(30))] // duration = 0
    const win = computeZoomWindow(fills, bars, { padFraction: 0.5, minPadMs: 120_000 })

    expect(win).not.toBeNull()
    expect(win!.fromMs).toBe(minute(28)) // fill − 2 min
    expect(win!.toMs).toBe(minute(32))   // fill + 2 min
  })
})

// (c) long trade → proportional pad, not the floor ────────────────────────────
describe('computeZoomWindow — long-duration trade', () => {
  it('uses duration * padFraction when it exceeds minPadMs', () => {
    const bars = barsRange(0, 300)
    const fills = [fill(minute(90)), fill(minute(210))] // duration = 120 min
    // 7_200_000 * 0.5 = 3_600_000 (60 min) > minPadMs 60_000 → pad = 60 min
    const win = computeZoomWindow(fills, bars, { padFraction: 0.5, minPadMs: 60_000 })

    expect(win).not.toBeNull()
    expect(win!.fromMs).toBe(minute(30))  // 90m − 60m
    expect(win!.toMs).toBe(minute(270))   // 210m + 60m
  })
})

// (d) clamp to the available data range ───────────────────────────────────────
describe('computeZoomWindow — clamps to the bars range', () => {
  it('clamps `from` to the first bar when the padded window starts before data', () => {
    const bars = barsRange(10, 50)
    const fills = [fill(minute(12)), fill(minute(15))] // near the start
    // pad floor 600_000 (10 min) overruns the front: 12m − 10m = 2m < firstBar 10m
    const win = computeZoomWindow(fills, bars, { padFraction: 0.5, minPadMs: 600_000 })

    expect(win).not.toBeNull()
    expect(win!.fromMs).toBe(minute(10)) // clamped to firstBarT
    expect(win!.toMs).toBe(minute(25))   // 15m + 10m, still inside
  })

  it('clamps `to` to the last bar when the padded window ends past data', () => {
    const bars = barsRange(10, 50)
    const fills = [fill(minute(45)), fill(minute(48))] // near the end
    // pad floor 600_000 (10 min) overruns the back: 48m + 10m = 58m > lastBar 50m
    const win = computeZoomWindow(fills, bars, { padFraction: 0.5, minPadMs: 600_000 })

    expect(win).not.toBeNull()
    expect(win!.fromMs).toBe(minute(35)) // 45m − 10m, still inside
    expect(win!.toMs).toBe(minute(50))   // clamped to lastBarT
  })
})

// (e) no usable fills → null ──────────────────────────────────────────────────
describe('computeZoomWindow — no usable fills', () => {
  it('returns null for an empty fills array', () => {
    expect(computeZoomWindow([], barsRange(0, 60))).toBeNull()
  })

  it('returns null when every fill timestamp is unparseable', () => {
    const fills = [{ time: 'not-a-date' }, { time: '' }]
    expect(computeZoomWindow(fills, barsRange(0, 60))).toBeNull()
  })
})

// (f) empty bars → null ───────────────────────────────────────────────────────
describe('computeZoomWindow — empty bars', () => {
  it('returns null when there are no bars to clamp against', () => {
    expect(computeZoomWindow([fill(minute(20))], [])).toBeNull()
  })
})

// ── NEW (#3b): bar-interval-aware minimum window ──────────────────────────────
// The minimum window must guarantee a minimum NUMBER of candles, so a short
// trade on a coarse timeframe (5M) isn't framed into a sub-2-candle sliver
// (the confirmed GXAI bug). New floor term:
//   pad = max(duration * padFraction, minPadMs, minBars * barIntervalMs)
// These target the post-#3b signature; against the current module (which
// ignores barIntervalMs/minBars) the windows come back too narrow, so the
// new-behavior cases (a/b/d/f) fail. (c) and (e) are invariant guards that
// must hold both before and after GREEN.
describe('computeZoomWindow — bar-interval-aware minimum (minBars * barIntervalMs)', () => {
  // 5-min-aggregated-style bars: t on the 300000 grid (BASE is grid-aligned).
  function bars5(fromMin: number, toMin: number): IntradayBar[] {
    const out: IntradayBar[] = []
    for (let m = fromMin; m <= toMin; m += 5) out.push(bar(minute(m)))
    return out
  }

  // GXAI-like short trade: ~2.93 min between first and last fill.
  const SHORT_MS = 176_000

  // (a) 5M short trade — the real GXAI/trade-61 case: the pad is the FLAT 6-min
  // minPadMs floor, NOT scaled by the 5-min interval (was 6*300_000 = 30 min).
  // The window is framed by time; candle count just falls out of the interval.
  it('5M: a short trade gets the flat minPadMs pad, not an interval-scaled one', () => {
    const bars = bars5(-15, 60)
    const minF = minute(20)
    const maxF = minF + SHORT_MS // dur*0.55 = 96_800 < 360_000 floor
    const fills = [fill(minF), fill(maxF)]

    const win = computeZoomWindow(fills, bars, {
      padFraction: 0.55, minPadMs: 360_000, barIntervalMs: 300_000,
    })!

    // exactly minPadMs (6 min) per side — the old 30-min interval floor is gone
    expect(minF - win.fromMs).toBe(360_000)
    expect(win.toMs - maxF).toBe(360_000)
    // still frames both fills, inside the data, inverted-clamp fallback did NOT fire
    expect(win.fromMs).toBeLessThanOrEqual(minF)
    expect(win.toMs).toBeGreaterThanOrEqual(maxF)
    expect(win.fromMs).toBeGreaterThan(bars[0].t)
    expect(win.toMs).toBeLessThan(bars[bars.length - 1].t)
  })

  // (b) 1M gets the SAME flat 6-min pad as 5M — interval-independence made
  // concrete: same fills + bars, the 1M and 5M windows are identical.
  it('1M: the same short trade gets the identical window to 5M', () => {
    const bars = barsRange(0, 120)
    const minF = minute(20)
    const maxF = minF + SHORT_MS
    const fills = [fill(minF), fill(maxF)]

    const win1m = computeZoomWindow(fills, bars, {
      padFraction: 0.55, minPadMs: 360_000, barIntervalMs: 60_000,
    })!
    const win5m = computeZoomWindow(fills, bars, {
      padFraction: 0.55, minPadMs: 360_000, barIntervalMs: 300_000,
    })

    // flat 6-min pad per side (minPadMs), independent of the interval …
    expect(minF - win1m.fromMs).toBe(360_000)
    expect(win1m.toMs - maxF).toBe(360_000)
    // … so 1M and 5M frame the identical slice
    expect(win5m).toEqual(win1m)
    // sane small window — inside the data, NOT the whole day
    expect(win1m.fromMs).toBeGreaterThan(bars[0].t)
    expect(win1m.toMs).toBeLessThan(bars[bars.length - 1].t)
  })

  // (c) backward-compat guard: no barIntervalMs → EXACTLY the old minPadMs floor.
  // Must pass before AND after GREEN — proves the additive change is inert when
  // the new opts are absent, keeping the original 8 tests valid.
  it('omitting barIntervalMs reproduces the old minPadMs floor exactly', () => {
    const bars = barsRange(0, 120)
    const minF = minute(20)
    const maxF = minF + SHORT_MS
    const fills = [fill(minF), fill(maxF)]

    const win = computeZoomWindow(fills, bars, { padFraction: 0.55, minPadMs: 150_000 })!

    expect(win.fromMs).toBe(minF - 150_000)
    expect(win.toMs).toBe(maxF + 150_000)
  })

  // (d) the 6-min floor now lives in minPadMs's DEFAULT (was the 6-bar term).
  // Omit minPadMs entirely → a short trade is padded by the 360_000 default,
  // still independent of barIntervalMs.
  it('minPadMs defaults to 6 min (360_000) when omitted', () => {
    const bars = bars5(-15, 60)
    const minF = minute(20)
    const maxF = minF + SHORT_MS // dur*0.55 = 96_800 < default floor
    const fills = [fill(minF), fill(maxF)]

    const win = computeZoomWindow(fills, bars, {
      padFraction: 0.55, barIntervalMs: 300_000, // minPadMs omitted → default
    })!

    expect(minF - win.fromMs).toBe(360_000) // the default floor, exactly
    expect(win.toMs - maxF).toBe(360_000)
  })

  // (e) invariant guard: proportional pad still wins when it exceeds the floor.
  // The new term is a MAX — it must not shrink an already-wide window. Passes
  // before and after GREEN.
  it('proportional pad still wins for a long trade (floor does not shrink it)', () => {
    const bars = bars5(-120, 360)
    const minF = minute(60)
    const maxF = minute(180) // duration = 120 min
    const fills = [fill(minF), fill(maxF)]
    const dur = maxF - minF

    const win = computeZoomWindow(fills, bars, {
      padFraction: 0.55, minPadMs: 150_000, barIntervalMs: 300_000, minBars: 6,
    })!

    // dur*0.55 (66 min) > minBars*barIntervalMs (30 min) and > minPadMs → proportional wins.
    // toBeCloseTo: dur*0.55 is a non-integer float; the pad lands within sub-ms.
    expect(minF - win.fromMs).toBeGreaterThan(6 * 300_000)
    expect(minF - win.fromMs).toBeCloseTo(dur * 0.55, 0)
    expect(win.toMs - maxF).toBeCloseTo(dur * 0.55, 0)
  })

  // (f) clamp interaction: with the flat 6-min pad the clamp must STILL fire, so
  // the last fill sits within 6 min of lastBarT — maxF + 6min overruns the data
  // end → toMs clamps to lastBarT. (Fill moved toward the end; otherwise a
  // re-pointed assertion would pass vacuously and lose end-clamp coverage.)
  it('clamps toMs to lastBarT when the last fill is near the data end', () => {
    const bars = bars5(-60, 30) // data ends at minute(30)
    const minF = minute(26)     // last fill within 6 min of lastBarT …
    const maxF = minF + SHORT_MS // … maxF ≈ minute(28.93), + 6min overruns minute(30)
    const fills = [fill(minF), fill(maxF)]
    const lastBarT = bars[bars.length - 1].t

    const win = computeZoomWindow(fills, bars, {
      padFraction: 0.55, minPadMs: 360_000, barIntervalMs: 300_000,
    })!

    // maxF + 6min (≈ minute34.93) overruns lastBarT (minute30) → clamp fires
    expect(win.toMs).toBe(lastBarT)
    expect(win.fromMs).toBeLessThan(win.toMs)
    expect(win.fromMs).toBeLessThanOrEqual(minF)
  })
})

// ── NEW (trade-61 regression): zoom window is bar-interval-INDEPENDENT ─────────
// Confirmed live on trade 61: toggling the timeframe (1M↔5M) re-frames the chart
// to a DIFFERENT slice of time. It must not — candle granularity is orthogonal
// to which time window the trade occupies. This encodes the property the current
// `minBars * barIntervalMs` pad floor violates (the pad scales with the
// interval), so it FAILS today on 5M: the RED that drives the fix.
//
// Real trade-61 fills from the live [ZOOM-DIAG] log (UTC+Z): entry 08:22:21 ET,
// exit 08:25:17 ET (≈2.93 min). 1-min bars span 11:30:00Z→13:30:00Z (121 bars,
// inclusive) so NEITHER the 1M (6-min pad) nor the 5M (30-min pad) window clamps
// to a bar edge — isolating the pad math from the data-range clamp.
describe('computeZoomWindow — depends on fills, not bar interval (trade 61)', () => {
  const fills = [{ time: '2026-06-02T12:22:21Z' }, { time: '2026-06-02T12:25:17Z' }]

  // 121 synthetic 1-min bars, 11:30:00Z..13:30:00Z inclusive. Only .t matters.
  const dayStart = Date.parse('2026-06-02T11:30:00Z')
  const bars61: IntradayBar[] = []
  for (let m = 0; m <= 120; m++) bars61.push(bar(dayStart + m * 60_000))

  it('frames the same time slice on 5M as on 1M', () => {
    // Control (assertion 2) — checked FIRST so it provably executes in this RED
    // run: the 1M window pins to entry−6min / exit+6min (pad = 6 candles ×
    // 60_000 = 6 min). Correct today; must survive the fix.
    expect(computeZoomWindow(fills, bars61, { barIntervalMs: 60_000 })).toEqual({
      fromMs: Date.parse('2026-06-02T12:16:21Z'),
      toMs: Date.parse('2026-06-02T12:31:17Z'),
    })

    // Bug property (assertion 1) — FAILS today: the 5M pad floor (6 candles ×
    // 300_000 = 30 min) widens the window, so 5M frames a wider slice than 1M.
    // Same fills, same bars, only the interval differs ⇒ windows must be equal.
    expect(computeZoomWindow(fills, bars61, { barIntervalMs: 300_000 })).toEqual(
      computeZoomWindow(fills, bars61, { barIntervalMs: 60_000 }),
    )
  })
})

// ── NEW (#3b logical-range): ms window → fractional bar-index range ────────────
// Drives the chart via setVisibleLogicalRange (bar indices) instead of
// setVisibleRange (timestamps), which corrupts scrollPosition when the target
// window is a small slice far from the bars' right edge (the measured 5M bug).
// computeZoomLogicalRange isn't implemented yet → these fail at call time
// ("not a function"); the 14 computeZoomWindow tests above are untouched.
describe('computeZoomLogicalRange — ms window → fractional bar indices', () => {
  // 5-min grid bars (BASE is 300000-aligned): bar index i = minute(fromMin + 5*i).
  function grid5(fromMin: number, toMin: number): IntradayBar[] {
    const out: IntradayBar[] = []
    for (let m = fromMin; m <= toMin; m += 5) out.push(bar(minute(m)))
    return out
  }

  const SHORT_MS = 176_000 // ~2.93 min, GXAI-shaped

  // (a) THE REAL 5M CASE (trade-61 shape): a short trade well inside a long day
  // maps to a tight fractional-bar window around the fill bar. With the flat
  // 6-min pad (interval-independent), grid5(0,300) (index i = minute(5*i)) frames
  // the trade at minute(150) = bar 30 to ≈ indices 29–31.
  it('5M: maps the trade window to fractional bar indices around the fill bar', () => {
    const bars = grid5(0, 300)                 // indices 0..60, last = minute(300)
    const minF = minute(150)                   // bar index 30
    const maxF = minF + SHORT_MS               // still in bar-30's 5-min bucket
    const fills = [fill(minF), fill(maxF)]

    const r = zoomMod.computeZoomLogicalRange(fills, bars, {
      padFraction: 0.55, minPadMs: 360_000, barIntervalMs: 300_000, padBars: 0.5,
    })

    expect(r).not.toBeNull()
    // pad = 360_000 (6 min) → win [minute(144), minute(158.93)] → fromIndex 29
    // (minute145), toIndex 31 (minute155)
    expect(r!.from).toBe(28.5)                 // fromIndex 29 − 0.5
    expect(r!.to).toBe(31.5)                   // toIndex 31 + 0.5
    expect(r!.from).toBeLessThan(r!.to)
    expect(r!.from).toBeLessThan(30)           // span covers the fill bar (index 30)
    expect(r!.to).toBeGreaterThan(30)
  })

  // (b) fractional pad applied exactly to the mapped indices. The ±0.5 padBars
  // offset is independent of pad SIZE → straight re-point to the 6-min pad (which
  // here lands on the same grid bars 5 & 7). The .5-offset assertions are kept.
  it('applies the fractional padBars exactly to the mapped indices', () => {
    const bars = grid5(0, 60)                  // indices 0..12
    const minF = minute(30)                    // bar index 6
    const fills = [fill(minF)]                 // duration 0

    const r = zoomMod.computeZoomLogicalRange(fills, bars, {
      padFraction: 0.55, minPadMs: 360_000, barIntervalMs: 300_000, padBars: 0.5,
    })

    expect(r).not.toBeNull()
    // pad = minPadMs = 6min → win [minute(24), minute(36)] → fromIndex 5, toIndex 7
    expect(r!.from).toBe(4.5)                  // 5 − 0.5  (padBars offset present)
    expect(r!.to).toBe(7.5)                    // 7 + 0.5  (padBars offset present)
  })

  // (c) window clips the start: with the flat 6-min pad the clip must STILL fire,
  // so the first fill sits within 6 min of firstBarT — minF − 6min underflows the
  // data start → fromMs clamps to firstBarT → fromIndex 0 → from = -padBars.
  // (Fill moved toward the start; otherwise the clip never fires and the name lies.)
  it('clips `from` to index 0 (negative fractional allowed) when the window starts before data', () => {
    const bars = grid5(10, 70)                 // indices 0..12, first = minute(10)
    const minF = minute(13)                    // within 6 min of firstBarT …
    const maxF = minF + SHORT_MS               // … minF − 6min = minute(7) < firstBar minute(10)
    const fills = [fill(minF), fill(maxF)]

    const r = zoomMod.computeZoomLogicalRange(fills, bars, {
      padFraction: 0.55, minPadMs: 360_000, barIntervalMs: 300_000, padBars: 0.5,
    })

    expect(r).not.toBeNull()
    expect(r!.from).toBe(-0.5)                 // fromMs clamped to firstBarT → index 0 − 0.5
  })

  // (d) window clips the end: computeZoomWindow clamps toMs to lastBarT →
  // toIndex = length-1 → to = (length-1) + padBars.
  it('clips `to` to the last index when the window ends past data', () => {
    const bars = grid5(10, 70)                 // indices 0..12, last index 12
    const minF = minute(65)                    // near the end
    const maxF = minF + SHORT_MS
    const fills = [fill(minF), fill(maxF)]

    const r = zoomMod.computeZoomLogicalRange(fills, bars, {
      padFraction: 0.55, minPadMs: 150_000, barIntervalMs: 300_000, minBars: 6, padBars: 0.5,
    })

    expect(r).not.toBeNull()
    expect(r!.to).toBe(12.5)                   // (length-1 = 12) + 0.5
  })

  // (e) degenerate — window falls entirely in a gap between sparse bars: must NOT
  // invert; both indices collapse to the nearest bar to the window midpoint.
  it('does not invert when the window falls between sparse bars', () => {
    const bars = [bar(minute(0)), bar(minute(60)), bar(minute(120))] // 1h gaps
    const minF = minute(85)
    const maxF = minF + 60_000                 // 1-min trade
    const fills = [fill(minF), fill(maxF)]

    // tiny pad (barIntervalMs 0 → floor inert) keeps the win inside the (60,120) gap
    const r = zoomMod.computeZoomLogicalRange(fills, bars, {
      padFraction: 0.55, minPadMs: 60_000, barIntervalMs: 0, padBars: 0.5,
    })

    expect(r).not.toBeNull()
    expect(r!.from).toBeLessThan(r!.to)        // never inverted
    // win [minute(84), minute(87)] midpoint minute(85.5) → nearest bar = index 1 (minute60)
    expect(r!.from).toBe(0.5)                  // 1 − 0.5
    expect(r!.to).toBe(1.5)                    // 1 + 0.5
  })

  // (f) null passthrough — mirrors computeZoomWindow's null contract.
  it('returns null for empty fills', () => {
    expect(zoomMod.computeZoomLogicalRange([], grid5(0, 60), { padBars: 0.5 })).toBeNull()
  })
  it('returns null for empty bars', () => {
    expect(zoomMod.computeZoomLogicalRange([fill(minute(20))], [], { padBars: 0.5 })).toBeNull()
  })

  // (g) proportional pad flows through to indices for a long trade (far wider
  // than the bar-interval floor would give).
  it('reflects the proportional pad (not the bar floor) for a long trade', () => {
    const bars = grid5(0, 600)                 // indices 0..120
    const minF = minute(200)                   // bar index 40
    const maxF = minute(440)                   // bar index 88, duration 240 min
    const fills = [fill(minF), fill(maxF)]

    const r = zoomMod.computeZoomLogicalRange(fills, bars, {
      padFraction: 0.55, minPadMs: 150_000, barIntervalMs: 300_000, minBars: 6, padBars: 0.5,
    })

    expect(r).not.toBeNull()
    // dur*0.55 = 132min pad → win [minute(68), minute(572)] → fromIndex 14, toIndex 114
    expect(r!.from).toBe(13.5)
    expect(r!.to).toBe(114.5)
    expect(r!.to - r!.from).toBeGreaterThan(80) // floor would give ~61 → proportional won
  })
})
