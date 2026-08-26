import { X } from 'lucide-react'

// v0.2.7 — a removable chip.
//
// WRITTEN, NOT EXTRACTED, and the reason is scope rather than taste. The only
// removable chip in the codebase is INLINE markup inside the Edge bubble
// (QueryBubble.tsx:534-549); every named chip component — RChip,
// SystemTierChip, UnclassifiedChip — is display-only, with no remove handler
// between them. Extracting the bubble's copy would mean editing QueryBubble on
// a beat whose scope is the panel, so this is a new component that deliberately
// mirrors that markup. If the bubble is ever refactored onto this, the two are
// already the same shape.

export default function ExcludeChip({
  label,
  onRemove,
  testId,
}: {
  label: string
  onRemove: () => void
  testId?: string
}) {
  return (
    <span
      data-testid={testId}
      className="inline-flex h-6 items-center gap-1 rounded-full border border-loss/40 bg-loss/[0.08] px-2 text-[10px] font-semibold uppercase tracking-wider text-loss"
    >
      {label}
      <button
        type="button"
        aria-label={`remove exclusion ${label}`}
        onClick={onRemove}
        className="inline-flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-full text-loss/70 transition-colors duration-150 hover:text-loss"
      >
        <X size={10} strokeWidth={2.5} />
      </button>
    </span>
  )
}
