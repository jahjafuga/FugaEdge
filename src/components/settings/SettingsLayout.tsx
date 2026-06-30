import type { ReactNode } from 'react'
import SettingsRail from './SettingsRail'
import type { SettingsCategory } from './settingsCategories'

// Pure presentational shell: a full-height left category rail + a content column
// that flexes to fill the remaining width. ZERO electron / fs / better-sqlite3 /
// ipc imports — the rail config + the panes (children) + the page-level savebar
// slot come in via props only, so a future Next.js settings page reuses it
// unchanged. Owns NO state.
//
// The min-height fills the app's scroll area (viewport minus the topbar + page
// padding ≈ 8rem) so the rail reads as a real sidebar even when the active pane
// is short, and the savebar (pushed to the bottom of the content column) anchors
// to the bottom of the page rather than floating right under short content.
interface SettingsLayoutProps {
  categories: SettingsCategory[]
  activeId: string
  onSelect: (id: string) => void
  /** The category panes — ALL mounted; the caller toggles visibility per activeId. */
  children: ReactNode
  /** Page-level chrome (the sticky savebar). The caller renders it only when
   *  there are unsaved changes; null/undefined when clean. */
  savebar?: ReactNode
}

export default function SettingsLayout({
  categories,
  activeId,
  onSelect,
  children,
  savebar,
}: SettingsLayoutProps) {
  return (
    <div className="flex flex-col gap-5 lg:min-h-[calc(100vh-8rem)] lg:flex-row lg:gap-6">
      <aside className="lg:w-48 lg:shrink-0 lg:self-start">
        <SettingsRail categories={categories} activeId={activeId} onSelect={onSelect} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* pb gives the floating savebar clearance so it never covers a section's
            own Save button at the bottom of a tall pane (e.g. Trading). */}
        <div className="flex-1 pb-20">{children}</div>
        {savebar}
      </div>
    </div>
  )
}
