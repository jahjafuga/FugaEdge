// v0.2.5 Phase B Session 5 — the create-challenge modal (L28/L33, premium
// pass 2026-06-13). Preset chips LEAD (4 process + 2 equity since the L33
// amendment); selecting a chip prefills editable fields and the selection
// persists (gold border + tint) until another chip is picked or a manual
// edit diverges from the prefill. Validation is the pure core's
// validateCreateGoal — the same function the main process runs
// authoritatively; presets resolve to concrete amounts before it ever runs.
//
// Premium grammar (D26): surface elevation + border-subtle + gold accents;
// NO pure-white hairline borders anywhere (pure white is reserved for
// primary TEXT). DOLLAR DISCIPLINE (L28 two-part invariant): this modal
// lives on /profile, outside the equity goal card, so it renders NO "$"
// text — equity amounts live only in the numeric Target field. Hand-rolled
// controls only: the D17 dependency budget is closed.

import { useEffect, useState } from 'react'
import Modal from '@/components/ui/Modal'
import { ipc } from '@/lib/ipc'
import type { Goal, GoalKind } from '@shared/identity-types'
import {
  GOAL_PRESETS,
  PROCESS_METRICS,
  validateCreateGoal,
  type GoalPreset,
  type ProcessMetric,
} from '@/core/goals/config'
import { todayDateISO } from '@/core/session/today'
import { goalIcon } from './icons'
import { fmtDollars } from '../helpers'
import { profileStrings as S } from '../strings'

interface GoalCreateModalProps {
  open: boolean
  onClose: () => void
  onCreated: (goal: Goal) => void
  /** When the modal opens, pre-select this preset (from a Challenges empty-state
   *  starter card). null/undefined opens it untouched (the "New challenge" path). */
  initialPresetId?: string | null
}

// Settings-idiom field: border-subtle at rest, gold-dim focus, no UA outline.
const inputCls =
  'w-full rounded-md border border-border-subtle bg-bg-1 px-3 py-1.5 text-sm text-fg-primary placeholder:text-fg-tertiary outline-none transition-colors duration-150 focus:border-gold-dim'
const labelCls = 'mb-1 block text-xs text-fg-tertiary'

