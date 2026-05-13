import { SENTIMENT_LABELS } from '@shared/session-types'

interface SentimentSelectorProps {
  value: number | null
  /** Fires immediately on click — caller saves via IPC. Passing the same
   *  value as `value` deselects (cycles to null). */
  onChange: (next: number | null) => void
}

// Tri-color radio row for setting the day's market sentiment 1..5.
// Color coding mirrors the calendar badge: 1-2 = win green (best),
// 3 = gold (neutral), 4-5 = loss red (worst). Clicking the active level
// clears it back to null. Labels come from session-types so the
// momentum-trading vocabulary stays in one place.

const LEVELS: (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5]

function toneFor(level: 1 | 2 | 3 | 4 | 5, active: boolean) {
  if (!active) {
    return 'border-border-subtle bg-bg-2 text-fg-tertiary hover:border-border hover:text-fg-secondary'
  }
  if (level <= 2) return 'border-win/60 bg-win/15 text-win'
  if (level === 3) return 'border-gold/60 bg-gold/15 text-gold'
  return 'border-loss/60 bg-loss/15 text-loss'
}

export default function SentimentSelector({ value, onChange }: SentimentSelectorProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
      {LEVELS.map((level) => {
        const active = value === level
        return (
          <button
            key={level}
            type="button"
            onClick={() => onChange(active ? null : level)}
            aria-pressed={active}
            className={`flex cursor-pointer flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 ease-out-soft ${toneFor(level, active)}`}
          >
            <div className="flex w-full items-baseline justify-between">
              <span className="font-mono text-base font-semibold tnum">{level}</span>
              {active && (
                <span className="font-mono text-[9px] font-semibold uppercase tracking-widest">
                  ✓
                </span>
              )}
            </div>
            <div className="text-[11px] leading-snug">
              {SENTIMENT_LABELS[level]}
            </div>
          </button>
        )
      })}
    </div>
  )
}
