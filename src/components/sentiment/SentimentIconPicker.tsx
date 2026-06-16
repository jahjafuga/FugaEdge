import { SENTIMENT_LABELS } from '@shared/session-types'
import icon1 from '@/assets/1.svg'
import icon2 from '@/assets/2.svg'
import icon3 from '@/assets/3.svg'
import icon4 from '@/assets/4.svg'
import icon5 from '@/assets/5.svg'

// SENTIMENT ICON PICKER — the shared fire/ice 1→5 market-sentiment ladder.
// Pure value/onChange presentational picker (NO data fetch, NO card tint) used
// by the dashboard MarketSentimentCard and the Journal page so the icon ladder
// isn't reimplemented twice. The 5 multi-color SVGs live here — the single home
// for the icon imports (exported as SENTIMENT_ICONS for surfaces that render an
// icon alone, e.g. the calendar day cell).
//
// Order is 1→5 (cold→hot: snowflake → sun+rain → sun → fire → strong fire).
// Tapping the active level clears it (→ null) — the toggle lives here, so a
// consumer's onChange just persists the value it's handed. iconSize sizes the
// art per surface (dashboard 36px, journal ~30px). showLabels renders the
// active level's momentum-runner SENTIMENT_LABELS line below the icons.

type Level = 1 | 2 | 3 | 4 | 5

const LEVELS: Level[] = [1, 2, 3, 4, 5]

/** The 5 sentiment icons keyed by level — single home for the SVG imports. */
export const SENTIMENT_ICONS: Record<Level, string> = {
  1: icon1,
  2: icon2,
  3: icon3,
  4: icon4,
  5: icon5,
}

// Active-icon ring color per level (matches the dashboard tint hue ladder:
// --info icy-blue · --neutral gray · --sentiment-3 orange · --loss soft-red ·
// --danger deep-red).
const RING: Record<Level, string> = {
  1: 'rgb(var(--info))',
  2: 'rgb(var(--neutral))',
  3: 'rgb(var(--sentiment-3))',
  4: 'rgb(var(--loss))',
  5: 'rgb(var(--danger))',
}

interface SentimentIconPickerProps {
  value: number | null
  /** Receives the new level, or null when the active level is tapped to clear. */
  onChange: (next: number | null) => void
  /** Render the active level's SENTIMENT_LABELS line below the icons. */
  showLabels?: boolean
  /** Icon px (width = height). Dashboard 36, journal ~30. Default 36. */
  iconSize?: number
  /** Muted copy shown below when nothing is picked (only with showLabels). */
  labelPlaceholder?: string
}

export default function SentimentIconPicker({
  value,
  onChange,
  showLabels = false,
  iconSize = 36,
  labelPlaceholder = 'Tap to set your market read.',
}: SentimentIconPickerProps) {
  const active = value != null ? (value as Level) : null
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-1.5">
        {LEVELS.map((n) => {
          const isActive = active === n
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(isActive ? null : n)}
              aria-pressed={isActive}
              aria-label={`Sentiment ${n} of 5 — ${SENTIMENT_LABELS[n]}`}
              title={`${n}/5 — ${SENTIMENT_LABELS[n]}`}
              className={`group flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-lg border border-transparent px-1.5 py-2 transition-all duration-200 ${
                isActive ? 'bg-bg-3' : 'hover:bg-bg-2'
              }`}
              style={isActive ? { boxShadow: `inset 0 0 0 1.5px ${RING[n]}` } : undefined}
            >
              <img
                src={SENTIMENT_ICONS[n]}
                alt=""
                aria-hidden="true"
                style={{ width: `${iconSize}px`, height: `${iconSize}px` }}
                className={`transition-all duration-200 ${
                  isActive
                    ? 'opacity-100 grayscale-0'
                    : 'opacity-40 grayscale group-hover:opacity-100 group-hover:grayscale-0'
                }`}
              />
              <span
                className={`font-mono text-[11px] font-semibold tnum transition-colors duration-200 ${
                  isActive ? 'text-fg-primary' : 'text-fg-muted group-hover:text-fg-secondary'
                }`}
              >
                {n}
              </span>
            </button>
          )
        })}
      </div>
      {showLabels && (
        <div className="min-h-[16px] text-center text-xs">
          {active ? (
            <span className="text-fg-secondary">
              <span className="font-semibold text-fg-primary">{active}/5</span>
              {' · '}
              {SENTIMENT_LABELS[active]}
            </span>
          ) : (
            <span className="text-fg-muted">{labelPlaceholder}</span>
          )}
        </div>
      )}
    </div>
  )
}