export default function GoalCreateModal({
  open,
  onClose,
  onCreated,
  initialPresetId,
}: GoalCreateModalProps) {
  const C = S.goals.create
  const [kind, setKind] = useState<GoalKind>('process')
  const [title, setTitle] = useState('')
  const [metric, setMetric] = useState<ProcessMetric>('journaled_days')
  const [target, setTarget] = useState('30')
  const [startDate, setStartDate] = useState(todayDateISO())
  const [startAmount, setStartAmount] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  // Which preset chip is visibly selected, and (for delta equity presets)
  // the live delta added to start_amount until the user edits Target by hand.
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [deltaMode, setDeltaMode] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const selected = selectedPreset
    ? GOAL_PRESETS.find((p) => p.id === selectedPreset) ?? null
    : null

  function presetMetaLine(p: GoalPreset): string {
    if (p.kind === 'process') return `${p.target} ${C.presetMeta[p.metric]}`
    // Equity dollar text is the NAMED L28 exception (equity chips + cards):
    // absolute presets show the target, delta presets show the climb.
    if (p.targetAmount != null) return fmtDollars(p.targetAmount)
    return `+${fmtDollars(p.targetDelta ?? 0)} ${C.presetDeltaSuffix}`
  }

  // Goal-identity icon from the shared map. Option A — a distinct lucide mark
  // per process metric, TrendingUp for equity — is the locked, shipped choice
  // (the 'B' no-icon variant was dropped after the iteration-4 live-look).
  function chipIcon(p: GoalPreset) {
    return goalIcon(p.kind, p.kind === 'process' ? p.metric : null)
  }

  function applyPreset(p: GoalPreset) {
    setError(null)
    setSelectedPreset(p.id)
    setTitle(C.presetTitles[p.id] ?? p.id)
    if (p.kind === 'process') {
      setKind('process')
      setMetric(p.metric)
      setTarget(String(p.target))
      setDeltaMode(null)
      return
    }
    // Equity preset — flip Kind, prefill the title. start_amount stays
    // user-entered (personal); start_date stays today.
    setKind('equity')
    if (p.targetAmount != null) {
      setTargetAmount(String(p.targetAmount))
      setDeltaMode(null)
    } else {
      const delta = p.targetDelta ?? 0
      setDeltaMode(delta)
      const s = Number(startAmount)
      setTargetAmount(
        startAmount.trim() !== '' && Number.isFinite(s) ? String(s + delta) : '',
      )
    }
  }

  // Pre-fill from a Challenges empty-state starter: when the modal opens with an
  // initialPresetId, apply that preset (reuses applyPreset). Fires on the open
  // edge; a null/absent id (the "New challenge" path) opens it untouched.
  useEffect(() => {
    if (open && initialPresetId) {
      const p = GOAL_PRESETS.find((x) => x.id === initialPresetId)
      if (p) applyPreset(p)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPresetId])

  // Clearing the selected preset and stopping the delta auto-compute are
  // COUPLED (2026-06-13 fix): once an edit diverges from the prefill, a delta
  // chip must not keep silently recomputing Target behind the user's back.
  function divergeFromPreset() {
    setSelectedPreset(null)
    setDeltaMode(null)
  }

  function selectKind(k: GoalKind) {
    // A manual Kind change diverges from any selected preset.
    setKind(k)
    divergeFromPreset()
    setError(null)
  }

  function onTitleChange(v: string) {
    setTitle(v)
    if (selected && v !== (C.presetTitles[selected.id] ?? selected.id)) {
      divergeFromPreset()
    }
  }

  function onMetricChange(m: ProcessMetric) {
    setMetric(m)
    if (selected && (selected.kind !== 'process' || m !== selected.metric)) {
      divergeFromPreset()
    }
  }

  function onTargetChange(v: string) {
    setTarget(v)
    if (selected && (selected.kind !== 'process' || v !== String(selected.target))) {
      divergeFromPreset()
    }
  }

  function onStartAmountChange(v: string) {
    setStartAmount(v)
    // Delta presets keep Target in sync as start_amount is typed. Typing the
    // (personal) start confirms the preset — it never diverges — so the chip
    // stays selected.
    if (deltaMode != null) {
      const s = Number(v)
      setTargetAmount(v.trim() !== '' && Number.isFinite(s) ? String(s + deltaMode) : '')
    }
  }

  function onTargetAmountChange(v: string) {
    setTargetAmount(v)
    // A manual Target edit always diverges: stops auto-compute, clears the chip.
    divergeFromPreset()
  }

  async function submit() {
    if (busy) return
    setError(null)
    const config =
      kind === 'process'
        ? { metric, target: Number(target) }
        : {
            start_date: startDate,
            start_amount: Number(startAmount),
            target_amount: Number(targetAmount),
          }
    const v = validateCreateGoal({ title, kind, config })
    if (!v.ok) {
      setError(v.error)
      return
    }
    setBusy(true)
    try {
      const result = await ipc.goalsCreate({ title, kind, config, preset_id: selectedPreset })
      if (!result.ok) {
        setError(result.error)
        return
      }
      onCreated(result.goal)
      onClose()
      setTitle('')
      setSelectedPreset(null)
      setDeltaMode(null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={C.title} width={560}>
      <div className="space-y-4">
        {/* Presets lead (L33 — 4 process + 2 equity, glyph-led). Selection
            persists until another chip is picked or an edit diverges. */}
        <div>
          <span className={labelCls}>{C.presetsLabel}</span>
          <div className="grid grid-cols-2 gap-2">
            {GOAL_PRESETS.map((p) => {
              const isSel = selectedPreset === p.id
              const Icon = chipIcon(p)
              return (
                <button
                  key={p.id}
                  type="button"
                  data-preset-kind={p.kind}
                  aria-pressed={isSel}
                  onClick={() => applyPreset(p)}
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 text-left transition-all duration-150 ease-out-soft ${
                    isSel
                      ? 'border-gold bg-gold/[0.08]'
                      : 'border-border-subtle bg-bg-4 hover:-translate-y-0.5 hover:border-gold-dim hover:shadow-md'
                  }`}
                >
                  <Icon
                    aria-hidden
                    className="mt-0.5 shrink-0 text-gold"
                    size={16}
                    strokeWidth={1.75}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-fg-primary">
                      {C.presetTitles[p.id] ?? p.id}
                    </span>
                    <span className="mt-0.5 block font-mono text-xs text-fg-tertiary">
                      {presetMetaLine(p)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Kind toggle — sunken pill: no outer border, gold-filled selected
            segment with black text, transparent unselected. */}
        <div>
          <span className={labelCls}>{C.kindLabel}</span>
          <div role="tablist" className="inline-flex rounded-full bg-bg-1 p-0.5">
            {(['process', 'equity'] as const).map((k) => {
              const active = kind === k
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectKind(k)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-150 ease-out-soft ${
                    active
                      ? 'bg-gold text-accent-ink'
                      : 'text-fg-secondary hover:text-fg-primary'
                  }`}
                >
                  {k === 'process' ? C.kindProcess : C.kindEquity}
                </button>
              )
            })}
          </div>
        </div>

        <label className="block">
          <span className={labelCls}>{C.titleLabel}</span>
          <input
            type="text"
            value={title}
            placeholder={C.titlePlaceholder}
            onChange={(e) => onTitleChange(e.target.value)}
            className={inputCls}
          />
        </label>

        {kind === 'process' ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>{C.metricLabel}</span>
              <select
                value={metric}
                onChange={(e) => onMetricChange(e.target.value as ProcessMetric)}
                className={inputCls}
              >
                {PROCESS_METRICS.map((m) => (
                  <option key={m} value={m}>
                    {C.presetMeta[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>{C.targetLabel}</span>
              <input
                type="number"
                min={1}
                step={1}
                value={target}
                onChange={(e) => onTargetChange(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className={labelCls}>{C.startDateLabel}</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className={labelCls}>{C.startAmountLabel}</span>
                <input
                  type="number"
                  value={startAmount}
                  onChange={(e) => onStartAmountChange(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className={labelCls}>{C.targetAmountLabel}</span>
                <input
                  type="number"
                  value={targetAmount}
                  onChange={(e) => onTargetAmountChange(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>
            <p className="text-xs text-fg-muted">{C.equityNote}</p>
          </>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-accent-ink hover:bg-gold-hover disabled:opacity-60"
          >
            {busy ? C.submitting : C.submit}
          </button>
        </div>
      </div>
    </Modal>
  )
}
