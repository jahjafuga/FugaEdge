import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Upload, FilterX, ListOrdered } from 'lucide-react'
import PageShell from '@/components/layout/PageShell'
import Skeleton from '@/components/ui/Skeleton'
import TradesTable from '@/components/trades/TradesTable'
import TradesFilters from '@/components/trades/TradesFilters'
import ColumnsMenu from '@/components/trades/ColumnsMenu'
import {
  applyTradesFilters,
  emptyFilters,
  isFiltering,
  type TradesFilterState,
} from '@/core/trades/tradesFilter'
import QuickFilters from '@/components/trades/QuickFilters'
import TradesViewToggle, { type TradesView } from '@/components/trades/TradesViewToggle'
import TradeChartCard from '@/components/trades/TradeChartCard'
import TradeChartTile from '@/components/trades/TradeChartTile'
import MigrationCollisionsBanner from '@/components/data-health/MigrationCollisionsBanner'
import { ipc } from '@/lib/ipc'
import { useAccountScope } from '@/lib/accountScope'
import { accountIndicatorFor } from '@/core/trades/accountIndicator'
import { int } from '@/lib/format'
import { normalizeIso } from '@/core/country/source'
import { getCountryName, getRegionForCountry } from '@/core/country/regions'
import { isWin, isLoss } from '@/core/classify/outcome'
import type {
  TradeListRow,
  UpdateCatalystInput,
  UpdateConfidenceInput,
  UpdateCountryInput,
  UpdateCountryForSymbolInput,
  UpdateFloatInput,
  UpdateNoteInput,
  UpdatePlannedRiskInput,
  UpdatePlannedStopLossInput,
  UpdateTimeframeInput,
} from '@shared/trades-types'
import type { SetPlaybookOnTradeInput } from '@shared/playbook-types'

import {
  COLUMN_LABELS,
  NUMERIC_COLUMN_IDS,
  readColumnVisibility,
  writeColumnVisibility,
} from '@/lib/prefs/columns'
import { readTradesFilters, writeTradesFilters } from '@/lib/prefs/tradesFilters'
import { withDnaScores } from '@/core/dna/adherence'
import QueryBubble, { Roll } from '@/components/trades/QueryBubble'
import type { ResolverVocabulary } from '@/core/trades/queryResolver'
import type { PlaybookWithStats } from '@shared/playbook-types'
import type { MistakeDef } from '@shared/mistakes-types'
import { useDnaConfig } from '@/lib/useDnaConfig'
import { useCatalystDefs } from '@/lib/useCatalystDefs'

// v0.2.7: the four column-visibility keys and their state/effect pairs are GONE.
// Visibility is TanStack state inside TradesTable, persisted by
// src/lib/prefs/columns.ts, which folds these old keys in on first read. Keeping a
// copy here would be a second source of truth for the same toggles.

