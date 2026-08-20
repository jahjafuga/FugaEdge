// The calendar month's share action — the entry point that makes the card real.
//
// The compositor and its tests shipped one commit before this one and could not
// be reached from anywhere: a fully working, fully tested export that no user
// could produce. Same shape as the range filter's dead engine, so it gets the
// same guard (shareReachability.test.ts).
//
// SAVE PATH: no new idiom. compose → toBlob → ipc.chartSaveScreenshot, the same
// three steps ChartTab's captureAndSave takes, into the same main-process
// dialog. saveChartScreenshot is generic file I/O — showSaveDialog on a
// caller-supplied suggestedName, then writeFile — so a second channel would buy
// nothing but a second thing to keep in step.
//
// FEEDBACK: the same as a failed chart export, deliberately including its
// limitation. handleScreenshot logs and stays alive because the app has no toast
// system; inventing one here would mean the calendar reported failures in a
// vocabulary the chart export does not have. A cancelled dialog is NOT a
// failure — main resolves { canceled: true }.

import { useCallback, useEffect, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import { useAccountScope } from '@/lib/accountScope'
import { useContributedCapital } from '@/lib/useContributedCapital'
import { useThemeMode } from '@/lib/theme'
import { useStreamerMode } from '@/lib/streamerMode'
import { composeCalendarCard, CALENDAR_CARD_UNITS, type CalendarCardUnit } from '@/lib/calendarCard'
import { buildMonthCardData, cardFileName } from '@/core/calendar/monthCardData'
import type { CalendarMonth } from '@shared/calendar-types'

/** Persisted like calendar.showWeekly and calendar.viewMode — the page's own
 *  idiom for a per-surface choice. */
export const SHARE_UNIT_KEY = 'calendar.shareUnit'

function readUnit(): CalendarCardUnit {
  try {
    return localStorage.getItem(SHARE_UNIT_KEY) === 'dollars' ? 'dollars' : 'percent'
  } catch {
    return 'percent' // the quieter default survives a storage failure
  }
}

const UNIT_LABEL: Record<CalendarCardUnit, string> = { percent: '%', dollars: '$' }

export default function CalendarShareControl({ month }: { month: CalendarMonth }) {
  const { scope } = useAccountScope()
  const { resolved } = useThemeMode()
  const { on: streamer } = useStreamerMode()
  const capital = useContributedCapital(scope)

  const [unit, setUnit] = useState<CalendarCardUnit>(readUnit)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(SHARE_UNIT_KEY, unit)
    } catch {
      // persistence failed — the session still honours the choice
    }
  }, [unit])

  // Streamer mode overrides the choice rather than editing it: the button stays
  // disabled and says why, and the stored preference is left alone so turning
  // the eye off restores what the user had picked. The compositor enforces this
  // again on its own — the UI half is courtesy, not the guarantee.
  const effectiveUnit: CalendarCardUnit = streamer ? 'percent' : unit

  const onShare = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const data = buildMonthCardData(month, effectiveUnit, capital?.contributed ?? null)
      const canvas = await composeCalendarCard(data, resolved)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      )
      if (!blob) throw new Error('Failed to encode calendar card PNG')
      const bytes = new Uint8Array(await blob.arrayBuffer())
      await ipc.chartSaveScreenshot({
        bytes,
        suggestedName: cardFileName(data.year, data.month),
      })
    } catch (e) {
      // Mirrors ChartTab's handleScreenshot exactly, limitation included.
      // eslint-disable-next-line no-console
      console.error('[Calendar] card save failed', e)
    } finally {
      setSaving(false)
    }
  }, [saving, month, effectiveUnit, capital, resolved])

  return (
    <div className="flex items-center gap-2">
      <div
        className="inline-flex items-center gap-0.5 rounded-md border border-border-subtle bg-bg-2 p-0.5"
        role="group"
        aria-label="Card units"
      >
        {CALENDAR_CARD_UNITS.map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setUnit(u)}
            disabled={streamer && u === 'dollars'}
            aria-pressed={effectiveUnit === u}
            title={
              streamer && u === 'dollars'
                ? 'Streamer mode is on — the card is always a percentage'
                : u === 'dollars'
                  ? 'Draw each day in dollars'
                  : 'Draw each day as a percentage of contributed capital'
            }
            className={`w-7 cursor-pointer rounded-[5px] py-1 text-[11px] font-semibold tracking-wider transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30 ${
              effectiveUnit === u ? 'bg-gold/[0.14] text-gold' : 'text-fg-tertiary hover:text-fg-secondary'
            }`}
          >
            {UNIT_LABEL[u]}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onShare}
        disabled={saving}
        title={`Save ${month.stats.year}-${String(month.stats.month).padStart(2, '0')} as a branded card`}
        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border-strong bg-bg-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-fg-secondary shadow-sm transition-colors duration-150 hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? (
          <Loader2 size={12} strokeWidth={2.25} className="animate-spin" />
        ) : (
          <Download size={12} strokeWidth={2.25} />
        )}
        Card
      </button>
    </div>
  )
}
