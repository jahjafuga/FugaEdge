import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Camera,
  ChevronDown,
  ChevronRight,
  Crosshair,
  ExternalLink,
  Loader2,
  Lock,
  Maximize2,
  Minimize2,
  RefreshCw,
} from 'lucide-react'
import type { TradeListRow } from '@shared/trades-types'
import type { IntradayBar, IntradayBarsPayload } from '@shared/market-types'
import { ipc } from '@/lib/ipc'
import { int, price, signed, longDate, formatEastern } from '@/lib/format'
import { buildTradeMarkers } from '@/core/charts/buildTradeMarkers'
import { computeZoomLogicalRange } from '@/core/charts/computeZoomWindow'
import { computePriceRange } from '@/core/charts/computePriceRange'
import { FillLadderPrimitive } from './fillLadderPrimitive'
import { composeBrandedScreenshot, type BrandedScreenshotData } from '@/lib/chartScreenshot'

// MASTER tokens — kept as constants so the lightweight-charts API (which
// wants raw hex, not Tailwind classes) stays on the same palette as the
// rest of the modal.
const COLOR_INSET       = '#0a0c11'  // bg-inset (chart canvas)
const COLOR_GRID        = '#1e2330'  // border-subtle — reused as the flat axis border (gridlines now off)
const COLOR_BORDER      = '#2a3142'  // border
const COLOR_TEXT_DIM    = '#8a94a8'  // fg-tertiary
const COLOR_GOLD        = '#d4af37'  // brand gold
const COLOR_WIN         = '#3fb389'  // win (muted)
const COLOR_LOSS        = '#e06b6b'  // loss (muted)

// Indicator-series palette — the three overlay lines and their matching
// dropdown swatches read from these. Standard TradingView EMA palette:
// 9EMA white, EMA20 cyan; VWAP carries the brand gold. Distinct named
// consts (even where a value repeats a master token) so each series option
// and its IndicatorToggle swatch stay on one source of truth.
const COLOR_EMA9        = '#f3f5fa'  // 9EMA  — white (fg-primary white)
const COLOR_EMA20       = '#5cc8e8'  // EMA20 — cyan / light blue
const COLOR_VWAP        = '#d4af37'  // VWAP  — brand gold (= COLOR_GOLD)

type Timeframe = '10s' | '1m' | '5m' | 'daily'

interface ChartTabProps {
  trade: TradeListRow
  /** Fullscreen flag + toggle, owned by TradeDetailModal. Drilled to the
   *  toolbar's Fullscreen button and down to the host for the chart height. */
  isFullscreen: boolean
  onToggleFullscreen: () => void
}

export default function ChartTab({ trade, isFullscreen, onToggleFullscreen }: ChartTabProps) {
  const [payload, setPayload] = useState<IntradayBarsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tf, setTf] = useState<Timeframe>('1m')
  const [showEma9, setShowEma9] = useState(true)
  const [showEma20, setShowEma20] = useState(true)
  const [showVwap, setShowVwap] = useState(true)
  // Monotonic id per fetch call. Each load() captures its id; after the
  // IPC await, we drop the result if a newer fetch has started or this
  // ChartTab instance has unmounted (cancelled by cleanup setting to -1).
  // This is belt-and-suspenders for key={trade.id} remounts — with the
  // key in place, two fetches can't race within one instance. But if
  // some future change loses the key, we won't silently render stale data.
  const reqIdRef = useRef(0)

  const load = useCallback(
    async (force: boolean) => {
      const myReqId = ++reqIdRef.current
      // Capture inputs at call time so the log + assertion both reflect
      // what was sent, not a possibly-changed closure value.
      const reqSymbol = trade.symbol
      const reqDate = trade.date
      // eslint-disable-next-line no-console
      console.info(
        `[ChartTab] fetch start  trade.id=${trade.id} symbol=${reqSymbol} date=${reqDate} force=${force} reqId=${myReqId}`,
      )
      if (force) setRefreshing(true)
      else setLoading(true)
      try {
        const p = await ipc.intradayBarsGet(reqSymbol, reqDate, force)
        if (reqIdRef.current !== myReqId) {
          // eslint-disable-next-line no-console
          console.info(
            `[ChartTab] fetch superseded  reqId=${myReqId} current=${reqIdRef.current} — dropping`,
          )
          return
        }
        // eslint-disable-next-line no-console
        console.info(
          `[ChartTab] fetch done   reqId=${myReqId} symbol=${p.symbol} date=${p.date} bars=${p.bars.length}`
          + (p.bars.length > 0
              ? ` firstBar=${new Date(p.bars[0].t).toISOString()} lastBar=${new Date(p.bars[p.bars.length - 1].t).toISOString()}`
              : ''),
        )
        // Loud assertion — if main returned a payload for a different
        // (symbol, date) than we requested, something downstream is
        // corrupt. Refuse to plot it and surface the mismatch in the UI
        // instead of silently rendering the wrong data.
        if (p.symbol !== reqSymbol || p.date !== reqDate) {
          // eslint-disable-next-line no-console
          console.error(
            `[ChartTab] payload mismatch! requested ${reqSymbol}/${reqDate} got ${p.symbol}/${p.date}`,
          )
          setPayload({
            symbol: reqSymbol,
            date: reqDate,
            bars: [],
            fetchedAt: null,
            error: `Payload mismatch: requested ${reqSymbol}/${reqDate} but got ${p.symbol}/${p.date}. Check intraday_bars table and IPC handler.`,
            errorStatus: null,
            justFetched: false,
            apiKeyMissing: false,
          })
          return
        }
        setPayload(p)
      } catch (e) {
        if (reqIdRef.current !== myReqId) return
        setPayload({
          symbol: reqSymbol,
          date: reqDate,
          bars: [],
          fetchedAt: null,
          error: e instanceof Error ? e.message : String(e),
          errorStatus: null,
          justFetched: false,
          apiKeyMissing: false,
        })
      } finally {
        if (reqIdRef.current === myReqId) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [trade.id, trade.symbol, trade.date],
  )

  // Initial load on mount + on any change to the identifying trade fields.
  // With key={trade.id} on the parent ChartTab, this also runs on remount.
  // No cleanup needed: reqIdRef increments monotonically per call, and
  // load() compares its captured id against the current ref — any older
  // in-flight fetch drops itself when it sees a newer id has been issued.
  // True unmount is safe because React 18 silently no-ops setState on
  // dead components.
  useEffect(() => {
    setPayload(null)
    load(false)
  }, [trade.id, trade.symbol, trade.date, load])

  if (loading && !payload) {
    return <SkeletonState />
  }

  if (!payload) return null

  if (payload.bars.length === 0) {
    return (
      <EmptyState
        payload={payload}
        onRefresh={() => load(true)}
        refreshing={refreshing}
      />
    )
  }

  return (
    <ChartCanvas
      trade={trade}
      payload={payload}
      tf={tf}
      onChangeTf={setTf}
      showEma9={showEma9}
      showEma20={showEma20}
      showVwap={showVwap}
      onToggleEma9={() => setShowEma9((v) => !v)}
      onToggleEma20={() => setShowEma20((v) => !v)}
      onToggleVwap={() => setShowVwap((v) => !v)}
      onRefresh={() => load(true)}
      refreshing={refreshing}
      isFullscreen={isFullscreen}
      onToggleFullscreen={onToggleFullscreen}
    />
  )
}

// ── Loading / Error / Empty ───────────────────────────────────────────────

function SkeletonState() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-9" />
      <div className="skeleton h-[400px]" />
    </div>
  )
}