export default function Trades() {
  // Multi-account slice — the switcher's scope: the list fetch carries it
  // (re-fetch on change), and under 'all' each row resolves its owning
  // account for the indicator.
  const { scope, accounts } = useAccountScope()
  const [trades, setTrades] = useState<TradeListRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [view, setView] = useState<TradesView>('table')
  // v0.2.7 — filters PERSIST, per account, through the columns.ts idiom. The
  // initialiser reads the current scope so a mount restores what this account
  // was last narrowed to; the effect below re-reads when the scope changes.
  const [filters, setFilters] = useState<TradesFilterState>(() => readTradesFilters(scope))
  // ONE visibility state, owned here because two consumers need it: the table renders
  // by it, and the filter bar offers range inputs only for columns it can see.
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(
    () => readColumnVisibility(),
  )
  // Hiding a column USED to clear its range, to avoid "a filter still narrowing
  // the table from a control the user can no longer see". The reasoning was
  // right and the premise was wrong: the control was never in the table. It is
  // in the filter bar, which has its own visibility and is always on screen.
  // Now that every numeric column carries a range input regardless of what the
  // table is showing, hiding a column orphans nothing — and silently discarding
  // a filter the user set is the larger surprise.
  const onColumnVisibilityChange = useCallback((next: Record<string, boolean>) => {
    setColumnVisibility(next)
    writeColumnVisibility(next)
  }, [])
  // EVERY numeric column, not just the visible ones. rangeValueOf has always
  // handled all of them and applyTradesFilters has always applied them; the
  // only thing missing was somewhere to type the number. Sixteen of the
  // twenty-one are hidden by default, so gating on visibility made float,
  // RVOL, MAE, MFE, R-multiple, hold time and ten more unreachable.
  // Not memo'd on visibility any more — the list is now constant.
  const numericColumns = useMemo(
    () =>
      NUMERIC_COLUMN_IDS.map((id) => ({
        id,
        label: COLUMN_LABELS[id] ?? id,
      })),
    [],
  )

  // Switching accounts loads THAT account's filters. Keyed off the scope only,
  // so it cannot fire on a filter change and clobber what the user just typed.
  const scopeKey = scope === 'all' ? 'all' : scope.accountId
  useEffect(() => {
    setFilters(readTradesFilters(scope))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey])

  useEffect(() => {
    let cancelled = false
    ipc
      .tradesList({ accountScope: scope })
      .then((list) => {
        if (!cancelled) setTrades(list)
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [scope])

  // Per-row account indicator — live ONLY under 'all' (null hides it).
  const accountFor = useCallback(
    (t: TradeListRow) => accountIndicatorFor(scope, accounts, t.account_id),
    [scope, accounts],
  )

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

  // Symptom B — the mistakes picker already made the add/remove IPC call and
  // holds the refreshed row, so this handler only patches it into the list (no
  // second IPC round-trip), mirroring the map-replace of the save handlers above.
  const handleMistakesChange = useCallback((updated: TradeListRow) => {
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

  // Bulk per-symbol manual override: update every loaded row of the ticker
  // in place (the main process wrote them all to source 'manual').
  const handleSaveCountrySymbol = useCallback(async (input: UpdateCountryForSymbolInput) => {
    const changed = await ipc.tradeCountrySaveSymbol(input)
    if (changed <= 0) return
    const iso = normalizeIso(input.country)
    const country_name = iso ? getCountryName(iso) : 'Unknown'
    const region = iso ? getRegionForCountry(iso) : 'Unknown'
    setTrades((prev) =>
      prev
        ? prev.map((t) =>
            t.symbol === input.symbol
              ? { ...t, country: iso, country_name, region, country_source: 'manual' as const }
              : t,
          )
        : prev,
    )
  }, [])

  // v0.2.3 soft-delete: move a live trade to Trash, then drop it from the
  // loaded list so it disappears from the table + stats immediately. The IPC
  // returns void (the lifecycle op doesn't echo a row), so we filter rather
  // than map-replace.
  const handleSoftDelete = useCallback(async (id: number) => {
    await ipc.tradeSoftDelete(id)
    setTrades((prev) => (prev ? prev.filter((t) => t.id !== id) : prev))
  }, [])

  // Restore is dormant in P3 — nothing on the live Trades page can open a
  // deleted trade (the Trash view is P5). Wired for completeness so the modal
  // contract is whole; filters the id out of the live list the same way.
  const handleRestore = useCallback(async (id: number) => {
    await ipc.tradeRestore(id)
    setTrades((prev) => (prev ? prev.filter((t) => t.id !== id) : prev))
  }, [])

  // v0.2.3 P4 — bulk soft-delete. Mirrors handleSoftDelete: the bulk IPC is
  // atomic and returns void, so on success we filter every id out of the
  // loaded list at once. A reject leaves the list untouched (the batch rolled
  // back) and TradesTable retains the selection for retry.
  const handleBulkSoftDelete = useCallback(async (ids: number[]) => {
    await ipc.tradesSoftDeleteBulk(ids)
    const idSet = new Set(ids)
    setTrades((prev) => (prev ? prev.filter((t) => !idSet.has(t.id)) : prev))
  }, [])

  // Phase 2 bulk-retag — the rows STAY in the list (unlike delete); the bulk IPC
  // returns the updated rows with the correct server-joined playbook_name / tier,
  // so we patch them in by id (mirrors the single-save patch at handleSavePlaybook).
  const handleBulkSetPlaybook = useCallback(
    async (ids: number[], playbookId: number | null) => {
      const updated = await ipc.tradesPlaybookSaveBulk({
        trade_ids: ids,
        playbook_id: playbookId,
      })
      const byId = new Map(updated.map((t) => [t.id, t]))
      setTrades((prev) => (prev ? prev.map((t) => byId.get(t.id) ?? t) : prev))
    },
    [],
  )

  // Phase 2 bulk-retag catalyst — like the playbook bulk, the rows STAY; the IPC
  // returns the updated rows so we patch the changed catalyst_type in by id.
  const handleBulkSetCatalyst = useCallback(
    async (ids: number[], catalystType: string | null) => {
      const updated = await ipc.tradesCatalystSaveBulk({
        trade_ids: ids,
        catalyst_type: catalystType,
      })
      const byId = new Map(updated.map((t) => [t.id, t]))
      setTrades((prev) => (prev ? prev.map((t) => byId.get(t.id) ?? t) : prev))
    },
    [],
  )

  // Phase 2 bulk-retag mistakes — Add unions the picked mistakes into every
  // selected trade, Remove strips them (junction keyed by mistake_def_id). Rows
  // STAY; the IPC returns the updated rows so we patch them in by id.
  const handleBulkSetMistakes = useCallback(
    async (ids: number[], mode: 'add' | 'remove', mistakeDefIds: number[]) => {
      const updated = await ipc.tradesMistakesSaveBulk({
        trade_ids: ids,
        mode,
        mistake_def_ids: mistakeDefIds,
      })
      const byId = new Map(updated.map((t) => [t.id, t]))
      setTrades((prev) => (prev ? prev.map((t) => byId.get(t.id) ?? t) : prev))
    },
    [],
  )

  // Defer the freeform symbol input so typing stays snappy while filtering
  // 5000+ trades + sparklines. Discrete chips/dates/toggles stay eager.
  const deferredSymbol = useDeferredValue(filters.symbol)
  const effectiveFilters = useMemo(
    () => ({ ...filters, symbol: deferredSymbol }),
    [filters, deferredSymbol],
  )
  // v0.2.7 — the five-pillar verdicts ride the rows before the filter runs.
  // THE RE-SCORE DEPENDENCY: [trades, dnaConfig, catalystDefs] — a changed
  // scan profile re-fetches on mount and this memo re-derives; the stored ask
  // then matches the NEW profile, which is the point of storing the ask.
  // Until the config resolves the rows go through unscored, which the filter
  // honestly reads as incomplete.
  const { config: dnaConfig } = useDnaConfig()
  const { defs: catalystDefs } = useCatalystDefs()
  const scored = useMemo(
    () => (trades && dnaConfig ? withDnaScores(trades, dnaConfig, catalystDefs) : trades),
    [trades, dnaConfig, catalystDefs],
  )
  // v0.2.7 — the bubble's LIVE CANDIDATE (B1). While a draft exists the table
  // and the header count render IT; the committed state (and the prefs write,
  // which keys off effectiveFilters alone) is untouched until Enter commits.
  const [draftFilters, setDraftFilters] = useState<TradesFilterState | null>(null)
  const filtered = useMemo(
    () => (scored ? applyTradesFilters(scored, draftFilters ?? effectiveFilters) : []),
    [scored, draftFilters, effectiveFilters],
  )

  // The resolver's vocabulary: book-derived lists straight off the loaded
  // trades; def-table lists fetched once at mount (the catalyst defs were
  // already here for the DNA scorer).
  const [playbooks, setPlaybooks] = useState<PlaybookWithStats[]>([])
  const [mistakeDefs, setMistakeDefs] = useState<MistakeDef[]>([])
  useEffect(() => {
    let cancelled = false
    void ipc.playbooksList().then((list) => {
      if (!cancelled) setPlaybooks(list)
    })
    void ipc.mistakeDefsGet().then((list) => {
      if (!cancelled) setMistakeDefs(list)
    })
    return () => {
      cancelled = true
    }
  }, [])
  const vocab = useMemo<ResolverVocabulary>(() => {
    const rows = trades ?? []
    const uniq = (xs: (string | null | undefined)[]) =>
      [...new Set(xs.filter((x): x is string => !!x && x !== 'Unknown'))]
    const countryPairs = new Map<string, string>()
    for (const t of rows) {
      if (t.country) countryPairs.set(t.country, t.country_name)
    }
    return {
      symbols: uniq(rows.map((t) => t.symbol)),
      regions: uniq(rows.map((t) => t.region)),
      countries: [...countryPairs.entries()].map(([iso, name]) => ({ iso, name })),
      sectors: uniq(rows.map((t) => t.sector)),
      industries: uniq(rows.map((t) => t.industry)),
      playbooks: playbooks
        .filter((p) => !p.archived)
        .map((p) => ({ id: p.id, name: p.name, tier: p.tier ?? null })),
      catalystTypes: catalystDefs.map((d) => d.name),
      mistakes: mistakeDefs.map((d) => ({ axis: d.axis, name: d.name })),
    }
  }, [trades, playbooks, mistakeDefs, catalystDefs])

  // PERSIST THE DEFERRED STATE, not the live one. columns.ts writes straight
  // from its change handler because a column toggle is one click; the filter bar
  // has a text input, and writing on every change would serialise the whole
  // state on every keystroke. effectiveFilters already carries the deferred
  // symbol, so React coalesces the burst for us and this writes once it settles.
  useEffect(() => {
    writeTradesFilters(scope, effectiveFilters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, effectiveFilters])

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
  const winners = filtered.filter((t) => isWin(t.net_pnl)).length
  const losers = filtered.filter((t) => isLoss(t.net_pnl)).length
  const openCount = filtered.filter((t) => t.is_open).length
  const subtitle = (
    <span>
      {isFiltering(draftFilters ?? filters) ? (
        <>
          <span className="font-mono text-fg-primary tnum"><Roll text={int(shown)} /></span>{' '}
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
        <MigrationCollisionsBanner />
        <QuickFilters filters={filters} onChange={setFilters} />
        {/* Beat B — filter bar + VIEW strip share ONE premium controls surface
            (card-premium, no glow: the table below carries the gold bloom as the
            hero). TradesFilters is now surface-less; this wrapper supplies the
            surface + padding. The VIEW strip stays here (rendered for every view)
            so the Table/Charts/Grid toggle persists outside the table card. */}
        <div className="card-premium space-y-4 p-4">
          <TradesFilters
            numericColumns={numericColumns} filters={filters} onChange={setFilters} trades={trades} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
              View
            </div>
            {/* gap-3, not gap-2: at the same metric the two controls read as one
                segmented group at 8px. The extra 4px is what says they are separate
                things — a view selector and a menu. */}
            <div className="flex items-center gap-3">
              <TradesViewToggle value={view} onChange={setView} />
              {/* Columns sits with the view switcher: both decide what the table
                  shows, so they belong in the same place. It used to have a band of
                  its own above the table, which cost a strip of vertical space to
                  hold one button. */}
              {view === 'table' && (
                <ColumnsMenu
                  visibility={columnVisibility}
                  onChange={onColumnVisibilityChange}
                />
              )}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <NoMatch onClear={() => setFilters(emptyFilters())} />
        ) : view === 'table' ? (
          <TradesTable
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={onColumnVisibilityChange}
            trades={filtered}
            accountFor={accountFor}
            onSaveNote={handleSaveNote}
            onSaveTimeframe={handleSaveTimeframe}
            onSavePlaybook={handleSavePlaybook}
            onSaveConfidence={handleSaveConfidence}
            onSavePlannedRisk={handleSavePlannedRisk}
            onSavePlannedStopLoss={handleSavePlannedStopLoss}
            onSaveFloat={handleSaveFloat}
            onSaveCatalyst={handleSaveCatalyst}
            onMistakesChange={handleMistakesChange}
            onSaveCountry={handleSaveCountry}
            onSaveCountrySymbol={handleSaveCountrySymbol}
            onSoftDelete={handleSoftDelete}
            onRestore={handleRestore}
            onBulkSoftDelete={handleBulkSoftDelete}
            onBulkSetPlaybook={handleBulkSetPlaybook}
            onBulkSetCatalyst={handleBulkSetCatalyst}
            onBulkSetMistakes={handleBulkSetMistakes}
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
      <QueryBubble
        committed={filters}
        vocab={vocab}
        liveCount={filtered.length}
        onDraft={setDraftFilters}
        onCommit={(next) => {
          setFilters(next)
          setDraftFilters(null)
        }}
      />
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
