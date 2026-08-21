import type { TradesFilterState } from '@/core/trades/tradesFilter'
import {
  withDatePreset,
  type DatePreset,
} from '@/core/trades/datePreset'

interface QuickFiltersProps {
  filters: TradesFilterState
  onChange: (next: TradesFilterState) => void
}

export default function QuickFilters({ filters, onChange }: QuickFiltersProps) {
  // The stored intent, NOT a re-derivation. The old code recomputed today's
  // date and string-compared it against the saved range, so a preset set
  // yesterday matched nothing and every chip went dark.
  const activeDate = filters.datePreset

  const setDate = (p: DatePreset) => {
    onChange(withDatePreset(filters, activeDate === p ? null : p, new Date()))
  }

  const setOutcome = (v: 'winners' | 'losers') => {
    onChange({ ...filters, outcome: filters.outcome === v ? 'all' : v })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip label="Today" active={activeDate === 'today'} onClick={() => setDate('today')} />
      <Chip label="Week"  active={activeDate === 'week'}  onClick={() => setDate('week')} />
      <Chip label="Month" active={activeDate === 'month'} onClick={() => setDate('month')} />

      <Divider />

      <Chip label="Winners" active={filters.outcome === 'winners'} onClick={() => setOutcome('winners')} tone="win" />
      <Chip label="Losers"  active={filters.outcome === 'losers'}  onClick={() => setOutcome('losers')}  tone="loss" />

      <Divider />

      <Chip
        label="A+ Only"
        active={filters.aPlus}
        onClick={() => onChange({ ...filters, aPlus: !filters.aPlus })}
      />
      <Chip
        label="Mistakes"
        active={filters.mistakesOnly}
        onClick={() =>
          onChange({ ...filters, mistakesOnly: !filters.mistakesOnly })
        }
        tone="loss"
      />
    </div>
  )
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden="true" />
}

interface ChipProps {
  label: string
  active: boolean
  onClick: () => void
  tone?: 'gold' | 'win' | 'loss'
}

function Chip({ label, active, onClick, tone = 'gold' }: ChipProps) {
  const activeStyles =
    tone === 'win'
      ? 'border-win/50 bg-win-soft text-win'
      : tone === 'loss'
        ? 'border-loss/50 bg-loss-soft text-loss'
        : 'border-gold/50 bg-gold/[0.10] text-gold'
  const hoverStyles =
    tone === 'win'
      ? 'hover:border-win/40 hover:text-win'
      : tone === 'loss'
        ? 'hover:border-loss/40 hover:text-loss'
        : 'hover:border-gold/40 hover:text-gold'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-7 cursor-pointer items-center rounded-full border px-3 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-150 ease-out-soft ${ active ? activeStyles :`border-border-subtle bg-bg-2 text-fg-tertiary ${hoverStyles}`
      }`}
    >
      {label}
    </button>
  )
}