interface EmptyStateProps {
  payload: IntradayBarsPayload
  onRefresh: () => void
  refreshing: boolean
}

function EmptyState({ payload, onRefresh, refreshing }: EmptyStateProps) {
  const isError = !!payload.error
  const isApiKeyMissing = payload.apiKeyMissing
  // Polygon's plan-restriction response — clean upgrade prompt instead of the
  // raw 403 JSON body. Match both signals to avoid catching unrelated 403s
  // (e.g. an invalid API key, which surfaces differently).
  const isPlanRestricted =
    payload.errorStatus === 403 &&
    (payload.error?.includes('NOT_AUTHORIZED') ?? false)

  if (isPlanRestricted) {
    return <PlanRestrictedState />
  }

  let title: string
  let body: string
  if (isApiKeyMissing) {
    title = 'No Massive API key configured'
    body = 'Set your Massive API key in Settings → Data, then click Refresh to fetch intraday bars for this trade.'
  } else if (isError) {
    title = 'Chart unavailable'
    body = 'Couldn’t load intraday data for this ticker. The data source may be temporarily unavailable.'
  } else {
    title = 'Intraday data not available for this trade'
    body = 'Bars haven\'t been fetched yet. Use Refresh to pull them from Massive — first fetch takes a few seconds.'
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-subtle bg-bg-2 py-12 text-center">
      <AlertCircle
        size={32}
        strokeWidth={1.5}
        className={isError ? 'mb-3 text-loss' : 'mb-3 text-gold/60'}
      />
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        {isError ? 'Error' : 'No data'}
      </div>
      <div className="mt-2 text-base font-semibold text-fg-primary">{title}</div>
      <div className="mx-auto mt-1 max-w-sm text-sm text-fg-tertiary">{body}</div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="mt-5 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-gold px-3 text-xs font-semibold text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-gold-hover active:bg-gold-dim disabled:cursor-not-allowed disabled:opacity-40"
      >
        {refreshing ? (
          <Loader2 size={14} strokeWidth={2.25} className="animate-spin" />
        ) : (
          <RefreshCw size={14} strokeWidth={2.25} />
        )}
        {refreshing ? 'Fetching…' : 'Refresh intraday data'}
      </button>
    </div>
  )
}

function PlanRestrictedState() {
  const [showWhy, setShowWhy] = useState(false)
  const handleUpgrade = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    // Prefer the main-process openExternal IPC (Bug 3's stash recovery) so the
    // link opens in the user's default browser, not a child BrowserWindow.
    // Fall back to the default anchor behaviour when the IPC isn't bound (e.g.
    // dev builds before the preload exposes it).
    const api = (window as unknown as { api?: { openExternal?: (url: string) => Promise<void> | void } }).api
    if (api?.openExternal) {
      e.preventDefault()
      void api.openExternal('https://massive.com/pricing')
    }
  }, [])
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-subtle bg-bg-2 px-6 py-12 text-center">
      <Lock size={32} strokeWidth={1.5} className="mb-3 text-gold/60" />
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        Plan restricted
      </div>
      <div className="mt-2 text-base font-semibold text-fg-primary">
        Intraday chart unavailable
      </div>
      <div className="mx-auto mt-1 max-w-sm text-sm text-fg-tertiary">
        Your Massive plan doesn&apos;t include this timeframe&apos;s intraday data.
        Real-time and recent intraday bars are available on paid plans starting at $29/mo.
      </div>
      <a
        href="https://massive.com/pricing"
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleUpgrade}
        className="mt-5 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-gold px-3 text-xs font-semibold text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-gold-hover active:bg-gold-dim"
      >
        Upgrade Massive Plan
        <ExternalLink size={12} strokeWidth={2.25} />
      </a>
      <button
        type="button"
        onClick={() => setShowWhy((v) => !v)}
        aria-expanded={showWhy}
        className="mt-4 inline-flex cursor-pointer items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:text-fg-secondary"
      >
        {showWhy
          ? <ChevronDown size={11} strokeWidth={2.25} />
          : <ChevronRight size={11} strokeWidth={2.25} />}
        Why am I seeing this?
      </button>
      {showWhy && (
        <div className="mx-auto mt-3 max-w-md rounded-md border border-border-subtle bg-bg-3 p-3 text-left text-xs leading-relaxed text-fg-tertiary">
          Massive&apos;s free tier only provides delayed market data (typically 15 minutes
          for stocks, 2 years for full historical). FugaEdge uses Massive to render
          intraday charts on every trade so you can review entries and exits against
          the EMA9, EMA20, and VWAP. Without a paid plan, this view is unavailable.
          Stats, journaling, and trade tracking still work normally.
        </div>
      )}
    </div>
  )
}

// ── Chart canvas ──────────────────────────────────────────────────────────

interface ChartCanvasProps {
  trade: TradeListRow
  payload: IntradayBarsPayload
  tf: Timeframe
  onChangeTf: (next: Timeframe) => void
  showEma9: boolean
  showEma20: boolean
  showVwap: boolean
  onToggleEma9: () => void
  onToggleEma20: () => void
  onToggleVwap: () => void
  onRefresh: () => void
  refreshing: boolean
  /** Fullscreen flag + toggle — modal-owned, drilled down so the Fullscreen
   *  button can flip the modal and the host can resize the chart. */
  isFullscreen: boolean
  onToggleFullscreen: () => void
}

