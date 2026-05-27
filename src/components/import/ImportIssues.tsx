import { AlertCircle, AlertTriangle, ExternalLink } from 'lucide-react'
import type { ImportIssue } from '@shared/import-types'
import { BROKER_REQUEST_URL, BUG_REPORT_URL } from '@/core/import/import-errors'
import { ipc } from '@/lib/ipc'

// Day 9 — the single renderer for structured import problems. Used by the
// Import preview, the import done-screen, and DropZone (pre-IPC file errors).
// Severity drives colour: error = loss/red, warning = gold. A requestBroker
// issue gets a button that opens the matching prefilled GitHub template via
// shell.openExternal (ipc.openExternal — never window.open from the renderer).

export default function ImportIssues({
  issues,
  onShowGuide,
}: {
  issues: ImportIssue[]
  onShowGuide?: () => void
}) {
  if (issues.length === 0) return null
  return (
    <div className="space-y-2">
      {issues.map((issue, i) => (
        <IssueCard key={`${issue.code}-${i}`} issue={issue} onShowGuide={onShowGuide} />
      ))}
    </div>
  )
}

function IssueCard({ issue, onShowGuide }: { issue: ImportIssue; onShowGuide?: () => void }) {
  const isError = issue.severity === 'error'
  const Icon = isError ? AlertCircle : AlertTriangle
  const tone = isError
    ? 'border-loss/40 bg-loss-soft'
    : 'border-gold/40 bg-gold/[0.06]'
  const accent = isError ? 'text-loss' : 'text-gold'

  // requestKind defaults to 'broker' defensively — but every catalog builder
  // that sets requestBroker also sets requestKind.
  const kind = issue.requestKind ?? 'broker'
  const requestLabel = kind === 'bug' ? 'Report an issue' : 'Request a broker'
  const requestUrl = kind === 'bug' ? BUG_REPORT_URL : BROKER_REQUEST_URL

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-md border p-3 text-sm text-fg-secondary ${tone}`}
    >
      <Icon size={16} strokeWidth={2} className={`mt-0.5 shrink-0 ${accent}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-fg-primary">{issue.message}</span>
          {issue.format && (
            <span className="rounded-sm bg-bg-3 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-fg-tertiary">
              {issue.format}
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-fg-tertiary">{issue.actionable}</div>
        {issue.requestBroker && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => ipc.openExternal(requestUrl)}
              className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border-subtle bg-bg-2 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-fg-secondary transition-colors duration-150 hover:border-gold/50 hover:text-gold"
            >
              <ExternalLink size={11} strokeWidth={2.25} />
              {requestLabel}
            </button>
            {/* Render only when both conditions hold:
                1. caller provided onShowGuide (= modal is reachable from this
                   surface — currently only Import.tsx, not DropZone)
                2. this issue is a broker-kind request (UNKNOWN_FORMAT today;
                   bug-kind issues like COMMIT_FAILED keep the "Report an
                   issue" button only) */}
            {onShowGuide && issue.requestBroker && issue.requestKind === 'broker' && (
              <button
                type="button"
                onClick={onShowGuide}
                className="inline-flex h-7 cursor-pointer items-center rounded-md border border-border-strong bg-bg-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:border-gold/50 hover:text-gold"
              >
                How to export →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
