import { useState } from 'react'
import { ArrowUpRight, Download, KeyRound } from 'lucide-react'
import BrandMark from '@/components/layout/BrandMark'
import { ipc } from '@/lib/ipc'
import { verifyActivationKey } from '@/core/activation/verify'
import {
  ACTIVATION_STRINGS as S,
  REQUEST_ACCESS_URL,
} from '@/core/activation/strings'
import type { ExportResult } from '@shared/settings-types'

// v0.2.5 §C — the activation wall. Mounted by AppLayout AHEAD of onboarding
// (same overlay-exclusivity convention as OnboardingModal / ProductTour).
// Two modes share the card:
//   'gate'   — fresh install (or grace-mode voluntary open): key entry only.
//   'locked' — grace expired: key entry PLUS the three working export
//              actions (R1). The gate gates the app, never the data —
//              app-wide read-only is explicitly out of scope.

interface ActivationScreenProps {
  mode: 'gate' | 'locked'
  /** Present only when opened voluntarily from the grace banner — renders a
   *  "Not now" dismiss. The hard gate/locked mounts omit it. */
  onDismiss?: () => void
  /** Fired after a key verifies AND persists. Parent flips to activated. */
  onActivated: () => void
}

type ExportKind = 'trades' | 'journal' | 'database'

export default function ActivationScreen({
  mode,
  onDismiss,
  onActivated,
}: ActivationScreenProps) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [exporting, setExporting] = useState<ExportKind | null>(null)
  const [exportLine, setExportLine] = useState<string | null>(null)

  const handleActivate = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const trimmed = key.trim()
      const result = await verifyActivationKey(trimmed)
      if (!result.ok) {
        setError(S.errors[result.reason])
        return
      }
      try {
        await ipc.settingsSave({
          activation_key: trimmed,
          activation_payload: JSON.stringify(result.payload),
        })
      } catch {
        setError(S.saveFailed)
        return
      }
      onActivated()
    } finally {
      setBusy(false)
    }
  }

  const runExport = async (kind: ExportKind) => {
    if (exporting) return
    setExporting(kind)
    setExportLine(null)
    try {
      const result: ExportResult =
        kind === 'trades'
          ? await ipc.exportTrades()
          : kind === 'journal'
            ? await ipc.exportJournal()
            : await ipc.exportDatabase()
      if (!result.canceled && result.path) {
        setExportLine(S.exportSaved(result.path))
      }
    } catch (e) {
      setExportLine(S.exportFailed(e instanceof Error ? e.message : String(e)))
    } finally {
      setExporting(null)
    }
  }

  const locked = mode === 'locked'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={locked ? S.lockedTitle : S.title}
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-bg-0 px-6 py-10"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-bg-1 p-8 shadow-lg">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-gold/30 bg-gold/[0.06]">
            <BrandMark variant="mark" className="h-10 w-10" />
          </div>
          <div className="text-lg font-semibold text-fg-primary">
            {locked ? S.lockedTitle : S.title}
          </div>
          <p className="mt-2 text-sm text-fg-tertiary">
            {locked ? S.lockedBody : S.pitch}
          </p>
        </div>

        <div className="mt-6">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            {S.inputLabel}
          </label>
          <input
            type="text"
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleActivate()
            }}
            placeholder={S.inputPlaceholder}
            spellCheck={false}
            autoFocus
            className="mt-1 w-full rounded-md border border-border-strong bg-bg-0 px-3 py-2 font-mono text-sm text-fg-primary placeholder:text-fg-tertiary outline-none transition-colors duration-150 focus:border-gold"
          />
          {error && (
            <div role="alert" className="mt-2 text-xs text-loss">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleActivate()}
            disabled={busy || key.trim() === ''}
            className="mt-3 inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-gold text-sm font-semibold text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-gold-hover active:bg-gold-dim disabled:cursor-not-allowed disabled:opacity-40"
          >
            <KeyRound size={14} strokeWidth={2.25} />
            {busy ? S.activating : S.activate}
          </button>

          <div className="mt-3 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => void ipc.openExternal(REQUEST_ACCESS_URL)}
              className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-fg-tertiary transition-colors duration-150 hover:text-gold"
            >
              {S.requestAccess}
              <ArrowUpRight size={12} strokeWidth={2.25} />
            </button>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="cursor-pointer text-xs text-fg-tertiary transition-colors duration-150 hover:text-fg-secondary"
              >
                {S.notNow}
              </button>
            )}
          </div>
        </div>

        {locked && (
          <div className="mt-7 border-t border-border-subtle pt-5">
            <div className="text-xs text-fg-secondary">{S.dataYours}</div>
            <div className="mt-3 flex flex-col gap-2">
              <ExportButton
                label={S.exportTrades}
                busy={exporting === 'trades'}
                disabled={exporting !== null}
                onClick={() => void runExport('trades')}
              />
              <ExportButton
                label={S.exportJournal}
                busy={exporting === 'journal'}
                disabled={exporting !== null}
                onClick={() => void runExport('journal')}
              />
              <ExportButton
                label={S.exportBackup}
                busy={exporting === 'database'}
                disabled={exporting !== null}
                onClick={() => void runExport('database')}
              />
            </div>
            {exportLine && (
              <div className="mt-2 break-all font-mono text-[11px] text-fg-tertiary">
                {exportLine}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ExportButton({
  label,
  busy,
  disabled,
  onClick,
}: {
  label: string
  busy: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border-strong bg-bg-1 px-3 text-sm text-fg-primary transition-colors duration-150 hover:bg-bg-0 hover:border-gold/60 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Download size={14} strokeWidth={2} />
      {busy ? `${label}…` : label}
    </button>
  )
}