function ChartCanvas({
  trade,
  payload,
  tf,
  onChangeTf,
  showEma9,
  showEma20,
  showVwap,
  onToggleEma9,
  onToggleEma20,
  onToggleVwap,
  onRefresh,
  refreshing,
  isFullscreen,
  onToggleFullscreen,
}: ChartCanvasProps) {
  // Pick the active bars for the selected timeframe. 1m is the source of
  // truth; 5m is client-aggregated from 1m.
  const bars = useMemo(() => {
    if (tf === '5m') return aggregate(payload.bars, 5)
    return payload.bars
  }, [payload.bars, tf])

  // Day OHLC + total volume for the context bar — always from raw 1m bars.
  const dayStats = useMemo(() => computeDayStats(payload.bars), [payload.bars])

  // EMA + VWAP series — recomputed whenever `bars` changes (i.e. when the
  // timeframe toggle flips between 1m and 5m). The same `bars` array drives
  // both the chart series and this calculation, so the displayed candles
  // and the EMA overlay always agree on the same interval.
  const indicators = useMemo(() => computeIndicators(bars), [bars])

  // Compact label for the current timeframe — used as a parenthetical on
  // the indicator legend ("EMA9 (1m)") and the Entry-vs-EMA9 stat so the
  // user always knows what interval the EMA was computed against.
  const tfLabel = tf === 'daily' ? 'D' : tf

  // Active bar interval in ms — passed through to computeZoomWindow /
  // computeZoomLogicalRange for API compatibility, but the zoom window is framed
  // purely by TIME and is independent of the interval (the candle count simply
  // falls out of the interval). Daily / unknown → 0.
  const barIntervalMs =
    tf === '5m' ? 300_000 :
    tf === '1m' ? 60_000 :
    tf === '10s' ? 10_000 :
    0

  // Fit-to-fills lives in the toolbar (here) but needs the chart API (in the
  // host). The host writes its fit handler into this ref; the toolbar icon
  // calls it. null until the chart is ready → icon is a no-op then, as before.
  const fitRef = useRef<(() => void) | null>(null)

  // Screenshot lives in the toolbar (here) but everything it needs — the chart
  // API, tradeMarkers (avg entry/exit), the trade row — is in the host. So the
  // host writes a single capture→compose→save thunk into this ref (mirrors
  // fitRef); the button just invokes it and owns the saving/disabled UI state.
  // null until the chart is ready → button is a no-op then.
  const screenshotRef = useRef<(() => Promise<void>) | null>(null)
  const [savingShot, setSavingShot] = useState(false)
  const handleScreenshot = useCallback(async () => {
    if (savingShot || !screenshotRef.current) return
    setSavingShot(true)
    try {
      await screenshotRef.current()
    } catch (e) {
      // Save rejection (disk/dialog error) bubbles from chartSaveScreenshot's
      // invoke. No toast system in the app yet — log and stay alive so the user
      // can retry. A cancelled dialog is NOT an error (resolves canceled).
      // eslint-disable-next-line no-console
      console.error('[ChartTab] screenshot save failed', e)
    } finally {
      setSavingShot(false)
    }
  }, [savingShot])

  // Recompute the Entry vs EMA9 % from the current bars at entry time.
  // Replaces the static `trade.entry_ema9_distance_pct` value (which was
  // baked-in at 1m at import time and never changed). When the user flips
  // to 5m this now reflects the 5m EMA9 instead.
  const dynamicEma9Pct = useMemo(
    () => computeEntryEma9Pct(trade, indicators.ema9),
    [trade, indicators.ema9],
  )

  return (
    <div className="flex flex-col gap-3">
      <ContextBar
        trade={trade}
        stats={dayStats}
        ema9Pct={dynamicEma9Pct}
        tfLabel={tfLabel}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <TimeframeToggle value={tf} onChange={onChangeTf} />
        <div className="flex items-center gap-2">
          <IndicatorsDropdown
            tfLabel={tfLabel}
            showEma9={showEma9}
            showEma20={showEma20}
            showVwap={showVwap}
            onToggleEma9={onToggleEma9}
            onToggleEma20={onToggleEma20}
            onToggleVwap={onToggleVwap}
          />
          <DrawButton />
          <div className="mx-0.5 h-5 w-px bg-border-subtle" aria-hidden="true" />
          <div className="flex items-center gap-1">
            <ChartIconButton
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              onClick={onToggleFullscreen}
            >
              {isFullscreen ? (
                <Minimize2 size={13} strokeWidth={2} />
              ) : (
                <Maximize2 size={13} strokeWidth={2} />
              )}
            </ChartIconButton>
            <ChartIconButton
              title="Screenshot"
              onClick={handleScreenshot}
              disabled={savingShot}
            >
              {savingShot ? (
                <Loader2 size={13} strokeWidth={2} className="animate-spin" />
              ) : (
                <Camera size={13} strokeWidth={2} />
              )}
            </ChartIconButton>
            <ChartIconButton
              title="Re-fetch from Massive"
              onClick={onRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 size={13} strokeWidth={2} className="animate-spin" />
              ) : (
                <RefreshCw size={13} strokeWidth={2} />
              )}
            </ChartIconButton>
            <ChartIconButton title="Fit to fills" onClick={() => fitRef.current?.()}>
              <Crosshair size={13} strokeWidth={2} />
            </ChartIconButton>
          </div>
        </div>
      </div>

      <LightweightChartHost
        trade={trade}
        bars={bars}
        barIntervalMs={barIntervalMs}
        fitRef={fitRef}
        screenshotRef={screenshotRef}
        isFullscreen={isFullscreen}
        ema9={showEma9 ? indicators.ema9 : null}
        ema20={showEma20 ? indicators.ema20 : null}
        vwap={showVwap ? indicators.vwap : null}
      />
    </div>
  )
}

// ── Lightweight-Charts host ───────────────────────────────────────────────

interface ChartHostProps {
  trade: TradeListRow
  bars: IntradayBar[]
  /** Active timeframe's bar interval in ms — passed to computeZoomWindow /
   *  computeZoomLogicalRange for API compatibility; the zoom window is time-based
   *  and interval-independent. Daily/unknown → 0. */
  barIntervalMs: number
  /** Toolbar lives in the parent; the host writes its fit-to-fills handler here
   *  so the toolbar icon (which has no chart API) can invoke it. */
  fitRef: React.MutableRefObject<(() => void) | null>
  /** Same handoff as fitRef: the host writes its capture→compose→save thunk here
   *  so the toolbar's screenshot button (no chart API / tradeMarkers in scope)
   *  can invoke it. Async — the button awaits it to drive its saving state. */
  screenshotRef: React.MutableRefObject<(() => Promise<void>) | null>
  /** Fullscreen flag (modal-owned, prop-drilled). Drives the chart's pixel
   *  height via chartHeightFor — applied to the chart API in the height effect. */
  isFullscreen: boolean
  ema9: { time: number; value: number }[] | null
  ema20: { time: number; value: number }[] | null
  vwap: { time: number; value: number }[] | null
}

// Series state held in refs so re-renders never re-create the chart instance.
// The chart and its series are mounted once on first non-empty bars set, and
// updated in-place when the indicator series or bars change.
interface ChartRefs {
  api: import('lightweight-charts').IChartApi
  candle: import('lightweight-charts').ISeriesApi<'Candlestick'>
  volume: import('lightweight-charts').ISeriesApi<'Histogram'>
  ema9: import('lightweight-charts').ISeriesApi<'Line'> | null
  ema20: import('lightweight-charts').ISeriesApi<'Line'> | null
  vwap: import('lightweight-charts').ISeriesApi<'Line'> | null
  fillLadder: FillLadderPrimitive
}

// Chart pixel height — flag-driven true-fullscreen. 400 in the normal modal;
// near-viewport in fullscreen (CSS-only restyle: the modal fills the screen, so
// the chart fills the viewport minus the chrome ABOVE it). ONE source feeds the
// container style, the height effect, and the screenshot capture+restore so they
// never disagree. window.innerHeight is read at toggle time (NOT reactive to a
// live window resize — re-toggle to recompute; the ResizeObserver stays
// width-only by design). 180 ≈ the slim bar + ContextBar + toolbar + gaps above
// the chart — tune in smoke if the chart over/under-fills the viewport.
function chartHeightFor(isFullscreen: boolean): number {
  return isFullscreen ? Math.max(400, window.innerHeight - 180) : 400
}

