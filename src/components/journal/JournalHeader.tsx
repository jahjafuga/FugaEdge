import { longDate } from '@/lib/format'

interface JournalHeaderProps {
  date: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onDateChange: (next: string) => void
  isToday: boolean
}

export default function JournalHeader({
  date,
  onPrev,
  onNext,
  onToday,
  onDateChange,
  isToday,
}: JournalHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-subtle bg-bg-2 px-5 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous day"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-fg-primary transition-colors duration-150 hover:border-gold hover:text-gold"
        >
          ‹
        </button>
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl font-semibold tracking-tight text-fg-primary">
            {longDate(date)}
          </h2>
          {!isToday && (
            <button
              type="button"
              onClick={onToday}
              className="text-[10px] uppercase tracking-wider text-fg-tertiary transition-colors hover:text-gold"
            >
              today
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onNext}
          aria-label="Next day"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-fg-primary transition-colors duration-150 hover:border-gold hover:text-gold"
        >
          ›
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-fg-tertiary">Jump to</span>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            if (e.target.value) onDateChange(e.target.value)
          }}
          className="rounded-sm border border-border-subtle bg-bg-1 px-2 py-1 text-sm text-fg-primary outline-none focus:border-gold"
        />
      </div>
    </div>
  )
}
