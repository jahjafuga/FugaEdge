import { useCallback, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import PageShell from '@/components/layout/PageShell'
import BrokerExportGuide from '@/components/import/BrokerExportGuide'
import DropZone from '@/components/import/DropZone'
import ImportSummary from '@/components/import/ImportSummary'
import ImportIssues from '@/components/import/ImportIssues'
import PreviewTable from '@/components/import/PreviewTable'
import FeesPreviewTable from '@/components/import/FeesPreviewTable'
import { ipc } from '@/lib/ipc'
import { int } from '@/lib/format'
import type { PreviewResult, CommitResult } from '@shared/import-types'

type Phase =
  | { kind: 'idle' }
  | { kind: 'parsing'; filenames: string[] }
  | { kind: 'preview'; data: PreviewResult; dateOverride: string }
  | { kind: 'committing' }
  | { kind: 'done'; result: CommitResult }
  | { kind: 'error'; message: string }

export default function Import() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [guideOpen, setGuideOpen] = useState(false)

  const handleFiles = useCallback(
    async (files: { name: string; text?: string; bytes?: Uint8Array }[]) => {
      setPhase({ kind: 'parsing', filenames: files.map((f) => f.name) })
      try {
        const data = await ipc.importPreview(
          files.map((f) => ({ filename: f.name, text: f.text, bytes: f.bytes })),
        )
        // Seed date override with the inferred range start, or today.
        const seed =
          data.dateRange?.from ?? new Date().toISOString().slice(0, 10)
        setPhase({ kind: 'preview', data, dateOverride: seed })
      } catch (e) {
        setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    },
    [],
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
      })
      console.log('[renderer commit received]', { at: new Date().toISOString() })
      setPhase({ kind: 'done', result })
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [phase])

  return (
    <PageShell
      title="Import"
      subtitle="Drop your broker export file(s) — DAS Trader, Webull, Ocean One, or TradeZero. Imports always append; nothing is overwritten."
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
        <div className="rounded-md border border-border bg-panel px-6 py-12 text-center text-sm text-subtle">
          Parsing{' '}
          <span className="font-mono text-text">
            {phase.filenames.join(', ')}
          </span>
          …
        </div>
      )}

      {phase.kind === 'preview' && (
        <PreviewPanel
          data={phase.data}
          dateOverride={phase.dateOverride}
          onDateChange={(d) => setPhase({ ...phase, dateOverride: d })}
          onCancel={reset}
          onConfirm={commit}
          onShowGuide={() => setGuideOpen(true)}
        />
      )}

      {phase.kind === 'committing' && (
        <div className="flex flex-col items-center justify-center rounded-md border border-border bg-panel px-6 py-12 text-center text-sm text-subtle">
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
          <div role="alert" className="flex items-start gap-3 rounded-lg border border-loss/40 bg-loss-soft p-4 text-sm text-fg-secondary">
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
      <div className="rounded-md border border-win/40 bg-win/[0.06] p-5">
        <div className="text-[10px] uppercase tracking-wider text-win">
          Import complete
        </div>
        <div className="mt-2 text-base text-text">
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
              <span className="text-subtle">
                Skipped {int(result.skippedTrips)} duplicate
                {result.skippedTrips === 1 ? '' : 's'}.
              </span>
            </>
          )}
          {!result.countryApiKeyMissing && result.countriesUnknown > 0 && (
            <>
              {' '}
              <span className="text-subtle">
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
  onDateChange,
  onCancel,
  onConfirm,
  onShowGuide,
}: {
  data: PreviewResult
  dateOverride: string
  onDateChange: (d: string) => void
  onCancel: () => void
  onConfirm: () => void
  onShowGuide: () => void
}) {
  // Per-batch UI gate (Track C / Decision 11). v0.2.0 disables Import on
  // 'paper' so the value never reaches IPC — the toggle's only effect is
  // the button cascade below. v0.3.0 ticket [[paper-account-import-and-filtering]]
  // wires this end-to-end once the aggregation paths can filter paper trades
  // out of real-account stats.
  const [accountType, setAccountType] = useState<'real' | 'paper'>('real')

  const hasUsableContent =
    data.summary.newTrips > 0 || data.summary.newFeeRows > 0 || data.summary.replaceFeeRows > 0
  const blockingNeedsDate = data.needsDate && !dateOverride
  const blockedByPaper = accountType === 'paper'

  return (
    <div className="space-y-5">
      <ImportSummary files={data.files} dateRange={data.dateRange} summary={data.summary} />

      {data.needsDate && (
        <div className="flex items-end gap-4 rounded-md border border-gold/40 bg-gold/[0.05] p-4">
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-wider text-gold">
              Date required
            </div>
            <div className="mt-1 text-sm text-fg-secondary">
              A daily summary file in this batch has no date in its filename. Pick the
              trade date so fees can be matched to the right round trips.
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted">
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
          className="rounded-md border border-gold/30 bg-gold/[0.04] p-4 text-sm text-fg-secondary"
          role="status"
        >
          <div className="text-[10px] uppercase tracking-wider text-gold">
            Fees not included
          </div>
          <div className="mt-1">
            This import has no fee data. Drop your DAS{' '}
            <span className="font-mono">Account Report</span> CSV alongside this file
            to capture per-round-trip fees, or proceed without — trips will save with
            fees marked &ldquo;not reported&rdquo;.
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

      <div className="rounded-md border border-border/60 bg-bg-3 px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">
          Account type
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-secondary">
            <input
              type="radio"
              name="account-type"
              value="real"
              checked={accountType === 'real'}
              onChange={() => setAccountType('real')}
              className="accent-gold"
            />
            Real account
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-secondary">
            <input
              type="radio"
              name="account-type"
              value="paper"
              checked={accountType === 'paper'}
              onChange={() => setAccountType('paper')}
              className="accent-gold"
            />
            Paper / simulated
          </label>
        </div>
        {blockedByPaper && (
          <p className="mt-3 text-xs text-fg-tertiary">
            Paper-account imports arrive in v0.3.0 — they&rsquo;ll be tracked
            separately from your real-account stats.
          </p>
        )}
      </div>

      {/* Sticky so Cancel + the primary action stay visible regardless of
          how far the preview content scrolls — on laptop screens the bar
          otherwise falls below the fold. */}
      <div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-border/60 bg-bg-0 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border bg-transparent px-4 py-2 text-sm text-subtle transition-colors duration-150 hover:border-muted hover:text-text"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!hasUsableContent || blockingNeedsDate || blockedByPaper}
          className="inline-flex h-9 cursor-pointer items-center rounded-md bg-gold px-4 text-sm font-semibold text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-gold-hover active:bg-gold-dim disabled:cursor-not-allowed disabled:opacity-40"
        >
          {!hasUsableContent
            ? 'Nothing new to import'
            : blockingNeedsDate
              ? 'Pick a date to continue'
              : blockedByPaper
                ? 'Paper imports arrive in v0.3.0'
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
