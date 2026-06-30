import type { SettingsCategory } from './settingsCategories'

// Pure, props-only category rail — a plain nav list (no panel chrome) that sizes
// to its items and sits at the top of its column; the gold active pill is the
// only surface, so short panes don't get a tall empty box. No persistence, no
// localStorage, no IPC — it renders the list, marks the active id, and calls
// onSelect; the parent owns active-category state + persistence. Portable to a
// web settings page unchanged.
//
// Active accent is GOLD (#d4af37 — brand/affordance), never profit-green /
// loss-red, which are reserved for P&L semantics.
interface SettingsRailProps {
  categories: SettingsCategory[]
  activeId: string
  onSelect: (id: string) => void
}

export default function SettingsRail({ categories, activeId, onSelect }: SettingsRailProps) {
  return (
    <nav
      aria-label="Settings categories"
      className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-visible"
    >
      {categories.map(({ id, label, icon: Icon }) => {
        const active = id === activeId
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={active ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ease-out-soft lg:w-full ${
              active
                ? 'bg-gold/[0.12] text-gold'
                : 'text-fg-secondary hover:bg-bg-3/40 hover:text-fg-primary'
            }`}
          >
            <Icon
              size={15}
              strokeWidth={2}
              aria-hidden
              className={active ? 'text-gold' : 'text-fg-tertiary'}
            />
            {label}
          </button>
        )
      })}
    </nav>
  )
}
