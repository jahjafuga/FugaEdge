interface Tab<T extends string> {
  key: T
  label: string
  count?: number
}

interface TabBarProps<T extends string> {
  tabs: Tab<T>[]
  active: T
  onChange: (key: T) => void
}

// MASTER §5.5 — bottom-border 2px gold on active, color transition only,
// keyboard ←/→ via the parent if needed. Used by Reports + Analytics.
export default function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: TabBarProps<T>) {
  return (
    <div role="tablist" className="flex border-b border-border-subtle">
      {tabs.map((t) => {
        const isActive = active === t.key
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.key)}
            className={`relative cursor-pointer px-4 py-3 text-sm font-medium transition-colors duration-150 ease-out-soft ${
              isActive
                ? 'text-fg-primary'
                : 'text-fg-tertiary hover:text-fg-secondary'
            }`}
          >
            <span className="flex items-center gap-2">
              {t.label}
              {t.count != null && (
                <span className="font-mono text-[10px] text-fg-muted tnum">
                  {t.count}
                </span>
              )}
            </span>
            {isActive && (
              <span className="absolute bottom-[-1px] left-2 right-2 h-[2px] rounded-t bg-gold" />
            )}
          </button>
        )
      })}
    </div>
  )
}
