import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Lock,
  Maximize2,
  RefreshCw,
} from 'lucide-react'
import type { TradeListRow } from '@shared/trades-types'
import type { IntradayBar, IntradayBarsPayload } from '@shared/market-types'
import { ipc } from '@/lib/ipc'
import { int, money, price, signed, formatEastern } from '@/lib/format'

// MASTER tokens — kept as constants so the lightweight-charts API (which
// wants raw hex, not Tailwind classes) stays on the same palette as the
// rest of the modal.
const COLOR_INSET       = '#0a0c11'  // bg-inset (chart canvas)
const COLOR_GRID        = '#1e2330'  // border-subtle
const COLOR_BORDER      = '#2a3142'  // border
const COLOR_TEXT_DIM    = '#8a94a8'  // fg-tertiary
const COLOR_TEXT        = '#f3f5fa'  // fg-primary
const COLOR_GOLD        = '#d4af37'  // brand gold
const COLOR_GOLD_SOFT   = '#e4c252'  // gold-hover (lighter — used for EMA20)
const COLOR_WIN         = '#34d399'  // win
const COLOR_LOSS        = '#f87171'  // loss

type Timeframe = '10s' | '1m' | '5m' | 'daily'

interface ChartTabProps {
  trade: TradeListRow
}

export default function ChartTab({ trade }: ChartTabProps) {
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
          <IndicatorToggle
            label={`9EMA (${tfLabel})`}
            color={COLOR_GOLD}
            active={showEma9}
            onClick={onToggleEma9}
          />
          <IndicatorToggle
            label={`EMA20 (${tfLabel})`}
            color={COLOR_GOLD_SOFT}
            active={showEma20}
            onClick={onToggleEma20}
            dashed
          />
          <IndicatorToggle
            label="VWAP"
            color={COLOR_TEXT}
            active={showVwap}
            onClick={onToggleVwap}
            dotted
          />
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Re-fetch from Massive"
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 hover:border-border hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {refreshing ? (
              <Loader2 size={13} strokeWidth={2} className="animate-spin" />
            ) : (
              <RefreshCw size={13} strokeWidth={2} />
            )}
          </button>
        </div>
      </div>

      <LightweightChartHost
        trade={trade}
        bars={bars}
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
  markersPlugin: import('lightweight-charts').ISeriesMarkersPluginApi<import('lightweight-charts').Time>
}