function LightweightChartHost({ trade, bars, barIntervalMs, fitRef, screenshotRef, isFullscreen, ema9, ema20, vwap }: ChartHostProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Flag-driven chart height (see chartHeightFor). Recomputed each render; the
  // height effect applies it to the chart API whenever it changes. createChart
  // below keeps a literal 400 — a fresh mount is always normal-size (fullscreen
  // resets on close and can only be toggled from the chart toolbar, which only
  // exists while mounted), so the mount effect references nothing reactive and
  // its []-deps stays genuinely clean (no eslint-disable needed).
  const chartHeight = chartHeightFor(isFullscreen)
  const refs = useRef<ChartRefs | null>(null)
  // Active price-line handles (entry + exit). Held in a ref so we can
  // remove them before re-creating on trade change — belt-and-suspenders
  // alongside the parent's key={trade.id} remount.
  const priceLinesRef = useRef<import('lightweight-charts').IPriceLine[]>([])
  // Framing guard: the `${trade.id}:${barIntervalMs}` the zoom/fit was last
  // applied for. Cleared whenever the chart instance is (re)created (mount
  // effect) so each fresh chart frames exactly once, while setData / markers /
  // avg-lines keep redrawing on every bars-identity change.
  const lastZoomedRef = useRef<string | null>(null)
  const [libError, setLibError] = useState<string | null>(null)
  // True once the async import + chart construction has finished and
  // refs.current is populated. Data / indicator / marker effects depend on
  // this so they re-fire after the chart is ready instead of bailing
  // silently on first run while the import is still in flight — this race
  // was the cause of the "blank chart until you click Refresh" bug.
  const [chartReady, setChartReady] = useState(false)

  // Fill markers + share-weighted avg entry/exit, from the pure, unit-tested
  // module (src/core/charts/buildTradeMarkers). Computed once and consumed by
  // both the marker effect and the avg-price-line effect below.
  // TODO: feed ema9/vwap for hover (#3b) — the per-fill VWAP%/9EMA-distance
  // stats need the UNGATED indicator series (the ema9/vwap props here are
  // toggle-gated, so they'd null the hover when a line is hidden and churn the
  // marker visuals on every toggle). Passing no opts for now; the hover card
  // and its data source land together in #3b.
  const tradeMarkers = useMemo(() => buildTradeMarkers(trade, bars), [trade, bars])

  // Mount chart once. The library is dynamically imported so the ~110KB
  // bundle only loads when this tab is opened.
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    let resizeObserver: ResizeObserver | null = null

    ;(async () => {
      try {
        const lc = await import('lightweight-charts')
        if (cancelled || !containerRef.current) return

        const chart = lc.createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height: 400,
          layout: {
            background: { type: lc.ColorType.Solid, color: COLOR_INSET },
            textColor: COLOR_TEXT_DIM,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 11,
          },
          grid: {
            vertLines: { visible: false },
            horzLines: { visible: false },
          },
          rightPriceScale: {
            borderColor: COLOR_BORDER,
            borderVisible: false,
            scaleMargins: { top: 0.05, bottom: 0.25 },
          },
          // Day 8.5 Commit B — candles/markers sit on UTC epochs; render the
          // axis + crosshair in US/Eastern so the trader reads market
          // wall-clock, matching their broker / TradingView / Chartswatcher.
          localization: {
            timeFormatter: (t: import('lightweight-charts').Time) =>
              easternAxisLabel(t as number, true),
          },
          timeScale: {
            borderColor: COLOR_GRID, // flattened axis border (#1e2330, was COLOR_BORDER #2a3142)
            timeVisible: true,
            secondsVisible: false,
            tickMarkFormatter: (t: import('lightweight-charts').Time) =>
              easternAxisLabel(t as number, false),
          },
          crosshair: {
            mode: lc.CrosshairMode.Normal,
            vertLine: { color: COLOR_GOLD + '66', width: 1, style: lc.LineStyle.Dashed },
            horzLine: { color: COLOR_GOLD + '66', width: 1, style: lc.LineStyle.Dashed },
          },
        })

        const candle = chart.addSeries(lc.CandlestickSeries, {
          upColor: COLOR_WIN,
          downColor: COLOR_LOSS,
          borderUpColor: COLOR_WIN,
          borderDownColor: COLOR_LOSS,
          wickUpColor: COLOR_WIN,
          wickDownColor: COLOR_LOSS,
          // Suppress the default "last value" horizontal dashed line that
          // lightweight-charts draws at the day's close — for trade review
          // the actionable lines are the user's avg entry / exit, which we
          // add explicitly below. Leaving this default-on was the source of
          // the "wrong price line at ~$4" bug.
          priceLineVisible: false,
          lastValueVisible: false,
        })

        const volume = chart.addSeries(lc.HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
          color: COLOR_BORDER,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        // Pin the volume scale to the lower 18% of the pane.
        chart.priceScale('volume').applyOptions({
          scaleMargins: { top: 0.82, bottom: 0 },
        })

        const fillLadder = new FillLadderPrimitive()
        candle.attachPrimitive(fillLadder)

        refs.current = {
          api: chart,
          candle,
          volume,
          ema9: null,
          ema20: null,
          vwap: null,
          fillLadder,
        }
        // Fresh chart instance → allow a fresh framing. Under StrictMode the
        // setup→cleanup→setup sequence builds a new chart on the second setup;
        // clearing the guard here ensures that chart re-zooms once.
        lastZoomedRef.current = null

        // Container may measure 0px if the Chart tab just became visible
        // (display:none ancestors collapse children width to 0). One
        // requestAnimationFrame after mount the layout has settled —
        // re-apply the real width so the chart isn't a thin sliver on
        // first paint.
        requestAnimationFrame(() => {
          if (cancelled || !containerRef.current || !refs.current) return
          const w = containerRef.current.clientWidth
          if (w > 0) refs.current.api.applyOptions({ width: w })
        })

        // Responsive — track container width so the chart fills the modal
        // body on window resize. Lightweight-Charts has no built-in resize.
        resizeObserver = new ResizeObserver((entries) => {
          const w = entries[0]?.contentRect.width
          if (w) chart.applyOptions({ width: w })
        })
        resizeObserver.observe(containerRef.current)

        // Signal that the data / indicator / marker effects can now run.
        // Until this point refs.current is null and they all bail.
        setChartReady(true)
      } catch (e) {
        if (!cancelled) {
          setLibError(e instanceof Error ? e.message : String(e))
        }
      }
    })()

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      // Atomic teardown — chart.remove() drops every series, marker, and
      // pane along with it. No manual per-series cleanup needed.
      refs.current?.api.remove()
      refs.current = null
      lastZoomedRef.current = null
      setChartReady(false)
    }
  }, [])

  // Data + indicator + marker updates. setData replaces whole series; setMarkers
  // replaces all markers atomically — both are O(n) but fine for 1-day worth
  // of 1m bars (~390 points).
  useEffect(() => {
    const r = refs.current
    if (!r || !chartReady || bars.length === 0) return

    // Price-axis (vertical) framing — install the autoscale provider BEFORE the
    // setData() below, so setData's autoscale pass frames to the FILLS on the
    // first paint (no flicker, no corrective recompute). It's then consulted on
    // every later autoscale (scroll/resize) too, so it stays correct. Option A:
    // fills are the subject; a runner extending above the view is intended.
    // tradeMarkers is the same source the markers use, and its memo deps
    // [trade, bars] ⊆ this effect's deps, so the captured closure is fresh.
    r.candle.applyOptions({
      autoscaleInfoProvider: (base: () => import('lightweight-charts').AutoscaleInfo | null) => {
        const pr = computePriceRange(tradeMarkers.markers.map((m) => m.price))
        if (!pr) return base()
        return { priceRange: { minValue: pr.minValue, maxValue: pr.maxValue } }
      },
    })

    // RAF handle for the deferred zoom apply (cancelled on re-run / unmount).
    let zoomRaf = 0

    // Sanity log so it's obvious when candles don't line up with trade.date.
    // Bars are UTC epoch ms; trade.date is the YYYY-MM-DD from open_time
    // (which is in market-local time, typically ET — so UTC date will
    // usually match for daytime US market hours).
    // eslint-disable-next-line no-console
    console.info(
      `[ChartTab/host] plotting  trade=${trade.symbol}/${trade.date}`
      + ` bars=${bars.length} firstBar=${new Date(bars[0].t).toISOString()}`
      + ` lastBar=${new Date(bars[bars.length - 1].t).toISOString()}`,
    )

    const candleData = bars.map((b) => ({
      time: secondsTime(b.t),
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
    }))
    const volumeData = bars.map((b) => ({
      time: secondsTime(b.t),
      value: b.v,
      color: b.c >= b.o ? COLOR_WIN + '55' : COLOR_LOSS + '55',
    }))

    r.candle.setData(candleData)
    r.volume.setData(volumeData)

    // Frame the chart ONCE per (chart instance, trade, timeframe). setData (and
    // markers / avg-lines) redraw on every bars-identity change, but the zoom
    // must not: repeated payload churn (StrictMode-doubled) would re-fire the
    // deferred RAF and race the chart's own settling, landing at the data
    // default. lastZoomedRef is cleared on chart (re)creation, so a fresh chart
    // still frames once.
    const zoomKey = `${trade.id}:${barIntervalMs}`
    if (lastZoomedRef.current !== zoomKey) {
      // Commit to the framing now (before scheduling) so repeated re-fires with
      // the same key don't stack RAFs.
      lastZoomedRef.current = zoomKey
      // Default the visible range to the trade's own window via a LOGICAL
      // (bar-index) range, not timestamps: the timestamp visible-range API
      // corrupts scrollPosition when the window is a small slice far from the
      // full-day bars' right edge (measured scrollPosition −654 on 5M); the
      // logical range frames the bars directly. Falls back to fitContent() when
      // there's no usable range (no fills / no bars).
      const lr = computeZoomLogicalRange(trade.executions, bars, { barIntervalMs })
      if (lr) {
        // Defer one frame (post-mount width-apply has run), then RE-APPLY the
        // logical range UNCONDITIONALLY every frame for a fixed window. The
        // sparse-5M relayout stomps our range AFTER a transient-correct frame
        // (measured: correct at frame2, stomped to the data-start sliver by
        // frame5), so a "stop once it holds" check bails right before the stomp.
        // Re-writing every frame for ~12 frames (~190ms) outlasts the stomp so
        // we're the last writer. On dense 1M it's a visual no-op (already right).
        const applyAndVerify = (framesLeft: number) => {
          const rr = refs.current            // re-read: host may have unmounted
          if (!rr) return
          rr.api.timeScale().setVisibleLogicalRange({ from: lr.from, to: lr.to })
          if (framesLeft <= 0) return
          zoomRaf = requestAnimationFrame(() => applyAndVerify(framesLeft - 1))
        }
        zoomRaf = requestAnimationFrame(() => applyAndVerify(12))
      } else {
        r.api.timeScale().fitContent()
      }
    }

    return () => {
      if (zoomRaf) cancelAnimationFrame(zoomRaf)
    }
  }, [bars, chartReady, trade, barIntervalMs])

  // Indicator series — created lazily on first toggle-on, removed when toggled
  // off. Reuses series when re-toggling.
  useEffect(() => {
    const r = refs.current
    if (!r || !chartReady) return
    void (async () => {
      const lc = await import('lightweight-charts')
      // EMA9 (white solid)
      if (ema9 && !r.ema9) {
        r.ema9 = r.api.addSeries(lc.LineSeries, {
          color: COLOR_EMA9,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        })
      } else if (!ema9 && r.ema9) {
        r.api.removeSeries(r.ema9)
        r.ema9 = null
      }
      if (r.ema9 && ema9) {
        r.ema9.setData(ema9.map((p) => ({ time: secondsTime(p.time), value: p.value })))
      }

      // EMA20 (cyan solid)
      if (ema20 && !r.ema20) {
        r.ema20 = r.api.addSeries(lc.LineSeries, {
          color: COLOR_EMA20,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        })
      } else if (!ema20 && r.ema20) {
        r.api.removeSeries(r.ema20)
        r.ema20 = null
      }
      if (r.ema20 && ema20) {
        r.ema20.setData(ema20.map((p) => ({ time: secondsTime(p.time), value: p.value })))
      }

      // VWAP (gold solid)
      if (vwap && !r.vwap) {
        r.vwap = r.api.addSeries(lc.LineSeries, {
          color: COLOR_VWAP,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        })
      } else if (!vwap && r.vwap) {
        r.api.removeSeries(r.vwap)
        r.vwap = null
      }
      if (r.vwap && vwap) {
        r.vwap.setData(vwap.map((p) => ({ time: secondsTime(p.time), value: p.value })))
      }
    })()
  }, [ema9, ema20, vwap, chartReady])

  // Fill markers — the ladder primitive (a dot on the bar at the exact fill
  // price + a thin leader + a "QTY @ PRICE" pill, de-collided by the pure
  // layoutFillLadder). We just push the buildTradeMarkers descriptors; the
  // primitive recomputes pixel coords every frame against the live time scale,
  // so the old 12-frame marker-reassert RAF hack is gone entirely.
  useEffect(() => {
    const r = refs.current
    if (!r || !chartReady) return
    r.fillLadder.setMarkers(tradeMarkers.markers)
  }, [tradeMarkers, chartReady])

  // Avg Entry / Avg Exit price lines. Long trades: entry = buys, exit =
  // sells. Short trades: entry = sells, exit = buys (the user opens by
  // selling short and closes by buying back). Colors track the FILL side
  // (B=win, S=loss) so the line color matches the marker arrows; the
  // title tracks the entry/exit ROLE so the label reflects what the
  // trader actually did. Labels say "Avg" because the price shown is the
  // weighted average across all entry/exit fills, not a single price —
  // a multi-fill scale-in/out trade has multiple fills behind one line.
  useEffect(() => {
    const r = refs.current
    if (!r || !chartReady) return

    // Clear any prior trade's lines first (defensive).
    for (const pl of priceLinesRef.current) {
      try {
        r.candle.removePriceLine(pl)
      } catch {
        // already gone — chart was torn down between renders
      }
    }
    priceLinesRef.current = []

    // Share-weighted avg entry/exit now come from buildTradeMarkers (the inline
    // avg() lived here before). The module already applies the long/short role
    // mapping (entry = buys for long, sells for short); the color mapping and
    // titles below are unchanged.
    const entryAvg = tradeMarkers.avgEntry
    const exitAvg = tradeMarkers.avgExit

    const isShort = trade.side === 'short'
    // Color follows the underlying fill side — matches the marker dots.
    const entryColor = isShort ? COLOR_LOSS : COLOR_WIN
    const exitColor = isShort ? COLOR_WIN : COLOR_LOSS

    if (entryAvg != null) {
      priceLinesRef.current.push(
        r.candle.createPriceLine({
          price: entryAvg,
          color: entryColor,
          lineWidth: 1,
          lineStyle: 0, // solid
          axisLabelVisible: true,
          title: `Avg Entry ${price(entryAvg)}`,
        }),
      )
    }
    if (exitAvg != null) {
      priceLinesRef.current.push(
        r.candle.createPriceLine({
          price: exitAvg,
          color: exitColor,
          lineWidth: 1,
          lineStyle: 0,
          axisLabelVisible: true,
          title: `Avg Exit ${price(exitAvg)}`,
        }),
      )
    }

    // No cleanup needed — chart.remove() in the mount effect's teardown
    // drops every priceLine along with the candle series.
  }, [trade, tradeMarkers, chartReady])

  // Fit-to-fills handler, exposed to the toolbar via fitRef. Same logic as the
  // former FitToFillsButton (relocated for the unified toolbar): default the
  // visible range to the trade's own window. No-op until the chart is ready.
  const fitToFills = useCallback(() => {
    const r = refs.current
    if (!r) return
    const lr = computeZoomLogicalRange(trade.executions, bars, { barIntervalMs })
    if (!lr) return
    r.api.timeScale().setVisibleLogicalRange({ from: lr.from, to: lr.to })
  }, [trade, bars, barIntervalMs])
  useEffect(() => {
    fitRef.current = fitToFills
    return () => {
      fitRef.current = null
    }
  }, [fitToFills, fitRef])

  // Screenshot capture→compose→save, exposed to the toolbar via screenshotRef.
  // Lives here because the host owns everything it needs: the chart API
  // (takeScreenshot), tradeMarkers (avg entry/exit), and the trade row.
  // Formatting is done here via @/lib/format → strings; the branded layout is
  // the pure src/lib/chartScreenshot module. takeScreenshot(true, false): true
  // includes the fill markers (top-layer primitives), false drops the crosshair.
  const captureAndSave = useCallback(async () => {
    const api = refs.current?.api
    if (!api) return // chart not ready — no-op (the button also guards)

    // Fixed-width capture for a crisp, DPR-independent export. Render the chart
    // at a fixed 1600px width — preserving the on-screen ASPECT RATIO so candles
    // aren't distorted (height scales by the same factor as width) — capture,
    // then restore the live size. Two gotchas, both handled:
    //   • applyOptions({width,height}) schedules an ASYNC redraw; capturing
    //     before it paints yields the OLD size. So we wait TWO animation frames
    //     after the resize (one for the chart's own scheduled render to run, one
    //     to be safely past the paint) before takeScreenshot.
    //   • Resizing disturbs the visible range — lightweight-charts preserves
    //     barSpacing on a width change, so a wider chart reveals MORE bars (the
    //     same relayout-stomp the framing fix fights). We snapshot the visible
    //     logical range first and re-apply it at the big size (so the capture
    //     frames the SAME bars, just crisper) AND after restore (so the on-screen
    //     view is pixel-identical). Logical (bar-index) range is width-independent.
    // Restore runs in finally so the on-screen chart is ALWAYS put back even if
    // takeScreenshot throws; compose/save then run with the chart already
    // restored, keeping the visible resize flicker brief. Falls back to a plain
    // capture when the live width is unreadable.
    const ts = api.timeScale()
    const savedRange = ts.getVisibleLogicalRange()
    const originalWidth = containerRef.current?.clientWidth ?? 0
    const nextFrame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const captureChart = async (): Promise<HTMLCanvasElement> => {
      if (originalWidth <= 0) return api.takeScreenshot(true, false)
      const TARGET_W = 1600
      // Base the capture aspect on the LIVE height (chartHeight), not a literal
      // 400 — otherwise a fullscreen screenshot would be captured at the normal
      // 400-tall aspect (vertically squished). Normal mode: chartHeight===400, so
      // this is identical to before.
      const TARGET_H = Math.round(chartHeight * (TARGET_W / originalWidth))
      try {
        api.applyOptions({ width: TARGET_W, height: TARGET_H })
        if (savedRange) ts.setVisibleLogicalRange(savedRange)
        await nextFrame()
        await nextFrame()
        if (savedRange) ts.setVisibleLogicalRange(savedRange) // re-assert pre-capture
        return api.takeScreenshot(true, false)
      } finally {
        // ALWAYS restore the on-screen size + framing, even if capture threw.
        // height: chartHeight (not a literal 400) so screenshotting WHILE
        // fullscreen restores to the fullscreen height, not the normal one.
        api.applyOptions({ width: originalWidth, height: chartHeight })
        if (savedRange) ts.setVisibleLogicalRange(savedRange)
      }
    }
    const chartCanvas = await captureChart()

    const data: BrandedScreenshotData = {
      symbol: trade.symbol,
      side: trade.side,
      setupName: trade.playbook_name,
      dateLabel: longDate(trade.date),
      netPnl: trade.net_pnl,
      netPnlText: signed(trade.net_pnl),
      avgEntryText: tradeMarkers.avgEntry != null ? `$${price(tradeMarkers.avgEntry)}` : '—',
      avgExitText: tradeMarkers.avgExit != null ? `$${price(tradeMarkers.avgExit)}` : '—',
      sharesText: int(Math.max(trade.shares_bought, trade.shares_sold)),
      holdText: formatHoldTime(trade.open_time, trade.close_time),
    }
    const out = await composeBrandedScreenshot(chartCanvas, data)
    const blob = await new Promise<Blob | null>((resolve) =>
      out.toBlob(resolve, 'image/png'),
    )
    if (!blob) throw new Error('Failed to encode screenshot PNG')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    await ipc.chartSaveScreenshot({
      bytes,
      suggestedName: `fugaedge-${trade.symbol}-${trade.date}.png`,
    })
  }, [trade, tradeMarkers, chartHeight])
  useEffect(() => {
    screenshotRef.current = captureAndSave
    return () => {
      screenshotRef.current = null
    }
  }, [captureAndSave, screenshotRef])

  // Apply the flag-driven height to the chart API when fullscreen toggles.
  // useLayoutEffect (NOT useEffect): it runs synchronously after the DOM mutates
  // but BEFORE the browser paints, so the canvas resizes in the SAME frame the
  // container grows. useEffect runs AFTER paint, which left one blank frame where
  // the container had already jumped to the new height but the canvas had not —
  // that was the fullscreen "blink". We also apply WIDTH here (from the now-full-
  // viewport container's clientWidth) so the toggle is atomic and doesn't wait for
  // the width-only ResizeObserver to catch up on a later tick. The ResizeObserver
  // stays as-is for ordinary window resizes; height still changes ONLY via this
  // effect (never the observer), so it never fights the screenshot capture. A
  // height change rescales the PRICE axis, not the time axis, so the visible
  // logical range is unaffected — but we snapshot + re-apply it anyway as cheap,
  // symmetric insurance. On mount this is a no-op (chartHeight already 400).
  useLayoutEffect(() => {
    const r = refs.current
    if (!r || !chartReady) return
    const w = containerRef.current?.clientWidth ?? 0
    const ts = r.api.timeScale()
    const savedRange = ts.getVisibleLogicalRange()
    r.api.applyOptions(w > 0 ? { width: w, height: chartHeight } : { height: chartHeight })
    if (savedRange) ts.setVisibleLogicalRange(savedRange)
  }, [chartHeight, chartReady])

  if (libError) {
    return (
      <div className="rounded-lg border border-loss/40 bg-loss-soft p-4 text-sm text-fg-secondary">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-loss">
          Failed to load chart library
        </div>
        <div className="mt-1">{libError}</div>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Card-style frame around the lightweight-charts canvas. Same
          surface + border + shadow as the stat cards above so the chart
          reads as part of the modal's content hierarchy, not as a raw
          embed. Canvas paints over the bg-2 background. */}
      <div
        ref={containerRef}
        className="w-full overflow-hidden rounded-lg border border-border-subtle bg-bg-2 shadow-sm"
        style={{ height: chartHeight }}
      />
    </div>
  )
}

