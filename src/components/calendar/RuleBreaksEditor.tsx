import { useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { dayRepo } from '@/data/dayRepo'
import { colorForTag } from '@/lib/tagColor'

interface RuleBreaksEditorProps {
  date: string
  breaks: string[]
  onChange: (next: string[]) => void
}

// Module-level cache so opening multiple days in a row doesn't re-fetch.
// settings.daily_rule_break_list rarely changes during a session.
let cachedOptions: string[] | null = null
let cachedAt = 0

export function invalidateRuleBreakOptionsCache() {
  cachedOptions = null
  cachedAt = 0
}

// Phase 2 (djsevans87) — day-level rule-break tagger for the Day Detail modal's
// "Rule Breaks" tab. A self-contained CLONE of DayTagsEditor (which is orphaned):
// it reads its options from settings.daily_rule_break_list and saves through
// dayRepo.saveRuleBreaks (journal.rule_breaks), with the same chip-toggle UX.
// Kept separate, not generalized, so this new feature isn't coupled to the
// orphaned day_tags editor.
export default function RuleBreaksEditor({ date, breaks, onChange }: RuleBreaksEditorProps) {
  const [options, setOptions] = useState<string[] | null>(
    cachedOptions && Date.now() - cachedAt < 60_000 ? cachedOptions : null,
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (options !== null) return
    let cancelled = false
    ipc
      .settingsGet()
      .then((p) => {
        if (cancelled) return
        const list = p.values.daily_rule_break_list ?? []
        cachedOptions = list
        cachedAt = Date.now()
        setOptions(list)
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [options])

  const toggle = async (rb: string) => {
    const next = breaks.includes(rb) ? breaks.filter((t) => t !== rb) : [...breaks, rb]
    setSaving(true)
    setErr(null)
    onChange(next) // optimistic
    try {
      const res = await dayRepo.saveRuleBreaks(date, next)
      onChange(res.breaks)
    } catch (e) {
      // roll back
      onChange(breaks)
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (options === null) {
    return (
      <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">
        Loading rule breaks…
      </div>
    )
  }

  if (options.length === 0) {
    return (
      <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">
        No daily rule breaks configured · add some in Settings → Daily Rule Breaks.
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">
        Rule breaks
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((rb) => {
          const active = breaks.includes(rb)
          const color = colorForTag(rb)
          return (
            <button
              key={rb}
              type="button"
              disabled={saving}
              onClick={() => toggle(rb)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] uppercase tracking-wider transition-all duration-150 ${
                active
                  ? 'bg-bg-1/40 text-fg-primary'
                  : 'border-border-subtle bg-bg-1/40 text-fg-secondary hover:border-gold/40 hover:text-fg-primary'
              } ${saving ? 'opacity-60' : ''}`}
              // Selected = dark felt surface with a colored OUTLINE + GLOW (aurora
              // language), not a flood-fill: the chip's own color identifies it via
              // a 1px colored border, a soft 40%-alpha ring, and a 12px outer halo
              // ALSO at 40% alpha (the pre-bump pass dimmed the halo from full
              // color; selection reads from the ring + border). Tunable — raise
              // the halo hex (e.g. `${color}cc`) or blur to dial intensity.
              // Unselected stays untouched.
              style={
                active
                  ? {
                      borderColor: color,
                      boxShadow: `0 0 0 1px ${color}66, 0 0 12px -2px ${color}66`,
                    }
                  : undefined
              }
            >
              <span
                className="block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              {rb}
            </button>
          )
        })}
      </div>
      {err && (
        <div className="text-[10px] text-loss">Failed to save: {err}</div>
      )}
    </div>
  )
}
