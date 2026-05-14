interface SectionHeaderProps {
  title: string
  description?: string
  /** Right-side slot for action buttons (e.g. "Print report"). */
  right?: React.ReactNode
}

// Uppercase small-caps + gold underline. Used at the top of each analytics
// tab as a category divider so tabs feel structured rather than a card pile.
export default function SectionHeader({
  title,
  description,
  right,
}: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gold/30 pb-2">
      <div className="min-w-0">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gold">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-xs text-subtle">{description}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}