// ── Toolbar pieces ────────────────────────────────────────────────────────

interface TimeframeToggleProps {
  value: Timeframe
  onChange: (next: Timeframe) => void
}

function TimeframeToggle({ value, onChange }: TimeframeToggleProps) {
  // 10s and Daily disabled — neither has data plumbing yet (10s needs a
  // separate Massive endpoint, Daily needs OHLC aggregates we don't store).
  const opts: { key: Timeframe; label: string; disabled?: string }[] = [
    { key: '10s', label: '10s', disabled: 'Needs 10-second Massive aggregates — not yet wired.' },
    { key: '1m', label: '1m' },
    { key: '5m', label: '5m' },
    { key: 'daily', label: 'Daily', disabled: 'Daily OHLC not stored yet — only volume.' },
  ]
  return (
    <div role="tablist" className="inline-flex items-center rounded-md border border-border-subtle bg-bg-2 p-0.5">
      {opts.map((o) => {
        const active = o.key === value
        const disabled = !!o.disabled
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(o.key)}
            title={o.disabled ?? `Show ${o.label} bars`}
 className={`rounded-[5px] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
              active
                ? 'bg-gold text-accent-ink'
                : disabled
                  ? 'cursor-not-allowed text-fg-muted opacity-50'
                  : 'cursor-pointer text-fg-tertiary hover:bg-bg-3 hover:text-fg-primary'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

interface IndicatorToggleProps {
  label: string
  color: string
  active: boolean
  onClick: () => void
  dashed?: boolean
  dotted?: boolean
}

function IndicatorToggle({ label, color, active, onClick, dashed, dotted }: IndicatorToggleProps) {
  const stroke = dotted ? '2 2' : dashed ? '4 2' : undefined
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
 className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
        active
          ? 'border-border bg-bg-3 text-fg-primary'
          : 'border-border-subtle bg-bg-2 text-fg-tertiary hover:text-fg-secondary'
      }`}
    >
      <svg width="14" height="2" aria-hidden="true">
        <line
          x1="0"
          y1="1"
          x2="14"
          y2="1"
          stroke={active ? color : COLOR_BORDER}
          strokeWidth="2"
          strokeDasharray={stroke}
        />
      </svg>
      {label}
    </button>
  )
}

interface IndicatorsDropdownProps {
  tfLabel: string
  showEma9: boolean
  showEma20: boolean
  showVwap: boolean
  onToggleEma9: () => void
  onToggleEma20: () => void
  onToggleVwap: () => void
}

// Collapses the three indicator toggles into a dropdown so the toolbar stays
// compact (room for MACD/RSI later). The panel reuses IndicatorToggle unchanged
// — same state + handlers. Click-outside (mousedown) and Escape close it;
// toggling inside leaves it open so several can be flipped in one go.
function IndicatorsDropdown({
  tfLabel,
  showEma9,
  showEma20,
  showVwap,
  onToggleEma9,
  onToggleEma20,
  onToggleVwap,
}: IndicatorsDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const activeCount = [showEma9, showEma20, showVwap].filter(Boolean).length

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Indicators"
        className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border-subtle bg-bg-2 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:border-border hover:text-fg-primary"
      >
        Indicators
        <span className="text-fg-muted">{activeCount}/3</span>
        <ChevronDown
          size={12}
          strokeWidth={2}
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 flex flex-col gap-1 rounded-md border border-border-subtle bg-bg-3 p-2 shadow-lg">
          <IndicatorToggle
            label={`9EMA (${tfLabel})`}
            color={COLOR_EMA9}
            active={showEma9}
            onClick={onToggleEma9}
          />
          <IndicatorToggle
            label={`EMA20 (${tfLabel})`}
            color={COLOR_EMA20}
            active={showEma20}
            onClick={onToggleEma20}
          />
          <IndicatorToggle
            label="VWAP"
            color={COLOR_VWAP}
            active={showVwap}
            onClick={onToggleVwap}
          />
        </div>
      )}
    </div>
  )
}

