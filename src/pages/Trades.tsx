import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Upload, FilterX, ListOrdered } from 'lucide-react'
import PageShell from '@/components/layout/PageShell'
import Skeleton from '@/components/ui/Skeleton'
import TradesTable from '@/components/trades/TradesTable'
import TradesFilters, {
  applyTradesFilters,
  emptyFilters,
  isFiltering,
  type TradesFilterState,
} from '@/components/trades/TradesFilters'
import QuickFilters from '@/components/trades/QuickFilters'
import TradesViewToggle, { type TradesView } from '@/components/trades/TradesViewToggle'
import TradeChartCard from '@/components/trades/TradeChartCard'
import TradeChartTile from '@/components/trades/TradeChartTile'
import { ipc } from '@/lib/ipc'
import { int } from '@/lib/format'
import { readShowSparkline, writeShowSparkline } from '@/lib/prefs/sparkline'
import type {
  TradeListRow,
  UpdateCatalystInput,
  UpdateConfidenceInput,
  UpdateCountryInput,
  UpdateFloatInput,
  UpdateMistakesInput,
  UpdateNoteInput,
  UpdatePlannedRiskInput,
  UpdatePlannedStopLossInput,
  UpdateTimeframeInput,
} from '@shared/trades-types'
import type { SetPlaybookOnTradeInput } from '@shared/playbook-types'

const FLOAT_COL_STORAGE_KEY = 'trades.showFloatColumn'
const COUNTRY_COL_STORAGE_KEY = 'trades.showCountryColumn'

