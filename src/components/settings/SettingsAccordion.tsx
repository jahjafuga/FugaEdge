import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

interface SettingsAccordionProps {
  /** Persistence key. Stored at `fuga.settings.<storageKey>.expanded` so
   *  callers don't repeat the namespace prefix. */
  storageKey: string
  title: string
  subtitle?: string
  /** Optional item count shown as "(N)" next to the title when collapsed. */
  count?: number
  /** Defaults to false (collapsed) per the v0.1.5 Settings accordion spec. */
  defaultOpen?: boolean
  children: ReactNode
}

const KEY_PREFIX = 'fuga.settings.'

// Settings-page accordion section. Standalone primitive — the existing
// CollapsibleCard in /ui is used by Reports → Breakdown and has a
// different API (no persistence, no count badge), so we keep this one
// local to the Settings concern instead of overloading it.
//
// Visual: same surface family as Card (rounded-lg, bg-bg-2, subtle
// border). Click the header to toggle. Chevron rotates 0deg → 90deg.
// Height transition uses CSS grid 0fr → 1fr so arbitrary children sizes
// animate cleanly without JS measurement.
export default function SettingsAccordion({
  storageKey,
  title,
  subtitle,
  count,
  defaultOpen = false,
  children,
}: SettingsAccordionProps) {
  const fullKey = KEY_PREFIX + storageKey + '.expanded'
  const [open, setOpen] = useState<boolean>(() => readPersisted(fullKey, defaultOpen))

  useEffect(() => {
    try {
      window.localStorage.setItem(fullKey, open ? '1' : '0')
    } catch {
      // localStorage may be blocked (private window, future web port) —
      // failure here is acceptable; the accordion still toggles, the
      // preference just doesn't survive a reload.
    }
  }, [fullKey, open])

  const toggle = useCallback(() => setOpen((v) => !v), [])

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-2 shadow-sm transition-colors duration-150 ease-out-soft hover:border-border">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-4 px-4 py-3 text-left transition-colors duration-150 hover:bg-bg-3/40"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            <ChevronRight
              size={11}
              strokeWidth={2.5}
              className={`transition-transform duration-200 ease-out-soft ${
                open ? 'rotate-90' : 'rotate-0'
              }`}
            />
            <span>{title}</span>
            {!open && typeof count === 'number' && (
              <span className="text-fg-muted tnum">({count})</span>
            )}
          </div>
          {subtitle && (
            <div className="mt-1 text-sm text-fg-secondary">{subtitle}</div>
          )}
        </div>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out-soft ${
          open ? 'grid-rows-[1fr] border-t border-border-subtle' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden" aria-hidden={!open}>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  )
}

function readPersisted(key: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(key)
    if (v === '1') return true
    if (v === '0') return false
  } catch {
    // ignore
  }
  return fallback
}

/** Pure helpers exposed for tests. Mirror the localStorage layout used
 *  by the component so tests can stub localStorage and verify behaviour
 *  without rendering React. */
export const SETTINGS_ACCORDION_KEY_PREFIX = KEY_PREFIX
export function settingsAccordionKey(storageKey: string): string {
  return KEY_PREFIX + storageKey + '.expanded'
}