// Reserved slot for the deferred drawing-tools project — present but disabled so
// the toolbar layout is final. Does nothing on click.
function DrawButton() {
  return (
    <button
      type="button"
      disabled
      title="Drawing tools coming soon"
      className="inline-flex h-7 cursor-not-allowed items-center gap-1.5 rounded-md border border-border-subtle bg-bg-2 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-fg-muted opacity-60"
    >
      Draw
      <span className="rounded bg-bg-3 px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-fg-muted">
        soon
      </span>
      <ChevronDown size={12} strokeWidth={2} />
    </button>
  )
}

// Square icon button — matches the former refresh button's chrome exactly.
function ChartIconButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 hover:border-border hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

// ── Context bar ───────────────────────────────────────────────────────────

interface DayStats {
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number
}

function ContextBar({
  trade,
  stats,
  ema9Pct,
  tfLabel,
}: {
  trade: TradeListRow
  stats: DayStats
  /** Live EMA9-distance value for the current timeframe. Pass null when no
   *  EMA can be computed (entry before period seed, or no fills). */
  ema9Pct: number | null
  /** Timeframe suffix shown in the stat label ("(1m)", "(5m)", "(D)"). */
  tfLabel: string
}) {
  // Reference to `trade` retained for future per-side / per-symbol context
  // hooks (currently the stat block draws solely from ema9Pct + stats).
  void trade
  const ema9Tone =
    ema9Pct == null
      ? 'text-fg-muted'
      : Math.abs(ema9Pct) > 5
        ? 'text-loss'
        : Math.abs(ema9Pct) > 3
          ? 'text-gold'
          : 'text-win'
  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border border-border-subtle bg-bg-2 p-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
      <Pair label="Open" value={stats.open == null ? '—' : `$${price(stats.open)}`} />
      <Pair label="High" value={stats.high == null ? '—' : `$${price(stats.high)}`} tone="text-win" />
      <Pair label="Low"  value={stats.low  == null ? '—' : `$${price(stats.low)}`}  tone="text-loss" />
      <Pair label="Close" value={stats.close == null ? '—' : `$${price(stats.close)}`} />
      <Pair label="Day volume" value={int(stats.volume)} />
      <Pair
        label={`Entry vs 9EMA (${tfLabel})`}
        value={
          ema9Pct == null
            ? '—'
            : `${ema9Pct >= 0 ? '+' : ''}${ema9Pct.toFixed(2)}%`
        }
        tone={ema9Tone}
      />
    </div>
  )
}

