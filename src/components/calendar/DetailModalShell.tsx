import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X, type LucideIcon } from 'lucide-react'
import { type NavPosition } from '@/core/trades/tradeNavigation'

export interface DetailModalTab<K extends string> {
  key: K
  label: string
  Icon: LucideIcon
  available: boolean
}

interface DetailModalShellProps<K extends string> {
  /** id of the <h2> title, referenced by aria-labelledby. */
  titleId: string
  title: ReactNode
  subtitle: ReactNode
  /** Slot to the left of the close button (e.g. Day's gross/fees/net trio). */
  headerRight: ReactNode
  tabs: readonly DetailModalTab<K>[]
  activeTab: K
  onTabChange: (key: K) => void
  onClose: () => void
  /** When a stacked modal (e.g. TradeDetailModal) is open, suppress this
   *  shell's close-on-Escape so the stacked modal closes first. */
  escapeBlocked?: boolean
  maxWidthClass?: string
  children: ReactNode
  /** Rendered as a sibling inside the portal — a stacked modal that
   *  self-portals to document.body (z-210). */
  stackedModal?: ReactNode
  /** Day/week cycling (v0.2.6). When BOTH nav props are present the header
   *  grows the TradeDetailModal-precedent chevrons + "N of M" counter, and
   *  ←/→ navigate the host's population. Buttons AND keys are gated on
   *  escapeBlocked — the same stacked-trade source the Esc guard above uses —
   *  and keys never fire while focus is in an input/textarea/select/
   *  contenteditable (Esc stays ungated). Absent → byte-identical shell. */
  navPosition?: NavPosition<string>
  onNavigate?: (key: string) => void
  /** Unit for the nav a11y labels: "Previous ${navUnit}" / "Next ${navUnit}". */
  navUnit?: string
}

// v0.2.2 Day 4.5a — shared tabbed-detail-modal chrome, extracted from
// DayDetailModal behavior-preserving. Owns: portal + backdrop + content card
// (z-110 base layer) + header (title/subtitle/headerRight slot/close) + tab
// strip + scrollable content + the stacking-aware Escape handler. Both
// DayDetailModal and the Day-4.5 WeekReviewModal render their own header
// content + tab content into this shell, so the chrome — and the Escape /
// z-order discipline that bit us twice — has a single source of truth.
export default function DetailModalShell<K extends string>({
  titleId,
  title,
  subtitle,
  headerRight,
  tabs,
  activeTab,
  onTabChange,
  onClose,
  escapeBlocked = false,
  maxWidthClass = 'max-w-[min(1400px,calc(100vw-3rem))]',
  children,
  stackedModal,
  navPosition,
  onNavigate,
  navUnit = 'item',
}: DetailModalShellProps<K>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // A stacked modal owns Escape while open — don't close this shell out
        // from under it. Both listeners live on `document`; stopPropagation
        // can't stop a sibling listener and this one mounts first, so the
        // guard must be explicit.
        if (escapeBlocked) return
        e.stopPropagation()
        onClose()
        return
      }
      // Arrow keys = prev/next day/week — ONLY when the host wired nav, and
      // NEVER while a trade is stacked (the same escapeBlocked source the Esc
      // guard above reads). Extends the existing keydown effect rather than
      // adding a second listener — the TradeDetailModal precedent's shape.
      if (!navPosition || !onNavigate) return
      if (escapeBlocked) return
      // Never hijack arrows while the user is typing/selecting in a field —
      // let them move the text cursor (Notes <textarea>, any input/select/
      // contenteditable). Escape above is intentionally NOT gated this way.
      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      if (e.key === 'ArrowLeft' && navPosition.prevId != null) {
        e.preventDefault()
        onNavigate(navPosition.prevId)
      } else if (e.key === 'ArrowRight' && navPosition.nextId != null) {
        e.preventDefault()
        onNavigate(navPosition.nextId)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, escapeBlocked, navPosition, onNavigate])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[110] flex items-center justify-center p-6"
    >
      <div
        className="absolute inset-0 bg-bg-0/80 backdrop-blur-[5px]"
        onClick={onClose}
      />
      <div
        className={`card-premium card-accent relative flex max-h-[92vh] w-full ${maxWidthClass} flex-col overflow-hidden rounded-lg animate-modal-in`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
          {/* Left zone: prev/next nav (cycling hosts only) + the title block,
              wrapped together so the nav sits beside the title on the left
              while headerRight keeps hugging the right — the
              TradeDetailModal:273 ModalHeader affordance, ported. */}
          <div className="flex min-w-0 items-start gap-3">
            {navPosition && onNavigate && (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    !escapeBlocked && navPosition.prevId != null && onNavigate(navPosition.prevId)
                  }
                  disabled={escapeBlocked || navPosition.prevId == null}
                  aria-label={`Previous ${navUnit}`}
                  title={`Previous ${navUnit}`}
                  className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 hover:border-border hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={16} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    !escapeBlocked && navPosition.nextId != null && onNavigate(navPosition.nextId)
                  }
                  disabled={escapeBlocked || navPosition.nextId == null}
                  aria-label={`Next ${navUnit}`}
                  title={`Next ${navUnit}`}
                  className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 hover:border-border hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight size={16} strokeWidth={2} />
                </button>
                {navPosition.index >= 0 && navPosition.total > 0 && (
                  <span className="ml-1 text-xs text-fg-tertiary tnum">
                    {navPosition.index + 1} of {navPosition.total}
                  </span>
                )}
              </div>
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl font-semibold tracking-tight text-fg-primary">
                {title}
              </h2>
              <div className="mt-1 text-xs text-fg-tertiary tnum">{subtitle}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-baseline gap-4">
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-fg-primary"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-0 border-b border-border-subtle px-3">
          {tabs.map((t) => {
            const active = t.key === activeTab
            const interactive = t.available
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => interactive && onTabChange(t.key)}
                disabled={!interactive}
                aria-selected={active}
                role="tab"
                title={interactive ? undefined : 'Ships later in the v0.2.2 build sequence'}
                className={`relative inline-flex h-10 items-center gap-2 px-3 text-sm transition-colors duration-150 ease-out-soft ${
                  active
                    ? 'font-medium text-fg-primary cursor-pointer'
                    : interactive
                      ? 'text-fg-tertiary hover:text-fg-secondary cursor-pointer'
                      : 'text-fg-tertiary/40 cursor-not-allowed'
                }`}
              >
                <t.Icon size={14} strokeWidth={1.75} />
                {t.label}
                {active && (
                  <span className="absolute bottom-[-1px] left-2 right-2 h-[2px] rounded-t bg-gold" />
                )}
              </button>
            )
          })}
        </div>
        <div className="flex-1 overflow-auto p-4">{children}</div>
      </div>
      {stackedModal}
    </div>,
    document.body,
  )
}
