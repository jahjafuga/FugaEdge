import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import PageShell from '@/components/layout/PageShell'
import BrokerExportGuide from '@/components/import/BrokerExportGuide'
import DropZone from '@/components/import/DropZone'
import ImportSummary from '@/components/import/ImportSummary'
import ImportIssues from '@/components/import/ImportIssues'
import PreviewTable from '@/components/import/PreviewTable'
import FeesPreviewTable from '@/components/import/FeesPreviewTable'
import AccountPickerCard from '@/components/import/AccountPickerCard'
import { ipc } from '@/lib/ipc'
import { int } from '@/lib/format'
import { deriveFeesBannerVariant } from '@/core/import/feesBannerVariant'
import { defaultAccountId } from '@/core/import/account-picker'
import type { Account } from '@shared/accounts-types'
import type { PreviewResult, CommitResult, PreviewInputFile, SourceBroker } from '@shared/import-types'

type Phase =
  | { kind: 'idle' }
  | { kind: 'parsing'; filenames: string[] }
  | { kind: 'preview'; data: PreviewResult; dateOverride: string; inputs: PreviewInputFile[] }
  | { kind: 'committing' }
  | { kind: 'done'; result: CommitResult }
  | { kind: 'error'; message: string }

export default function Import() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [guideOpen, setGuideOpen] = useState(false)

  // Multi-account Beat 3 — the trading-account picker. Loaded once on mount;
  // the DEFAULT account preselects. The engine (Beat 2) resolves the default
  // main-side anyway, so a failed load degrades to identical behavior with
  // the picker hidden.
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    ipc
      .accountsList()
      .then((list) => {
        if (cancelled) return
        setAccounts(list)
        setSelectedAccountId(defaultAccountId(list))
      })
      .catch(() => {
        // Non-blocking — imports still land in the default account.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleFiles = useCallback(
    async (files: { name: string; text?: string; bytes?: Uint8Array }[]) => {
      setPhase({ kind: 'parsing', filenames: files.map((f) => f.name) })
      try {
        const inputs: PreviewInputFile[] = files.map((f) => ({
          filename: f.name,
          text: f.text,
          bytes: f.bytes,
        }))
        const data = await ipc.importPreview(inputs, undefined, selectedAccountId ?? undefined)
        // Seed the date override. A dateless TradeZero summary file must NOT
        // silently default to today — that would stamp the trades with the wrong
        // date and quietly mis-date the journal. When a summary is present and no
        // real date could be inferred, seed EMPTY so the user is FORCED to pick
        // the actual trade date (the button stays disabled until they do — see
        // blockingNeedsDate). Every other batch keeps the inferred-range / today
        // seed unchanged.
        const hasSummary = data.files.some((f) => f.format === 'tradezero_summary')
        const seed =
          data.dateRange?.from ??
          (hasSummary ? '' : new Date().toISOString().slice(0, 10))
        setPhase({ kind: 'preview', data, dateOverride: seed, inputs })
      } catch (e) {
        setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    },
    [selectedAccountId],
  )

  const reset = useCallback(() => setPhase({ kind: 'idle' }), [])

  const commit = useCallback(async () => {
    if (phase.kind !== 'preview') return
    setPhase({ kind: 'committing' })
    try {
      const result = await ipc.importCommit({
        trips: phase.data.trips,
        fees: phase.data.fees,
        feeDateOverride: phase.dateOverride,
        // Beat 3 — the picker's choice; the engine stamps every inserted trip
        // and fee row with it (absent -> default, resolved main-side).
        account_id: selectedAccountId ?? undefined,
      })
      console.log('[renderer commit received]', { at: new Date().toISOString() })
      setPhase({ kind: 'done', result })
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [phase, selectedAccountId])

  // PREVIEW HONESTY (Beat 3) — changing the picker re-annotates the SAME
  // staged files against the chosen account, mirroring handleDateChange's
  // re-preview shape: the duplicate/new badges must tell the truth for the
  // account this import will land in (Beat 2's gate is per-account). The
  // date is re-passed only when a TradeZero summary is present (it bakes the
  // date into trip hashes); keep-current-on-failure.
  const handleAccountChange = useCallback(
    async (id: string) => {
      setSelectedAccountId(id)
      if (phase.kind !== 'preview') return
      const hasSummary = phase.data.files.some((f) => f.format === 'tradezero_summary')
      try {
        const data = await ipc.importPreview(
          phase.inputs,
          hasSummary ? phase.dateOverride || undefined : undefined,
          id,
        )
        setPhase((p) => (p.kind === 'preview' ? { ...p, data } : p))
      } catch (e) {
        console.error('[import] account re-preview failed', e)
      }
    },
    [phase],
  )

  // Re-preview when the date changes for a batch containing a TradeZero summary
  // file: a summary trip bakes the date into its dedup hashes at parse time, so
  // the trips must be REBUILT (not just re-labelled) for the new date. Fee-only
  // files don't need this — their date is applied to fee rows at commit
  // (feeDateOverride) — so for those we just record the date locally.
  const handleDateChange = useCallback(
    async (d: string) => {
      if (phase.kind !== 'preview') return
      const hasSummary = phase.data.files.some((f) => f.format === 'tradezero_summary')
      if (!hasSummary) {
        setPhase({ ...phase, dateOverride: d })
        return
      }
      const inputs = phase.inputs
      setPhase({ ...phase, dateOverride: d })
      try {
        const data = await ipc.importPreview(inputs, d)
        setPhase((p) => (p.kind === 'preview' ? { ...p, data, dateOverride: d } : p))
      } catch (e) {
        // Keep the current preview on a transient re-preview failure; the date
        // input stays so the user can retry.
        console.error('[import] summary re-preview failed', e)
      }
    },
    [phase],
  )

  return (
    <PageShell
      title="Import"
      subtitle="Drop your broker export file(s) — DAS Trader, Webull, Ocean One, TradeZero, Lightspeed, or ThinkorSwim. Imports always append; nothing is overwritten."
    >
      {phase.kind === 'idle' && (
        <div className="space-y-3">
          <DropZone onFiles={handleFiles} />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="cursor-pointer text-xs text-fg-tertiary underline-offset-2 transition-colors duration-150 hover:text-gold hover:underline"
            >
              Need help exporting?
            </button>
          </div>
        </div>
      )}

      {phase.kind === 'parsing' && (
        <div className="card-premium px-6 py-12 text-center text-sm text-fg-tertiary">
          Parsing{' '}
          <span className="font-mono text-fg-secondary">
            {phase.filenames.join(', ')}
          </span>
          …
        </div>
      )}

      {phase.kind === 'preview' && (
        <PreviewPanel
          data={phase.data}
          dateOverride={phase.dateOverride}
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onAccountChange={(id) => void handleAccountChange(id)}
          onDateChange={handleDateChange}
          onCancel={reset}
          onConfirm={commit}
          onShowGuide={() => setGuideOpen(true)}
        />
      )}

      {phase.kind === 'committing' && (
        <div className="flex flex-col items-center justify-center card-premium px-6 py-12 text-center text-sm text-fg-tertiary">
          <Loader2 size={24} strokeWidth={1.75} className="mb-3 animate-spin text-gold/70" />
          Saving to database…
        </div>
      )}

      {phase.kind === 'done' && (
        <DoneView
          result={phase.result}
          onReset={reset}
          onShowGuide={() => setGuideOpen(true)}
        />
      )}

      {phase.kind === 'error' && (
        <div className="space-y-4">
          <div role="alert" className="flex items-start gap-3 rounded-[var(--card-radius)] border border-loss/40 bg-loss-soft p-4 shadow-card text-sm text-fg-secondary">
            <AlertCircle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-loss" />
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-loss">
                Import failed
              </div>
              <div className="mt-1">{phase.message}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border-subtle bg-bg-2 px-3 text-sm text-fg-secondary transition-colors duration-150 hover:border-border hover:text-fg-primary"
          >
            Start over
          </button>
        </div>
      )}

      <BrokerExportGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </PageShell>
  )
}

// Renders the post-commit screen. A backup / commit hard failure comes back
// as an error-severity issue on the result (the IMPORT_COMMIT handler returns
// rather than throws) — so the error surface is gated on result.issues, not
// on a thrown exception reaching the `error` phase.
function DoneView({
  result,
  onReset,
  onShowGuide,
}: {
  result: CommitResult
  onReset: () => void
  onShowGuide: () => void
}) {
  const hardFailed = result.issues.some((i) => i.severity === 'error')

  if (hardFailed) {
    return (
      <div className="space-y-4">
        <ImportIssues issues={result.issues} onShowGuide={onShowGuide} />
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border-subtle bg-bg-2 px-3 text-sm text-fg-secondary transition-colors duration-150 hover:border-border hover:text-fg-primary"
        >
          Start over
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--card-radius)] border border-win/40 bg-win/[0.06] p-5 shadow-card">
        <div className="text-[10px] uppercase tracking-wider text-win">
          Import complete
        </div>
        <div className="mt-2 text-base text-fg-secondary">
          Saved{' '}
          <span className="font-mono text-win">{int(result.insertedTrips)}</span>{' '}
          round trip{result.insertedTrips === 1 ? '' : 's'} and{' '}
          <span className="font-mono text-gold">
            {int(result.insertedFees + result.replacedFees)}
          </span>{' '}
          fee row{result.insertedFees + result.replacedFees === 1 ? '' : 's'}{' '}
          across{' '}
          <span className="font-mono">{result.affectedDates.length}</span>{' '}
          date{result.affectedDates.length === 1 ? '' : 's'}.
          {result.skippedTrips > 0 && (
            <>
              {' '}
              <span className="text-fg-tertiary">
                Skipped {int(result.skippedTrips)} duplicate
                {result.skippedTrips === 1 ? '' : 's'}.
              </span>
            </>
          )}
          {!result.countryApiKeyMissing && result.countriesUnknown > 0 && (
            <>
              {' '}
              <span className="text-fg-tertiary">
                <span className="font-mono">{int(result.countriesUnknown)}</span>{' '}
                ticker{result.countriesUnknown === 1 ? '' : 's'} couldn&apos;t
                auto-detect country — run Backfill in Settings.
              </span>
            </>
          )}
        </div>
      </div>
      {result.issues.length > 0 && (
        <ImportIssues issues={result.issues} onShowGuide={onShowGuide} />
      )}
      <button
        type="button"
        onClick={onReset}
        className="inline-flex h-9 cursor-pointer items-center rounded-md bg-gold px-4 text-sm font-semibold text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-gold-hover active:bg-gold-dim"
      >
        Import another
      </button>
    </div>
  )
}

function PreviewPanel({
  data,
  dateOverride,
  accounts,
  selectedAccountId,
  onAccountChange,
  onDateChange,
  onCancel,
  onConfirm,
  onShowGuide,
}: {
  data: PreviewResult
  dateOverride: string
  accounts: Account[]
  selectedAccountId: string | null
  onAccountChange: (id: string) => void
  onDateChange: (d: string) => void
  onCancel: () => void
  onConfirm: () => void
  onShowGuide: () => void
}) {
  // The per-batch account picker (Beat 3) drives PREVIEW HONESTY via
  // onAccountChange. Sim-unlock audit fix beat 3: the sim block retired —
  // practice imports flow like any other; the read-layer walls (4703a10)
  // keep them out of real-money stats.
  const hasUsableContent =
    data.summary.newTrips > 0 || data.summary.newFeeRows > 0 || data.summary.replaceFeeRows > 0
  const blockingNeedsDate = data.needsDate && !dateOverride

  const feesBannerBrokers = data.trips
    .map((t) => t.source_broker)
    .filter((b): b is SourceBroker => Boolean(b))
  const feesBannerVariant = deriveFeesBannerVariant(feesBannerBrokers)

  return (
    <div className="space-y-5">
      <ImportSummary files={data.files} dateRange={data.dateRange} summary={data.summary} />

      {data.needsDate && (
        <div className="flex items-end gap-4 rounded-[var(--card-radius)] border border-gold/40 bg-gold/[0.05] p-4">
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-wider text-gold">
              Date required
            </div>
            <div className="mt-1 text-sm text-fg-secondary">
              A summary file in this batch has no date. Pick the trade date so the
              imported rows are dated correctly.
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">
              Trade date
            </div>
            <input
              type="date"
              value={dateOverride}
              onChange={(e) => onDateChange(e.target.value)}
              className="mt-1 rounded border border-border bg-bg px-2 py-1 font-mono text-sm text-fg-secondary outline-none focus:border-gold"
            />
          </div>
        </div>
      )}

      {data.feesUnavailable && (
        <div
          className="rounded-[var(--card-radius)] border border-gold/30 bg-gold/[0.04] p-4 text-sm text-fg-secondary"
          role="status"
        >
          <div className="text-[10px] uppercase tracking-wider text-gold">
            Fees not included
          </div>
          <div className="mt-1">
            {feesBannerVariant === 'das' ? (
              <>
                This import has no fee data. Drop your DAS{' '}
                <span className="font-mono">Account Report</span> CSV alongside your
                trades to capture per-round-trip fees, or proceed without — trips save
                with fees marked &ldquo;not reported&rdquo;.
              </>
            ) : feesBannerVariant === 'thinkorswim' ? (
              <>
                ThinkorSwim&rsquo;s export doesn&rsquo;t include commissions or fees, so
                there&rsquo;s no fee data to capture. Your trips import fully and save
                with fees marked &ldquo;not reported&rdquo;.
              </>
            ) : (
              <>
                This import doesn&rsquo;t include fee data. Your trips import fully and
                save with fees marked &ldquo;not reported&rdquo;.
              </>
            )}
          </div>
        </div>
      )}

      {data.issues.length > 0 && (
        <ImportIssues issues={data.issues} onShowGuide={onShowGuide} />
      )}

      {data.trips.length > 0 && <PreviewTable trips={data.trips} />}
      {data.fees.length > 0 && (
        <FeesPreviewTable fees={data.fees} dateOverride={dateOverride} />
      )}

      {accounts.length > 0 && (
        <AccountPickerCard
          accounts={accounts}
          value={selectedAccountId}
          onChange={onAccountChange}
        />
      )}

      {/* Sticky so Cancel + the primary action stay visible regardless of
          how far the preview content scrolls — on laptop screens the bar
          otherwise falls below the fold. */}
      <div className="sticky bottom-0 z-10 flex items-center justify-between card-premium px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border bg-transparent px-4 py-2 text-sm text-fg-tertiary transition-colors duration-150 hover:border-border-strong hover:text-fg-primary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!hasUsableContent || blockingNeedsDate}
          className="inline-flex h-9 cursor-pointer items-center rounded-md bg-gold px-4 text-sm font-semibold text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-gold-hover active:bg-gold-dim disabled:cursor-not-allowed disabled:opacity-40"
        >
          {blockingNeedsDate
            ? 'Pick a date to continue'
            : !hasUsableContent
              ? 'Nothing new to import'
              : confirmLabel(data)}
        </button>
      </div>
    </div>
  )
}

function confirmLabel(d: PreviewResult): string {
  const parts: string[] = []
  if (d.summary.newTrips > 0) {
    parts.push(`${d.summary.newTrips} round trip${d.summary.newTrips === 1 ? '' : 's'}`)
  }
  const feeCount = d.summary.newFeeRows + d.summary.replaceFeeRows
  if (feeCount > 0) {
    parts.push(`${feeCount} fee row${feeCount === 1 ? '' : 's'}`)
  }
  return `Import ${parts.join(' + ')}`
}