export default function Trades() {
  const [trades, setTrades] = useState<TradeListRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [view, setView] = useState<TradesView>('table')
  const [filters, setFilters] = useState<TradesFilterState>(emptyFilters())
  const [showFloatColumn, setShowFloatColumn] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(FLOAT_COL_STORAGE_KEY) === '1'
  })
  // Country column defaults to visible. Setter reserved for future toggle UI.
  const [showCountryColumn] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const v = window.localStorage.getItem(COUNTRY_COL_STORAGE_KEY)
    return v === null ? true : v === '1'
  })
  const [showSparkline, setShowSparkline] = useState<boolean>(() => readShowSparkline())

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      FLOAT_COL_STORAGE_KEY,
      showFloatColumn ? '1' : '0',
    )
  }, [showFloatColumn])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      COUNTRY_COL_STORAGE_KEY,
      showCountryColumn ? '1' : '0',
    )
  }, [showCountryColumn])

  useEffect(() => {
    writeShowSparkline(showSparkline)
  }, [showSparkline])

  useEffect(() => {
    let cancelled = false
    ipc
      .tradesList()
      .then((list) => {
        if (!cancelled) setTrades(list)
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSaveNote = useCallback(async (input: UpdateNoteInput) => {
    const updated = await ipc.tradeNoteSave(input)
    if (!updated) return
    setTrades((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

  const handleSaveTimeframe = useCallback(async (input: UpdateTimeframeInput) => {
    const updated = await ipc.tradeTimeframeSave(input)
    if (!updated) return
    setTrades((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

  const handleSavePlaybook = useCallback(async (input: SetPlaybookOnTradeInput) => {
    const updated = await ipc.tradePlaybookSave(input)
    if (!updated) return
    setTrades((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

  const handleSaveConfidence = useCallback(async (input: UpdateConfidenceInput) => {
    const updated = await ipc.tradeConfidenceSave(input)
    if (!updated) return
    setTrades((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

  const handleSaveMistakes = useCallback(async (input: UpdateMistakesInput) => {
    const updated = await ipc.tradeMistakesSave(input)
    if (!updated) return
    setTrades((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

  const handleSavePlannedRisk = useCallback(async (input: UpdatePlannedRiskInput) => {
    const updated = await ipc.tradePlannedRiskSave(input)
    if (!updated) return
    setTrades((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

  const handleSavePlannedStopLoss = useCallback(
    async (input: UpdatePlannedStopLossInput) => {
      const updated = await ipc.tradePlannedStopLossSave(input)
      if (!updated) return
      setTrades((prev) =>
        prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
      )
    },
    [],
  )

  const handleSaveFloat = useCallback(async (input: UpdateFloatInput) => {
    const updated = await ipc.tradeFloatSave(input)
    if (!updated) return
    setTrades((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

  const handleSaveCatalyst = useCallback(async (input: UpdateCatalystInput) => {
    const updated = await ipc.tradeCatalystSave(input)
    if (!updated) return
    setTrades((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

  const handleSaveCountry = useCallback(async (input: UpdateCountryInput) => {
    const updated = await ipc.tradeCountrySave(input)
    if (!updated) return
    setTrades((prev) =>
      prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
    )
  }, [])

  // Defer the freeform symbol input so typing stays snappy while filtering
  // 5000+ trades + sparklines. Discrete chips/dates/toggles stay eager.
  const deferredSymbol = useDeferredValue(filters.symbol)
  const effectiveFilters = useMemo(
    () => ({ ...filters, symbol: deferredSymbol }),
    [filters, deferredSymbol],
  )
  const filtered = useMemo(
    () => (trades ? applyTradesFilters(trades, effectiveFilters) : []),
    [trades, effectiveFilters],
  )

  if (err) {
    return (
      <PageShell title="Trades" subtitle="Every round trip you've imported.">
        <ErrorState message={err} />
      </PageShell>
    )
  }

  if (trades === null) {
    return (
      <PageShell title="Trades" subtitle="Every round trip you've imported.">
        <Skeleton className="h-[80px]" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[40px]" />
          ))}
        </div>
      </PageShell>
    )
  }

  if (trades.length === 0) {
    return (
      <PageShell title="Trades" subtitle="Every round trip you've imported.">
        <EmptyState />
      </PageShell>
    )
  }

  const total = trades.length
  const shown = filtered.length
  const winners = filtered.filter((t) => t.net_pnl > 0).length
  const losers = filtered.filter((t) => t.net_pnl < 0).length
  const openCount = filtered.filter((t) => t.is_open).length
  const subtitle = (
    <span>
      {isFiltering(filters) ? (
        <>
          <span className="font-mono text-fg-primary tnum">{int(shown)}</span>{' '}
          <span className="text-fg-muted">of</span>{' '}
          <span className="font-mono text-fg-primary tnum">{int(total)}</span> trades
        </>
      ) : (
        <>
          <span className="font-mono text-fg-primary tnum">{int(total)}</span>{' '}
          round trip{total === 1 ? '' : 's'}
        </>
      )}
      <span className="text-fg-muted"> · </span>
      <span className="font-mono text-win tnum">{int(winners)}</span> won
      <span className="text-fg-muted"> · </span>
      <span className="font-mono text-loss tnum">{int(losers)}</span> lost
      {openCount > 0 && (
        <>
          <span className="text-fg-muted"> · </span>
          <span className="font-mono text-gold tnum">{int(openCount)}</span> open
        </>
      )}
    </span>
  )

  return (
    <PageShell title="Trades" subtitle={subtitle}>
      <div className="space-y-4">
        <QuickFilters filters={filters} onChange={setFilters} />
        <TradesFilters filters={filters} onChange={setFilters} trades={trades} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            View
          </div>
          <div className="flex items-center gap-2">
            {/* Column-visibility toggle. The Float column is off by default
                to keep the table dense — most users only care about it
                during specific symbol research. Preference persists. */}
            <button
              type="button"
              onClick={() => setShowFloatColumn((v) => !v)}
              aria-pressed={showFloatColumn}
 className={`inline-flex h-7 cursor-pointer items-center rounded-md border px-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
                showFloatColumn
                  ? 'border-gold/50 bg-gold/[0.10] text-gold'
                  : 'border-border-subtle bg-bg-2 text-fg-tertiary hover:border-gold/40 hover:text-gold'
              }`}
              title="Show / hide the Float column"
            >
              Float col
            </button>
            <button
              type="button"
              onClick={() => setShowSparkline((v) => !v)}
              aria-pressed={showSparkline}
              className={`inline-flex h-7 cursor-pointer items-center rounded-md border px-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
                showSparkline
                  ? 'border-gold/50 bg-gold/[0.10] text-gold'
                  : 'border-border-subtle bg-bg-2 text-fg-tertiary hover:border-gold/40 hover:text-gold'
              }`}
              title="Show / hide the per-row sparkline mini-chart"
            >
              Sparkline
            </button>
            <TradesViewToggle value={view} onChange={setView} />
          </div>
        </div>

        {filtered.length === 0 ? (
          <NoMatch onClear={() => setFilters(emptyFilters())} />
        ) : view === 'table' ? (
          <TradesTable
            trades={filtered}
            onSaveNote={handleSaveNote}
            onSaveTimeframe={handleSaveTimeframe}
            onSavePlaybook={handleSavePlaybook}
            onSaveConfidence={handleSaveConfidence}
            onSaveMistakes={handleSaveMistakes}
            onSavePlannedRisk={handleSavePlannedRisk}
            onSavePlannedStopLoss={handleSavePlannedStopLoss}
            onSaveFloat={handleSaveFloat}
            onSaveCatalyst={handleSaveCatalyst}
            onSaveCountry={handleSaveCountry}
            showFloatColumn={showFloatColumn}
            showCountryColumn={showCountryColumn}
            showSparkline={showSparkline}
          />
        ) : view === 'charts-large' ? (
          <div className="space-y-3">
            {filtered.map((t) => (
              <TradeChartCard key={t.id} trade={t} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((t) => (
              <TradeChartTile key={t.id} trade={t} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-loss/40 bg-loss-soft p-4 text-sm text-fg-secondary"
    >
      <AlertCircle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-loss" />
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-loss">
          Failed to load trades
        </div>
        <div className="mt-1">{message}</div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="empty-grid rounded-lg border border-border-subtle bg-bg-2 px-6 py-16 text-center">
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-gold/30 bg-gold/[0.06]">
        <ListOrdered size={36} strokeWidth={1.5} className="text-gold" />
      </div>
      <div className="text-lg font-semibold text-fg-primary">
        No trades yet — let's get some in here.
      </div>
      <div className="mx-auto mt-2 max-w-md text-sm text-fg-tertiary">
        Drop a DAS Trader Trades.csv (and optionally a daily summary CSV for fees)
        on the Import page.
      </div>
      <Link
        to="/import"
        className="mt-6 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-gold px-4 text-sm font-semibold text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-gold-hover active:bg-gold-dim"
      >
        <Upload size={14} strokeWidth={2.25} />
        Go to Import
      </Link>
    </div>
  )
}

function NoMatch({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-2 px-6 py-12 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle bg-bg-3">
        <FilterX size={20} strokeWidth={1.75} className="text-fg-tertiary" />
      </div>
      <div className="text-sm font-medium text-fg-primary">
        No trades match these filters.
      </div>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border-subtle bg-bg-3 px-3 text-[10px] font-semibold uppercase tracking-wider text-fg-secondary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
      >
        Clear filters
      </button>
    </div>
  )
}
