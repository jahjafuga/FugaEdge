import { KeyRound } from 'lucide-react'
import { ACTIVATION_STRINGS as S } from '@/core/activation/strings'
import type { ActivationMode } from '@/core/activation/status'

// v0.2.5 §C grace banner. Placement: AppLayout-level per the UpdateBanner
// precedent (visible on every page); mechanism: MaxLossBanner-style
// self-suppressing early return (A1 — renders nothing outside grace mode).
// The app stays fully functional during grace; this is a reminder, not a wall.

interface GraceBannerProps {
  mode: ActivationMode | null
  daysLeft: number
  onEnterKey: () => void
}

export default function GraceBanner({ mode, daysLeft, onEnterKey }: GraceBannerProps) {
  if (mode !== 'grace') return null

  return (
    <div
      role="status"
      className="flex items-center gap-3 border-b border-gold/30 bg-gold/[0.07] px-6 py-2.5"
    >
      <KeyRound size={16} strokeWidth={2} className="shrink-0 text-gold" />
      <div className="flex-1 text-sm text-fg-secondary">
        <span className="font-semibold text-fg-primary">
          {S.graceBanner(daysLeft)}
        </span>{' '}
        <span className="text-fg-tertiary">{S.graceBannerBody}</span>
      </div>
      <button
        type="button"
        onClick={onEnterKey}
        className="inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md bg-gold px-3 text-xs font-semibold text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-gold-hover active:bg-gold-dim"
      >
        {S.graceCta}
      </button>
    </div>
  )
}
