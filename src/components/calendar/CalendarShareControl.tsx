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

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Download, Loader2, LayoutGrid } from 'lucide-react'
import { viewControlIdle, viewControlOn } from '@/components/trades/viewControlClasses'
import { ipc } from '@/lib/ipc'
import { useAccountScope } from '@/lib/accountScope'
import { useContributedCapital } from '@/lib/useContributedCapital'
import { useThemeMode } from '@/lib/theme'
import { useStreamerMode } from '@/lib/streamerMode'
import {
  composeCalendarCard,
  CALENDAR_CARD_UNITS,
  CALENDAR_CARD_FORMATS,
  CALENDAR_CARD_FORMAT_IDS,
  type CalendarCardFormat,
  type CalendarCardUnit,
} from '@/lib/calendarCard'
import { buildMonthCardData, cardFileName } from '@/core/calendar/monthCardData'
import type { CalendarMonth } from '@shared/calendar-types'

/** Persisted like calendar.showWeekly and calendar.viewMode — the page's own
 *  idiom for a per-surface choice. */
export const SHARE_UNIT_KEY = 'calendar.shareUnit'
export const SHARE_FORMAT_KEY = 'calendar.shareFormat'

/** The portaled panel is positioned, not laid out, so its width is a number the
 *  anchor maths needs rather than a class. */
const MENU_W = 240

function readUnit(): CalendarCardUnit {
  try {
    return localStorage.getItem(SHARE_UNIT_KEY) === 'dollars' ? 'dollars' : 'percent'
  } catch {
    return 'percent' // the quieter default survives a storage failure
  }
}

function readFormat(): CalendarCardFormat {
  try {
    const v = localStorage.getItem(SHARE_FORMAT_KEY)
    return (CALENDAR_CARD_FORMAT_IDS as string[]).includes(v ?? '')
      ? (v as CalendarCardFormat)
      : 'square'
  } catch {
    return 'square'
  }
}

const UNIT_LABEL: Record<CalendarCardUnit, string> = { percent: '%', dollars: '$' }

/** Where each shape is going, and what it turns into. The layout is named
 *  because a format is not a canvas size here — it is a different arrangement of
 *  the same elements, and choosing blind between four sizes tells the trader
 *  nothing about which one puts the week rail front and centre. */
const FORMAT_LABEL: Record<CalendarCardFormat, string> = {
  square: 'Square',
  portrait: 'Portrait',
  story: 'Story',
  wide: 'Wide',
}
const FORMAT_HINT: Record<CalendarCardFormat, string> = {
  square: 'grid + totals',
  portrait: 'grid, week rail below',
  story: 'the week rail, days inline',
  wide: 'grid + week rail, the app’s shape',
}

