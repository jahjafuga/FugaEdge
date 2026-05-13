import type { ReactNode } from 'react'

interface PageShellProps {
  /** Kept for backwards compatibility — the TopBar owns the route name. */
  title?: string
  /** Soft secondary line above the page content. */
  subtitle?: ReactNode
  children?: ReactNode
}

export default function PageShell({ subtitle, children }: PageShellProps) {
  return (
    <div className="mx-auto max-w-[1600px]">
      {subtitle && (
        <div className="mb-5 text-sm text-fg-tertiary">{subtitle}</div>
      )}
      {children ?? (
        <div className="rounded-lg border border-border-subtle bg-bg-2 px-6 py-16 text-center text-sm text-fg-muted">
          Nothing to show here yet.
        </div>
      )}
    </div>
  )
}
