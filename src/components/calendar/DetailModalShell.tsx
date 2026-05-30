import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X, type LucideIcon } from 'lucide-react'

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
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, escapeBlocked])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[110] flex items-center justify-center p-6"
    >
      <div
        className="absolute inset-0 bg-bg-0/72 backdrop-blur-[4px]"
        onClick={onClose}
      />
      <div
        className={`relative flex max-h-[92vh] w-full ${maxWidthClass} flex-col rounded-lg border border-border bg-bg-3 shadow-lg animate-modal-in`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-semibold tracking-tight text-fg-primary">
              {title}
            </h2>
            <div className="mt-1 text-xs text-fg-tertiary tnum">{subtitle}</div>
          </div>
          <div className="flex shrink-0 items-baseline gap-4">
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 hover:border-border hover:text-fg-primary"
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
                    ? 'text-fg-primary cursor-pointer'
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
