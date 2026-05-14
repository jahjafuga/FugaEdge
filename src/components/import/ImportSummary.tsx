import type { FileInfo, PreviewSummary } from '@shared/import-types'
import { int, longDate } from '@/lib/format'

interface ImportSummaryProps {
  files: FileInfo[]
  dateRange: { from: string; to: string } | null
  summary: PreviewSummary
}

export default function ImportSummary({
  files,
  dateRange,
  summary,
}: ImportSummaryProps) {
  const rangeLabel = dateRange
    ? dateRange.from === dateRange.to
      ? longDate(dateRange.from)
      : `${longDate(dateRange.from)} – ${longDate(dateRange.to)}`
    : '—'

  return (
    <div className="rounded-md border border-border bg-panel p-5 space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted">Files</div>
          <ul className="space-y-1.5">
            {files.map((f) => (
              <li key={f.filename} className="flex items-center gap-3 text-sm">
                <FormatPill format={f.format} />
                <span className="font-mono text-text">{f.filename}</span>
                <span className="text-xs text-muted">
                  {f.format === 'executions' ? `${int(f.rowCount)} fills` : null}
                  {f.format === 'daily-summary' ? `${int(f.rowCount)} symbols` : null}
                </span>
                {f.format === 'daily-summary' && f.inferredDate && (
                  <span className="text-xs text-subtle">
                    · {longDate(f.inferredDate)}{' '}
                    {f.filenameDateParsed && (
                      <span className="text-gold/80">(from filename)</span>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">Date range</div>
          <div className="mt-1 font-mono text-sm text-text">{rangeLabel}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-border/60 pt-4">
        <Stat label="Executions" value={summary.totalExecutions} tone="muted" />
        <Stat label="Round trips" value={summary.totalTrips} tone="muted" />
        <Stat label="New" value={summary.newTrips} tone="new" />
        <Stat label="Duplicate" value={summary.duplicateTrips} tone="dup" />
        {summary.openTrips > 0 && (
          <Stat label="Open" value={summary.openTrips} tone="warn" />
        )}
        <span className="mx-2 self-stretch border-l border-border/60" />
        <Stat label="Fee rows" value={summary.totalFeeRows} tone="muted" />
        <Stat label="New fees" value={summary.newFeeRows} tone="new" />
        <Stat label="Replace fees" value={summary.replaceFeeRows} tone="dup" />
      </div>
    </div>
  )
}

function FormatPill({ format }: { format: FileInfo['format'] }) {
  if (format === 'executions') {
    return (
      <span className="rounded bg-win/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-win">
        execs
      </span>
    )
  }
  if (format === 'daily-summary') {
    return (
      <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gold">
        fees
      </span>
    )
  }
  return (
    <span className="rounded bg-red/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-red">
      unknown
    </span>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'new' | 'dup' | 'muted' | 'warn'
}) {
  const color =
    tone === 'new'
      ? 'text-win'
      : tone === 'dup'
        ? 'text-gold'
        : tone === 'warn'
          ? 'text-red'
          : 'text-text'
  return (
    <div className="min-w-[80px]">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-1 font-mono text-lg ${color}`}>{int(value)}</div>
    </div>
  )
}
