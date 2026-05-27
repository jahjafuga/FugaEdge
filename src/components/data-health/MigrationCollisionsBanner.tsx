import { useEffect, useState } from 'react'
import { AlertCircle, X } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import { int } from '@/lib/format'
import type { DataHealth } from '@shared/data-health-types'

// One-time banner for v0.2.1 content_hash migration's historical-duplicate
// detection. Shows when the migration found pre-existing duplicates in the
// user's DB (the v0.1.6 exec_hash dedup let them through because the same
// logical fill carried different per-fill IDs across export formats). The
// migration is non-destructive — both rows stay in the DB; the user needs
// to know they have homework so their P&L stats aren't silently double-
// counted. Persists across launches until the user dismisses.
//
// Renders nothing when:
//   - collision count is 0 (the common case — migration ran cleanly), OR
//   - the user has already dismissed (acknowledged stored in settings)
//
// Trade IDs of the affected rows are not surfaced here — they're in the
// console log from the migration (userData/logs/main.log). Surfacing
// per-trade actions is v0.3.0 work (the "Settings → Data Health" page
// the v0.2.1 plan deferred).

export default function MigrationCollisionsBanner() {
  const [health, setHealth] = useState<DataHealth | null>(null)
  const [dismissing, setDismissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    ipc
      .dataHealthGet()
      .then((h) => {
        if (!cancelled) setHealth(h)
      })
      .catch(() => {
        // Failure is non-fatal — banner just doesn't render. The migration
        // data itself is safe.
        if (!cancelled) setHealth(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (
    health == null ||
    health.contentHashMigrationCollisions === 0 ||
    health.contentHashMigrationCollisionsAcknowledged
  ) {
    return null
  }

  const dismiss = async () => {
    setDismissing(true)
    try {
      const next = await ipc.dataHealthAcknowledgeCollisions()
      setHealth(next)
    } catch {
      // Roll back the disabled state if the IPC failed so the user can
      // retry the click. We don't surface a toast — silent retry is
      // gentler for a one-time banner.
      setDismissing(false)
    }
  }

  const n = health.contentHashMigrationCollisions
  return (
    <div className="rounded-md border border-gold/40 bg-gold/[0.06] px-4 py-3">
      <div className="flex items-start gap-3">
        <AlertCircle
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-gold"
        />
        <div className="flex-1 text-sm text-fg-primary">
          <div className="font-semibold text-gold">
            Migration complete — review {int(n)} potential duplicate
            {n === 1 ? '' : 's'}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-fg-secondary">
            v0.2.1's new dedup found{' '}
            <span className="font-mono text-fg-primary tnum">{int(n)}</span>{' '}
            trade row{n === 1 ? '' : 's'} from previous imports that look like
            duplicate{n === 1 ? '' : 's'} of older row{n === 1 ? '' : 's'} in
            your journal. The migration kept both — your historical data is
            untouched — but they may be double-counting in your P&amp;L. Check
            the affected trade IDs in the app log file
            (Help → Open log folder) and remove duplicates manually from the
            trade detail view.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          disabled={dismissing}
          aria-label="Dismiss"
          title="Dismiss"
          className="shrink-0 rounded p-1 text-fg-tertiary transition-colors duration-150 hover:bg-white/[0.06] hover:text-fg-primary disabled:opacity-50"
        >
          <X size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
