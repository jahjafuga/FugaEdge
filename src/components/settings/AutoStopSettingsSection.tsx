import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import { ipc } from '@/lib/ipc'
import { isValidStopPct } from '@/core/trades/autoStop'
import type { SettingsValues } from '@shared/settings-types'

// v0.2.7 Feature 3 — auto-fill stop price.
//
// SELF-CONTAINED + RELOCATABLE (the DnaSettingsSection precedent): this section owns
// its OWN load (ipc.settingsGet) and its OWN save (ipc.settingsSave with ONLY the two
// autofill_stop_* keys). It does not touch the Settings page's shared editor.
//
// It is also the feature's ONLY entry point, which is the part that matters. The
// previous feature shipped an engine no control could reach; T17 asserts each of
// these three controls fires its operation, and T22 asserts no fourth operation can
// be added to the engine without one.
//
// Renderer UI + IPC only — no DB access, and no derivation either. Which rows change
// is decided in src/core/trades/autoStop.ts against the settings the main process
// reads for itself, so this card never has a stale copy of anything.

type AutoStopConfig = Pick<SettingsValues, 'autofill_stop_enabled' | 'autofill_stop_pct'>

const pickAutoStop = (v: SettingsValues): AutoStopConfig => ({
  autofill_stop_enabled: v.autofill_stop_enabled,
  autofill_stop_pct: v.autofill_stop_pct,
})

export default function AutoStopSettingsSection() {
  const [editor, setEditor] = useState<AutoStopConfig | null>(null)
  const [snapshot, setSnapshot] = useState<AutoStopConfig | null>(null)
  const [pctText, setPctText] = useState('')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ipc
      .settingsGet()
      .then((p) => {
        if (cancelled) return
        const cfg = pickAutoStop(p.values)
        setEditor(cfg)
        setSnapshot(cfg)
        setPctText(String(cfg.autofill_stop_pct))
      })
      .catch((e: Error) => !cancelled && setErr(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  const dirty =
    editor !== null &&
    snapshot !== null &&
    (editor.autofill_stop_enabled !== snapshot.autofill_stop_enabled ||
      editor.autofill_stop_pct !== snapshot.autofill_stop_pct)

  const onPct = (raw: string) => {
    setPctText(raw)
    const n = Number(raw)
    // An unusable percentage simply does not move the value: the save button stays
    // pointed at the last good number rather than storing something that would make
    // every derived R meaningless. isValidStopPct is the engine's own predicate.
    if (isValidStopPct(n)) {
      setEditor((prev) => (prev ? { ...prev, autofill_stop_pct: n } : prev))
    }
  }

  /** Which operation a save implies. Turning the feature ON fills what is empty;
   *  changing the percentage while it is on re-derives what the app already wrote.
   *  Turning it OFF runs nothing — off means stop deriving, not delete. */
  const opForSave = (before: AutoStopConfig, after: AutoStopConfig) => {
    if (!before.autofill_stop_enabled && after.autofill_stop_enabled) return 'apply' as const
    if (after.autofill_stop_enabled && after.autofill_stop_pct !== before.autofill_stop_pct) {
      return 'rederive' as const
    }
    return null
  }

  const handleSave = async () => {
    if (saving || !editor || !snapshot) return
    setSaving(true)
    setErr(null)
    setStatus(null)
    try {
      const updated = await ipc.settingsSave(editor)
      const cfg = pickAutoStop(updated.values)
      const op = opForSave(snapshot, cfg)
      setEditor(cfg)
      setSnapshot(cfg)
      setPctText(String(cfg.autofill_stop_pct))
      if (op) {
        const r = await ipc.autoStopRun(op)
        setStatus(
          op === 'apply'
            ? `Filled ${r.changed} stop${r.changed === 1 ? '' : 's'}.`
            : `Re-derived ${r.changed} stop${r.changed === 1 ? '' : 's'}.`,
        )
      } else {
        setStatus('Saved')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  // Deliberately NOT gated on the toggle. Clearing is the undo, and the moment a
  // user is most likely to want it is right after switching the feature off.
  const handleClear = async () => {
    if (busy) return
    setBusy(true)
    setErr(null)
    setStatus(null)
    try {
      const r = await ipc.autoStopRun('clear')
      setStatus(`Cleared ${r.changed} auto-filled stop${r.changed === 1 ? '' : 's'}.`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title="Auto-fill stop price"
      subtitle="Derive a planned stop from the first entry when a trade arrives without one, so R has a denominator."
    >
      {!editor ? (
        <div className="skeleton h-[160px]" />
      ) : (
        <div className="space-y-5">
          <label className="flex items-center gap-2 text-xs text-fg-secondary">
            <input
              type="checkbox"
              checked={editor.autofill_stop_enabled}
              onChange={(e) =>
                setEditor((prev) =>
                  prev ? { ...prev, autofill_stop_enabled: e.target.checked } : prev,
                )
              }
              className="accent-gold"
            />
            Fill a stop when a trade has none
          </label>

          <div>
            <label
              className="mb-1 block text-[10px] uppercase tracking-wider text-fg-tertiary"
              htmlFor="autofill-stop-pct"
            >
              Percent off the first entry
            </label>
            <div className="flex items-center gap-2">
              <input
                id="autofill-stop-pct"
                type="number"
                step="0.1"
                min="0.1"
                max="99.9"
                value={pctText}
                onChange={(e) => onPct(e.target.value)}
                className="w-28 rounded-md border border-border-subtle bg-bg-1 px-2 py-1 text-sm text-fg-primary"
              />
              <span className="text-xs text-fg-tertiary">%</span>
            </div>
            <p className="mt-1 text-[11px] text-fg-tertiary">
              The FIRST entry fill, not the average — a trade that adds on the way up
              was never risking its average price. Longs stop below, shorts above.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="rounded-md border border-border-strong bg-bg-1 px-4 py-2 text-sm text-fg-primary transition-colors duration-150 hover:bg-bg-0 hover:border-gold/60 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={busy}
              title="Removes every stop this app derived, whether the setting is on or off. Stops you typed are untouched."
              className="rounded-md border border-border-subtle bg-bg-1 px-4 py-2 text-sm text-fg-secondary transition-colors duration-150 hover:border-loss/60 hover:text-loss disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Clearing…' : 'Clear auto-filled stops'}
            </button>
            {status && <span className="text-xs text-fg-tertiary">{status}</span>}
            {err && <span className="text-xs text-loss">{err}</span>}
          </div>

          <p className="text-[11px] text-fg-tertiary">
            A stop you typed is never overwritten or cleared by any of this. Every
            bulk change takes a database backup first. Turning the setting off stops
            new stops being derived; it does not remove the ones already derived —
            that is what Clear is for, and it works either way.
          </p>
        </div>
      )}
    </Card>
  )
}
