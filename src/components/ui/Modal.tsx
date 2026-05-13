import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: ReactNode
  /** Max content width in px. Defaults to 640. */
  width?: number
  children: ReactNode
  /** Right-slot action shown next to the close button. */
  headerRight?: ReactNode
  /** When true, the body has no padding — caller controls layout. */
  bodyPadded?: boolean
}

// MASTER §5.4 — portal modal. Backdrop 72% bg-0 + 4px blur, surface bg-3
// with 12px radius, 280ms enter on the modal-in keyframe.
export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  width = 640,
  children,
  headerRight,
  bodyPadded = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
    >
      <div
        className="absolute inset-0 bg-bg-0/72 backdrop-blur-[4px]"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[92vh] w-full flex-col rounded-lg border border-border bg-bg-3 shadow-lg animate-modal-in"
        style={{ maxWidth: width }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-gold">
              {title}
            </div>
            {subtitle && (
              <div className="mt-1 truncate text-sm text-fg-primary">
                {subtitle}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 ease-out-soft hover:border-border hover:text-fg-primary"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className={`flex-1 overflow-auto ${bodyPadded ? 'p-5' : ''}`}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
