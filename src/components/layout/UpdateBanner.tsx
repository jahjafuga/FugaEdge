import { useEffect, useState } from 'react'
import { Download, RotateCcw, X } from 'lucide-react'
import { ipc, type UpdaterStatus } from '@/lib/ipc'

// UPDATE BANNER
//
// Renders only when the main-process auto-updater reports a downloaded
// (ready-to-install) update, an in-progress download, or an error.
// In dev / unpackaged launches the updater is a no-op so this stays
// silent. Pure presentational — all the auto-update side effects are
// handled in /electron/updater.

const DISMISS_STORAGE_KEY = 'fugaedge-update-banner-dismissed-version'

export default function UpdateBanner() {
  const [status, setStatus] = useState<UpdaterStatus>({ state: 'idle' })
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(DISMISS_STORAGE_KEY)
  })

  useEffect(() => {
    let active = true
    ipc.updaterGetStatus().then((s) => {
      if (active) setStatus(s as UpdaterStatus)
    })
    const off = ipc.updaterOnStatus((s) => {
      if (active) setStatus(s)
    })
    return () => {
      active = false
      off()
    }
  }, [])

  // Visible states: downloading, downloaded, error. Idle / checking /
  // not-available / available stay silent until the download finishes
  // (download is automatic; we don't ask the user before it starts).
  const visible =
    (status.state === 'downloaded' && status.version !== dismissedVersion) ||
    status.state === 'downloading' ||
    status.state === 'error'
  if (!visible) return null

  return (
    <div
      role="status"
      className="border-b border-gold/30 bg-gold/[0.08] px-4 py-2 text-xs text-fg-secondary"
    >
      <div className="mx-auto flex max-w-screen-xl items-center gap-3">
        {status.state === 'downloading' && (
          <>
            <Download size={13} strokeWidth={2} className="text-gold" />
            <span>
              Downloading update {status.version ?? ''}…{' '}
              {status.progress != null ? `${status.progress}%` : ''}
            </span>
          </>
        )}
        {status.state === 'downloaded' && (
          <>
            <Download size={13} strokeWidth={2} className="text-gold" />
            <span className="flex-1">
              Update <span className="font-mono text-gold">{status.version}</span>{' '}
              ready — restart FugaEdge to apply.
            </span>
            <button
              type="button"
              onClick={() => ipc.updaterQuitAndInstall()}
              className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-gold px-2.5 text-[10px] font-semibold uppercase tracking-wider text-accent-ink transition-colors duration-150 hover:bg-gold-hover"
            >
              <RotateCcw size={11} strokeWidth={2.25} />
              Restart now
            </button>
            <button
              type="button"
              onClick={() => {
                if (status.version) {
                  window.localStorage.setItem(DISMISS_STORAGE_KEY, status.version)
                  setDismissedVersion(status.version)
                }
              }}
              aria-label="Dismiss until next launch"
              title="Dismiss until next launch"
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border-strong bg-bg-1 text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
            >
              <X size={11} strokeWidth={2.25} />
            </button>
          </>
        )}
        {status.state === 'error' && (
          <span className="text-loss">
            Update check failed: {status.error ?? 'unknown error'}
          </span>
        )}
      </div>
    </div>
  )
}
