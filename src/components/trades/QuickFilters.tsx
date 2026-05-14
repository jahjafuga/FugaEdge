import type { TradesFilterState } from './TradesFilters'

interface QuickFiltersProps {
  filters: TradesFilterState
  onChange: (next: TradesFilterState) => void
}

type DatePreset = 'today' | 'week' | 'month'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

function daysAgoStr(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

function activeDatePreset(f: TradesFilterState): DatePreset | null {
  const t = todayStr()
  if (f.dateFrom === t && f.dateTo === t) return 'today'
  if (f.dateFrom === daysAgoStr(6) && f.dateTo === t) return 'week'
  if (f.dateFrom === daysAgoStr(29) && f.dateTo === t) return 'month'
  return null
}

function withDatePreset(f: TradesFilterState, p: DatePreset | null): TradesFilterState {
  if (p === null) return { ...f, dateFrom: '', dateTo: '' }
  const t = todayStr()
  if (p === 'today') return { ...f, dateFrom: t, dateTo: t }
  if (p === 'week') return { ...f, dateFrom: daysAgoStr(6), dateTo: t }
  return { ...f, dateFrom: daysAgoStr(29), dateTo: t }
}

export default function QuickFilters({ filters, onChange }: QuickFiltersProps) {
  const activeDate = activeDatePreset(filters)

  const setDate = (p: DatePreset) => {
    onChange(withDatePreset(filters, activeDate === p ? null : p))
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
        label="A+ Setups"
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
