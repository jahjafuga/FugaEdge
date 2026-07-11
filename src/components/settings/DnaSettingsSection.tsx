import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import { ipc } from '@/lib/ipc'
import { useNumberDraft } from '@/lib/useNumberDraft'
import type { SettingsValues } from '@shared/settings-types'

// v0.2.5 EdgeIQ Trader DNA — the user's 5-pillar stock-selection profile.
//
// SELF-CONTAINED + RELOCATABLE (the DataBackfillCard precedent): this section
// owns its OWN load (ipc.settingsGet) and its OWN save (ipc.settingsSave with
// ONLY the 7 dna_* keys). It does NOT touch the Settings page's shared
// editor / snapshot / isDirty / handleSave. The future Settings remodel
// relocates this ONE file + the ONE <DnaSettingsSection /> line with zero
// untangling. Renderer UI + IPC only — no DB access here (ARCHITECTURE #1).

// The 7 dna_* fields sliced out of SettingsValues — the only keys we load + save.
type DnaConfig = Pick<
  SettingsValues,
  | 'dna_price_min'
  | 'dna_price_max'
  | 'dna_change_min'
  | 'dna_rvol_min'
  | 'dna_float_min'
  | 'dna_float_max'
  | 'dna_require_catalyst'
>

const DNA_KEYS = [
  'dna_price_min',
  'dna_price_max',
  'dna_change_min',
  'dna_rvol_min',
  'dna_float_min',
  'dna_float_max',
  'dna_require_catalyst',
] as const

const pickDna = (v: SettingsValues): DnaConfig => ({
  dna_price_min: v.dna_price_min,
  dna_price_max: v.dna_price_max,
  dna_change_min: v.dna_change_min,
  dna_rvol_min: v.dna_rvol_min,
  dna_float_min: v.dna_float_min,
  dna_float_max: v.dna_float_max,
  dna_require_catalyst: v.dna_require_catalyst,
})

const dnaEqual = (a: DnaConfig, b: DnaConfig): boolean =>
  DNA_KEYS.every((k) => a[k] === b[k])

export default function DnaSettingsSection() {
  const [editor, setEditor] = useState<DnaConfig | null>(null)
  const [snapshot, setSnapshot] = useState<DnaConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ipc
      .settingsGet()
      .then((p) => {
        if (cancelled) return
        const dna = pickDna(p.values)
        setEditor(dna)
        setSnapshot(dna)
      })
      .catch((e: Error) => !cancelled && setErr(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  const set = (patch: Partial<DnaConfig>) =>
    setEditor((prev) => (prev ? { ...prev, ...patch } : prev))

  const dirty = editor !== null && snapshot !== null && !dnaEqual(editor, snapshot)

  const handleSave = async () => {
    if (saving || !editor) return
    setSaving(true)
    setErr(null)
    try {
      // Send ONLY the 7 dna_* keys — DnaConfig is a subset of SettingsUpdate, so
      // nothing else on the page is touched.
      const updated = await ipc.settingsSave(editor)
      const dna = pickDna(updated.values)
      setEditor(dna)
      setSnapshot(dna)
      setSavedAt(Date.now())
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card
      title="Trader DNA — Stock Selection"
      subtitle="Set your 5 stock-selection pillars; EdgeIQ measures how well your trades match them."
    >
      {!editor ? (
        <div className="skeleton h-[220px]" />
      ) : (
        <div className="space-y-5">
          {/* Price range ($). */}
          <div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <PillarNumber label="Price min" prefix="$" value={editor.dna_price_min} onChange={(n) => set({ dna_price_min: n })} />
              <PillarNumber label="Price max" prefix="$" value={editor.dna_price_max} onChange={(n) => set({ dna_price_max: n })} />
            </div>
            {editor.dna_price_min > editor.dna_price_max && <Warn text="Price min is above max" />}
          </div>

          {/* Daily % change + relative volume. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PillarNumber
              label="Daily % change (min)"
              suffix="%"
              value={editor.dna_change_min}
              onChange={(n) => set({ dna_change_min: n })}
              hint="e.g. 10 = up ≥10% on the day"
            />
            <PillarNumber
              label="Relative volume (min)"
              suffix="×"
              value={editor.dna_rvol_min}
              onChange={(n) => set({ dna_rvol_min: n })}
              hint="vs 30-day average volume"
            />
          </div>

          {/* Float range — displayed in millions, stored as a raw share count. */}
          <div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <PillarNumber label="Float min" suffix="M" scale={1_000_000} value={editor.dna_float_min} onChange={(n) => set({ dna_float_min: n })} />
              <PillarNumber label="Float max" suffix="M" scale={1_000_000} value={editor.dna_float_max} onChange={(n) => set({ dna_float_max: n })} />
            </div>
            {editor.dna_float_min > editor.dna_float_max && <Warn text="Float min is above max" />}
          </div>

          {/* News catalyst — the plain accent-gold checkbox (DataBackfillCard precedent). */}
          <label className="flex items-center gap-2 text-xs text-fg-secondary">
            <input
              type="checkbox"
              checked={editor.dna_require_catalyst}
              onChange={(e) => set({ dna_require_catalyst: e.target.checked })}
              className="accent-gold"
            />
            Require a news catalyst
          </label>

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

// Unit-aware number field — the local NumberField is $-locked, so this section
// ships its own (prefix/suffix per pillar). `scale` lets the float fields show
// millions while storing the raw share count. Per-field coercion matches
// NumberField: parseFloat, clamp ≥ 0, NaN → 0.
//
// The value is bound as a STRING draft (useNumberDraft) — see that module for why a number
// prop makes React stick a leading zero to <input type="number"> and refuse to let the "0"
// be deleted. The draft holds the DISPLAY-space string (already divided by `scale`) and the
// hook multiplies back to STORED space on commit, so the exact `value / scale` <-> `n * scale`
// conversion this field already used is preserved in both directions.
function PillarNumber({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  scale = 1,
}: {
  label: string
  value: number
  onChange: (next: number) => void
  prefix?: string
  suffix?: string
  hint?: string
  scale?: number
}) {
  const { draft, onDraftChange } = useNumberDraft(value, scale)
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">{label}</div>
      <div className="mt-1 flex items-center gap-2 rounded-md border border-border-strong bg-bg-1 px-3 py-2 transition-colors duration-150 focus-within:border-gold">
        {prefix && <span className="font-mono text-sm text-fg-tertiary">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          aria-label={label}
          placeholder="0"
          value={draft}
          onChange={(e) => onChange(onDraftChange(e.target.value))}
          className="w-full bg-transparent font-mono text-sm text-fg-primary placeholder:text-fg-muted outline-none"
        />
        {suffix && <span className="font-mono text-sm text-fg-tertiary">{suffix}</span>}
      </div>
      {hint && <div className="mt-1 text-[11px] text-fg-tertiary">{hint}</div>}
    </div>
  )
}

// Soft min>max hint — informs but never blocks the save (the compute chunk
// normalizes); matches "don't over-engineer validation".
function Warn({ text }: { text: string }) {
  return <div className="mt-1.5 text-[11px] text-loss/80">{text}</div>
}
