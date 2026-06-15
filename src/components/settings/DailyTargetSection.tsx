import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import { ipc } from '@/lib/ipc'
import type { SettingsValues } from '@shared/settings-types'

// v0.2.5 — Daily profit target. SELF-CONTAINED + RELOCATABLE (the
// DnaSettingsSection precedent): owns its OWN load (ipc.settingsGet) and OWN
// save (ipc.settingsSave with ONLY the daily_profit_target key). Does NOT touch
// the Settings page's shared editor or max_daily_loss's existing handling.
// DISTINCT from the Profile "Goals" feature — this is one per-day net-P&L
// target, no XP. Renderer UI + IPC only — no DB access here (ARCHITECTURE #1).

// The one key this section loads + saves — a subset of SettingsValues.
type DailyTargetConfig = Pick<SettingsValues, 'daily_profit_target'>

const DAILY_TARGET_KEYS = ['daily_profit_target'] as const

const pickDailyTarget = (v: SettingsValues): DailyTargetConfig => ({
  daily_profit_target: v.daily_profit_target,
})

const dailyTargetEqual = (a: DailyTargetConfig, b: DailyTargetConfig): boolean =>
  DAILY_TARGET_KEYS.every((k) => a[k] === b[k])

export default function DailyTargetSection() {
  const [editor, setEditor] = useState<DailyTargetConfig | null>(null)
  const [snapshot, setSnapshot] = useState<DailyTargetConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ipc
      .settingsGet()
      .then((p) => {
        if (cancelled) return
        const dt = pickDailyTarget(p.values)
        setEditor(dt)
        setSnapshot(dt)
      })
      .catch((e: Error) => !cancelled && setErr(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  const set = (patch: Partial<DailyTargetConfig>) =>
    setEditor((prev) => (prev ? { ...prev, ...patch } : prev))

  const dirty =
    editor !== null && snapshot !== null && !dailyTargetEqual(editor, snapshot)

  const handleSave = async () => {
    if (saving || !editor) return
    setSaving(true)
    setErr(null)
    try {
      // Send ONLY the daily_profit_target key — DailyTargetConfig is a subset of
      // SettingsUpdate, so nothing else on the page is touched.
      const updated = await ipc.settingsSave(editor)
      const dt = pickDailyTarget(updated.values)
      setEditor(dt)
      setSnapshot(dt)
      setSavedAt(Date.now())
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card
      title="Daily profit target"
      subtitle="Your daily net-P&L goal — the profit-side mirror of the daily max loss."
    >
      {!editor ? (
        <div className="skeleton h-[96px]" />
      ) : (
        <div className="space-y-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
              Daily profit target
            </div>
            <div className="mt-1 flex items-center gap-2 rounded-md border border-border-strong bg-bg-1 px-3 py-2 transition-colors duration-150 focus-within:border-gold sm:max-w-[240px]">
              <span className="font-mono text-sm text-fg-tertiary">$</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={Number.isFinite(editor.daily_profit_target) ? editor.daily_profit_target : 0}
                onChange={(e) => {
                  const v = Number.parseFloat(e.target.value)
                  const clean = Number.isFinite(v) && v >= 0 ? v : 0
                  set({ daily_profit_target: clean })
                }}
                className="w-full bg-transparent font-mono text-sm text-fg-primary outline-none"
              />
            </div>
            <div className="mt-1 text-[11px] text-fg-tertiary">
              Your daily net-P&L target. Set 0 to disable.
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-border-subtle pt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="rounded-md border border-border-strong bg-bg-1 px-4 py-2 text-sm text-fg-primary transition-colors duration-150 hover:bg-bg-0 hover:border-gold/60 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {savedAt !== null && !dirty && !saving && (
              <span className="text-xs text-fg-tertiary">Saved</span>
            )}
            {err && <span className="text-xs text-loss">{err}</span>}
          </div>
        </div>
      )}
    </Card>
  )
}