function LightweightChartHost({ trade, bars, ema9, ema20, vwap }: ChartHostProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const refs = useRef<ChartRefs | null>(null)
  // Active price-line handles (entry + exit). Held in a ref so we can
  // remove them before re-creating on trade change — belt-and-suspenders
  // alongside the parent's key={trade.id} remount.
  const priceLinesRef = useRef<import('lightweight-charts').IPriceLine[]>([])
  const [libError, setLibError] = useState<string | null>(null)
  // True once the async import + chart construction has finished and
  // refs.current is populated. Data / indicator / marker effects depend on
  // this so they re-fire after the chart is ready instead of bailing
  // silently on first run while the import is still in flight — this race
  // was the cause of the "blank chart until you click Refresh" bug.
  const [chartReady, setChartReady] = useState(false)

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
            vertLines: { color: COLOR_GRID },
            horzLines: { color: COLOR_GRID },
          },
          rightPriceScale: {
            borderColor: COLOR_BORDER,
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
            borderColor: COLOR_BORDER,
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

        const markersPlugin = lc.createSeriesMarkers(candle, [])

        refs.current = {
          api: chart,
          candle,
          volume,
          ema9: null,
          ema20: null,
          vwap: null,
          markersPlugin,
        }

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
      setChartReady(false)
    }
  }, [])

  // Data + indicator + marker updates. setData replaces whole series; setMarkers
  // replaces all markers atomically — both are O(n) but fine for 1-day worth
  // of 1m bars (~390 points).
  useEffect(() => {
    const r = refs.current
    if (!r || !chartReady || bars.length === 0) return

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

    // Fit time scale to the day's range once data lands.
    r.api.timeScale().fitContent()
  }, [bars, chartReady, trade])

  // Indicator series — created lazily on first toggle-on, removed when toggled
  // off. Reuses series when re-toggling.
  useEffect(() => {
    const r = refs.current
    if (!r || !chartReady) return
    void (async () => {
      const lc = await import('lightweight-charts')
      // EMA9 (gold solid)
      if (ema9 && !r.ema9) {
        r.ema9 = r.api.addSeries(lc.LineSeries, {
          color: COLOR_GOLD,
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

      // EMA20 (gold soft, dashed)
      if (ema20 && !r.ema20) {
        r.ema20 = r.api.addSeries(lc.LineSeries, {
          color: COLOR_GOLD_SOFT,
          lineWidth: 1,
          lineStyle: lc.LineStyle.Dashed,
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

      // VWAP (white dotted)
      if (vwap && !r.vwap) {
        r.vwap = r.api.addSeries(lc.LineSeries, {
          color: COLOR_TEXT,
          lineWidth: 1,
          lineStyle: lc.LineStyle.Dotted,
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

  // Fill markers — buy = green up arrow under the candle, sell = red down
  // arrow above. Snapped to the nearest 1-minute bar time, labeled with side,
  // shares, and price.
  useEffect(() => {
    const r = refs.current
    if (!r || !chartReady || bars.length === 0) return
    // Defensive: drop any leftover markers from a prior trade in case the
    // host instance was reused. With key={trade.id} on the parent ChartTab
    // this is belt-and-suspenders, but the clear is free and prevents any
    // ordering hazard if the parent ever forgets the key.
    r.markersPlugin.setMarkers([])
    const markers = buildFillMarkers(trade, bars)
    r.markersPlugin.setMarkers(markers)
  }, [trade, bars, chartReady])

  // Entry / Exit price lines. Long trades: entry = buys, exit = sells.
  // Short trades: entry = sells, exit = buys (the user opens by selling
  // short and closes by buying back). Colors track the FILL side (B=win,
  // S=loss) so the line color matches the marker arrows; the title tracks
  // the entry/exit ROLE so the label reflects what the trader actually did.
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

    const avg = (fills: typeof trade.executions): number | null => {
      if (fills.length === 0) return null
      let dollars = 0
      let qty = 0
      for (const f of fills) {
        dollars += f.price * f.qty
        qty += f.qty
      }
      return qty > 0 ? dollars / qty : null
    }
    const buys = trade.executions.filter((e) => e.side === 'B')
    const sells = trade.executions.filter((e) => e.side === 'S')
    const avgBuy = avg(buys)
    const avgSell = avg(sells)

    const isShort = trade.side === 'short'
    const entryAvg = isShort ? avgSell : avgBuy
    const exitAvg = isShort ? avgBuy : avgSell
    // Color follows the underlying fill side — matches the marker arrows.
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
          title: `Entry ${price(entryAvg)}`,
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
          title: `Exit ${price(exitAvg)}`,
        }),
      )
    }

    // No cleanup needed — chart.remove() in the mount effect's teardown
    // drops every priceLine along with the candle series.
  }, [trade, chartReady])

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
      <div className="flex items-center justify-end pb-1">
        <FitToFillsButton chartRefs={refs} trade={trade} bars={bars} />
      </div>
      {/* Card-style frame around the lightweight-charts canvas. Same
          surface + border + shadow as the stat cards above so the chart
          reads as part of the modal's content hierarchy, not as a raw
          embed. Canvas paints over the bg-2 background. */}
      <div
        ref={containerRef}
        className="w-full overflow-hidden rounded-lg border border-border-subtle bg-bg-2 shadow-sm"
        style={{ height: 400 }}
      />
    </div>
  )
}

function FitToFillsButton({
  chartRefs,
  trade,
  bars,
}: {
  chartRefs: React.MutableRefObject<ChartRefs | null>
  trade: TradeListRow
  bars: IntradayBar[]
}) {
  const fit = useCallback(() => {
    const r = chartRefs.current
    if (!r || bars.length === 0 || trade.executions.length === 0) return
    const fillTimes = trade.executions
      // e.time is true UTC with a Z suffix (Day 8.5 Commit B) — parse directly.
      .map((e) => Date.parse(e.time))
      .filter((t) => Number.isFinite(t))
    if (fillTimes.length === 0) return
    const minFill = Math.min(...fillTimes)
    const maxFill = Math.max(...fillTimes)
    const from = secondsTime(minFill - 30 * 60 * 1000)
    const to = secondsTime(maxFill + 30 * 60 * 1000)
    r.api.timeScale().setVisibleRange({ from, to })
  }, [chartRefs, trade, bars])

  return (
    <button
      type="button"
      onClick={fit}
      title="Zoom to 30 min before first fill / 30 min after last fill"
      className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border-subtle bg-bg-2 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
    >
      <Maximize2 size={11} strokeWidth={2} />
      Fit to fills
    </button>
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

// Convert trade executions into series markers. Each fill becomes one marker
// snapped to the nearest 1-min bar (since marker time must match a series
// time exactly in lightweight-charts).
function buildFillMarkers(
  trade: TradeListRow,
  bars: IntradayBar[],
): import('lightweight-charts').SeriesMarker<import('lightweight-charts').Time>[] {
  if (bars.length === 0) return []
  const barTimesSec = bars.map((b) => Math.floor(b.t / 1000))
  const out: import('lightweight-charts').SeriesMarker<import('lightweight-charts').Time>[] = []
  for (const e of trade.executions) {
    // e.time is true UTC with a Z suffix (Day 8.5 Commit B) — parse directly.
    // The pre-Commit-B `${e.time}Z` append now doubles the Z → NaN → the
    // marker silently vanishes; that bug is what Tester A's chart surfaced.
    const epoch = Date.parse(e.time)
    if (!Number.isFinite(epoch)) continue
    const sec = Math.floor(epoch / 1000)
    // Snap to nearest bar time so the marker rides the candle exactly.
    const snapped = nearest(barTimesSec, sec)
    const isBuy = e.side === 'B'
    out.push({
      time: snapped as import('lightweight-charts').UTCTimestamp,
      position: isBuy ? 'belowBar' : 'aboveBar',
      color: isBuy ? COLOR_WIN : COLOR_LOSS,
      shape: isBuy ? 'arrowUp' : 'arrowDown',
      text: `${e.side} ${int(e.qty)} @ ${money(e.price).replace('$', '')}`,
      size: 1.4,
    })
  }
  // Lightweight charts requires markers sorted by time ascending.
  out.sort((a, b) => (a.time as number) - (b.time as number))
  return out
}

function nearest(sorted: number[], target: number): number {
  if (sorted.length === 0) return target
  let lo = 0
  let hi = sorted.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < target) lo = mid + 1
    else hi = mid
  }
  // Compare neighbours.
  if (lo > 0 && Math.abs(sorted[lo - 1] - target) < Math.abs(sorted[lo] - target)) {
    return sorted[lo - 1]
  }
  return sorted[lo]
}

// `signed` import kept for potential P&L overlay future use.
void signed
