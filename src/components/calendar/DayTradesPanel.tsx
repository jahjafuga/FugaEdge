import { useEffect } from 'react'
import TradesTable from '@/components/trades/TradesTable'
import IntradayPnLChart from '@/components/charts/IntradayPnLChart'
import Skeleton from '@/components/ui/Skeleton'
import DayTagsEditor from './DayTagsEditor'
import type {
  TradeListRow,
  UpdateCatalystInput,
  UpdateConfidenceInput,
  UpdateCountryInput,
  UpdateFloatInput,
  UpdateMistakesInput,
  UpdateNoteInput,
  UpdatePlannedRiskInput,
  UpdatePlannedStopLossInput,
  UpdateTimeframeInput,
} from '@shared/trades-types'
import type { SetPlaybookOnTradeInput } from '@shared/playbook-types'
import { longDate } from '@/lib/format'

interface DayTradesPanelProps {
  date: string
  trades: TradeListRow[] | null
  dayTags: string[]
  onSaveDayTags: (tags: string[]) => void
  onClose: () => void
  onSaveNote: (input: UpdateNoteInput) => Promise<void>
  onSaveTimeframe: (input: UpdateTimeframeInput) => Promise<void>
  onSavePlaybook: (input: SetPlaybookOnTradeInput) => Promise<void>
  onSaveConfidence: (input: UpdateConfidenceInput) => Promise<void>
  onSaveMistakes: (input: UpdateMistakesInput) => Promise<void>
  onSavePlannedRisk: (input: UpdatePlannedRiskInput) => Promise<void>
  onSavePlannedStopLoss: (input: UpdatePlannedStopLossInput) => Promise<void>
  onSaveFloat: (input: UpdateFloatInput) => Promise<void>
  onSaveCatalyst: (input: UpdateCatalystInput) => Promise<void>
  onSaveCountry: (input: UpdateCountryInput) => Promise<void>
}

export default function DayTradesPanel({
  date,
  trades,
  dayTags,
  onSaveDayTags,
  onClose,
  onSaveNote,
  onSaveTimeframe,
  onSavePlaybook,
  onSaveConfidence,
  onSaveMistakes,
  onSavePlannedRisk,
  onSavePlannedStopLoss,
  onSaveFloat,
  onSaveCatalyst,
  onSaveCountry,
}: DayTradesPanelProps) {
  // Escape closes the panel — matches the WeeklyReviewModal + lightbox
  // pattern so the calendar's two dismissal paths feel consistent.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="rounded-md border border-border-subtle bg-bg-2">
      <div className="flex items-baseline justify-between border-b border-border-subtle/60 px-5 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">
            Selected day
          </div>
          <div className="mt-0.5 text-base font-medium text-fg-primary">
            {longDate(date)}{' '}
            <span className="ml-2 font-mono text-xs text-fg-secondary">{date}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border-subtle px-3 py-1 text-xs text-fg-secondary transition-colors duration-150 hover:border-muted hover:text-fg-primary"
        >
          Close
        </button>
      </div>

      <div className="border-b border-border-subtle/40 px-5 py-3">
        <DayTagsEditor date={date} tags={dayTags} onChange={onSaveDayTags} />
      </div>

      <div className="space-y-5 p-5">
        {trades === null ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[36px] border border-border-subtle/60" />
            ))}
          </div>
        ) : trades.length === 0 ? (
          <div className="rounded-md border border-border-subtle bg-bg-1/40 px-6 py-10 text-center text-sm text-fg-tertiary">
            No trades on this day.
          </div>
        ) : (
          <>
            <IntradayPnLChart trades={trades} date={date} />
            <TradesTable
              trades={trades}
              onSaveNote={onSaveNote}
              onSaveTimeframe={onSaveTimeframe}
              onSavePlaybook={onSavePlaybook}
              onSaveConfidence={onSaveConfidence}
              onSaveMistakes={onSaveMistakes}
              onSavePlannedRisk={onSavePlannedRisk}
              onSavePlannedStopLoss={onSavePlannedStopLoss}
              onSaveFloat={onSaveFloat}
              onSaveCatalyst={onSaveCatalyst}
              onSaveCountry={onSaveCountry}
            />
          </>
        )}
      </div>
    </div>
  )
}