export default function CalendarShareControl({ month }: { month: CalendarMonth }) {
  const { scope } = useAccountScope()
  const { resolved } = useThemeMode()
  const { on: streamer } = useStreamerMode()
  const capital = useContributedCapital(scope)

  const [unit, setUnit] = useState<CalendarCardUnit>(readUnit)
  const [format, setFormat] = useState<CalendarCardFormat>(readFormat)
  const [saving, setSaving] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)

  // THE PANEL IS LIFTED OUT OF THE HEADER'S TREE.
  //
  // MEASURED, walking every ancestor from the panel to <body>: exactly one
  // suspect property in the chain — `overflow-hidden` on CalendarHeader's
  // `card-premium card-accent overflow-hidden rounded-lg` box. Nothing else has
  // a transform, a filter, an opacity, a will-change, a contain, or a
  // positioned z-index. .card-premium is background/border/radius/shadow and
  // .card-accent is `@apply relative` at z-index auto, so NEITHER makes a
  // stacking context.
  //
  // So the panel was CLIPPED, not painted under — z-40 was already resolving in
  // the root stacking context and would have painted fine; the box simply cut it
  // off. That is a different defect from the MORE FILTERS one (a `sticky z-30`
  // wrapper TRAPPING the panel in a flattened context), and raising a number
  // would not have touched either.
  //
  // The proof is in the app: ColumnsMenu uses this same idiom inside the same
  // `card-premium` surface on the Trades page and works — that wrapper has no
  // `overflow-hidden`.
  //
  // The panel therefore leaves the box, by the route AnalyticsFilterBar already
  // took: a portal to document.body, tracking the trigger by measured rect.
  // z-[44] / z-[45] are that fix's values, read off the app's OWN scale —
  // TopBar 40, modals 50, activation 60, toasts 110/210 — so the backdrop clears
  // the TopBar and the panel stays under modal chrome.
  useEffect(() => {
    if (!menuOpen) return
    const measure = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setAnchor({ top: r.bottom + 6, left: r.right - MENU_W })
    }
    measure()
    // Capture phase: the header scrolls inside AppLayout's pane, not the window.
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [menuOpen])

  useEffect(() => {
    try {
      localStorage.setItem(SHARE_UNIT_KEY, unit)
    } catch {
      // persistence failed — the session still honours the choice
    }
  }, [unit])

  useEffect(() => {
    try {
      localStorage.setItem(SHARE_FORMAT_KEY, format)
    } catch {
      // persistence failed — the session still honours the choice
    }
  }, [format])

  // Streamer mode overrides the choice rather than editing it: the button stays
  // disabled and says why, and the stored preference is left alone so turning
  // the eye off restores what the user had picked. The compositor enforces this
  // again on its own — the UI half is courtesy, not the guarantee.
  const effectiveUnit: CalendarCardUnit = streamer ? 'percent' : unit

  const onShare = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      // The whole capital object, not just its number: the card needs to know
      // WHY a percentage is missing so it can say so, and `contributed ?? null`
      // would flatten "still loading" and "no anchor" into one silent null.
      const data = buildMonthCardData(month, effectiveUnit, capital)
      const canvas = await composeCalendarCard(data, resolved, format)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      )
      if (!blob) throw new Error('Failed to encode calendar card PNG')
      const bytes = new Uint8Array(await blob.arrayBuffer())
      await ipc.chartSaveScreenshot({
        bytes,
        suggestedName: cardFileName(data.year, data.month, format),
      })
    } catch (e) {
      // Mirrors ChartTab's handleScreenshot exactly, limitation included.
      // eslint-disable-next-line no-console
      console.error('[Calendar] card save failed', e)
    } finally {
      setSaving(false)
    }
  }, [saving, month, effectiveUnit, capital, resolved, format])

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
      {/* ONE control, not four. The app already has a menu-trigger idiom for
          exactly this — ColumnsMenu's: viewControlIdle, a lucide glyph, a
          chevron that rotates, a click-away catcher. Four segments for four
          mutually exclusive shapes was a fifth style in a row that already had
          two. */}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          data-testid="card-format-button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className={viewControlIdle}
        >
          <LayoutGrid size={13} strokeWidth={2} />
          {FORMAT_LABEL[format]}
          <ChevronDown
            size={13}
            strokeWidth={2}
            className={`transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
      {menuOpen &&
        anchor &&
        createPortal(
          <>
            <div
              data-testid="card-format-backdrop"
              className="fixed inset-0 z-[44]"
              onClick={() => setMenuOpen(false)}
            />
            <div
              data-testid="card-format-menu"
              role="menu"
              style={{ top: anchor.top, left: anchor.left, width: MENU_W }}
              className="fixed z-[45] rounded-md border border-border-strong bg-bg-2 p-1 shadow-lg"
            >
              {CALENDAR_CARD_FORMAT_IDS.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="menuitemradio"
                  aria-checked={format === f}
                  onClick={() => {
                    setFormat(f)
                    setMenuOpen(false)
                  }}
                  // The row's other three controls are pressable OBJECTS with
                  // their own border and surface; these were the last bare text
                  // in it. Same shared strings as the trigger beside them —
                  // viewControlIdle / viewControlOn — overridden only where a
                  // two-line menu item genuinely differs from a one-line button:
                  // full width, left-aligned, stacked, and auto height.
                  className={`${format === f ? viewControlOn : viewControlIdle} mb-0.5 h-auto w-full flex-col items-start gap-0.5 py-1.5 text-left normal-case tracking-normal last:mb-0`}
                >
                  <span className="text-xs font-semibold">
                    {FORMAT_LABEL[f]}{' '}
                    <span className={format === f ? 'font-normal opacity-70' : 'font-normal text-fg-tertiary'}>
                      {CALENDAR_CARD_FORMATS[f].w}×{CALENDAR_CARD_FORMATS[f].h}
                    </span>
                  </span>
                  <span className={format === f ? 'text-[10px] opacity-70' : 'text-[10px] text-fg-tertiary'}>
                    {FORMAT_HINT[f]}
                  </span>
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
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