function Pair({ label, value, tone = 'text-fg-primary' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        {label}
      </div>
      <div className={`mt-0.5 truncate font-mono text-sm font-semibold tnum ${tone}`}>
        {value}
      </div>
    </div>
  )
}

// ── Pure utilities (no DOM) ───────────────────────────────────────────────

function secondsTime(epochMs: number): import('lightweight-charts').UTCTimestamp {
  // Lightweight Charts wants seconds since epoch (UTC). Cast through their
  // branded UTCTimestamp type so TS is happy.
  return Math.floor(epochMs / 1000) as import('lightweight-charts').UTCTimestamp
}

// Eastern wall-clock label for a lightweight-charts UTCTimestamp (epoch
// seconds). Candles, markers, and indicator series all sit on UTC epochs;
// this renders the time axis + crosshair in US/Eastern (Day 8.5 Commit B) so
// a US trader reads market wall-clock instead of UTC. `withSeconds` is on for
// the crosshair tooltip, off (HH:MM) for the denser axis tick labels.
function easternAxisLabel(timeSec: number, withSeconds: boolean): string {
  const label = formatEastern(new Date(timeSec * 1000).toISOString())
  return withSeconds ? label : label.slice(0, 5)
}

// Hold time between entry and exit, compact (e.g. "1h 23m", "12m 4s", "45s").
// open_time/close_time are ISO strings; their DIFFERENCE is timezone-agnostic
// (both parsed the same way) so this is correct regardless of a Z suffix. Open
// trades (close_time null) read "Open"; a malformed/negative span reads "—".
function formatHoldTime(openTime: string, closeTime: string | null): string {
  if (!closeTime) return 'Open'
  const ms = Date.parse(closeTime) - Date.parse(openTime)
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const totalSec = Math.round(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function computeDayStats(bars: IntradayBar[]): DayStats {
  if (bars.length === 0) {
    return { open: null, high: null, low: null, close: null, volume: 0 }
  }
  let high = -Infinity
  let low = Infinity
  let volume = 0
  for (const b of bars) {
    if (b.h > high) high = b.h
    if (b.l < low) low = b.l
    volume += b.v
  }
  return {
    open: bars[0].o,
    high: Number.isFinite(high) ? high : null,
    low: Number.isFinite(low) ? low : null,
    close: bars[bars.length - 1].c,
    volume,
  }
}

// Bucket 1-min bars into N-minute candles. Volumes sum, O/C/H/L combine.
function aggregate(bars: IntradayBar[], minutes: number): IntradayBar[] {
  if (bars.length === 0 || minutes <= 1) return bars
  const bucketMs = minutes * 60 * 1000
  const out: IntradayBar[] = []
  let bucketStart = 0
  let cur: IntradayBar | null = null
  for (const b of bars) {
    const start = Math.floor(b.t / bucketMs) * bucketMs
    if (!cur || start !== bucketStart) {
      if (cur) out.push(cur)
      bucketStart = start
      cur = { t: start, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }
    } else {
      cur.h = Math.max(cur.h, b.h)
      cur.l = Math.min(cur.l, b.l)
      cur.c = b.c
      cur.v += b.v
    }
  }
  if (cur) out.push(cur)
  return out
}

interface IndicatorSeries {
  ema9: { time: number; value: number }[]
  ema20: { time: number; value: number }[]
  vwap: { time: number; value: number }[]
}

function computeIndicators(bars: IntradayBar[]): IndicatorSeries {
  return {
    ema9: ema(bars, 9),
    ema20: ema(bars, 20),
    vwap: vwap(bars),
  }
}

// Standard EMA — SMA-seeded for the first `period` bars, then exponentially
// smoothed. Matches the convention in electron/lib/ema.ts so chart and
// per-trade EMA9 distance use the same scale.
function ema(bars: IntradayBar[], period: number): { time: number; value: number }[] {
  if (bars.length < period) return []
  const k = 2 / (period + 1)
  const out: { time: number; value: number }[] = []
  let sum = 0
  for (let i = 0; i < period; i++) sum += bars[i].c
  let prev = sum / period
  out.push({ time: bars[period - 1].t, value: prev })
  for (let i = period; i < bars.length; i++) {
    prev = bars[i].c * k + prev * (1 - k)
    out.push({ time: bars[i].t, value: prev })
  }
  return out
}

// Entry vs EMA9 distance, computed dynamically from the CURRENTLY DISPLAYED
// timeframe's EMA9 series rather than the static per-trade column that was
// baked in at 1m at import time. Flipping the timeframe toggle replays this
// against the new EMA9 array so the stat agrees with the visible overlay.
//
// Algorithm: pick the trade's first entry fill (buy for long, sell for
// short); find the latest EMA9 point at-or-before that fill's timestamp;
// return % distance. Null when no EMA point covers entry (early-day entry
// before period seed) or when fills are missing.
function computeEntryEma9Pct(
  trade: import('@shared/trades-types').TradeListRow,
  ema9Series: { time: number; value: number }[],
): number | null {
  if (ema9Series.length === 0) return null
  const entrySide = trade.side === 'short' ? 'S' : 'B'
  const entryFill = trade.executions.find((e) => e.side === entrySide)
  if (!entryFill) return null
  // entryFill.time is true UTC with a Z suffix (Day 8.5 Commit B). The
  // includes('Z') guard is kept deliberately — it tolerates either form, so
  // this stays correct even if a caller ever passes a legacy bare-local
  // string. Do NOT simplify to a hard `${...}Z` append: that would double
  // the Z on the normal already-UTC path and yield NaN.
  const entryEpoch = Date.parse(
    entryFill.time.includes('Z') ? entryFill.time : `${entryFill.time}Z`,
  )
  if (!Number.isFinite(entryEpoch)) return null
  // ema9Series is sorted ascending by time. Walk forward; remember the last
  // point still <= entryEpoch and bail when we cross past it.
  let chosen: { time: number; value: number } | null = null
  for (const p of ema9Series) {
    if (p.time <= entryEpoch) chosen = p
    else break
  }
  if (!chosen || chosen.value === 0) return null
  return ((entryFill.price - chosen.value) / chosen.value) * 100
}

// Session VWAP — typical price = (h+l+c)/3, weighted by volume, cumulative.
function vwap(bars: IntradayBar[]): { time: number; value: number }[] {
  const out: { time: number; value: number }[] = []
  let cumPV = 0
  let cumV = 0
  for (const b of bars) {
    const tp = (b.h + b.l + b.c) / 3
    cumPV += tp * b.v
    cumV += b.v
    out.push({ time: b.t, value: cumV > 0 ? cumPV / cumV : tp })
  }
  return out
}
