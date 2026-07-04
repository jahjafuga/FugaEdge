// Beat 4 — the mask marker for account-level dollars. The wrapper adds
// ONLY the 'masked-money' class (the CSS in index.css does the hiding
// under html.streamer); it renders a bare span around its children, so
// textContent is byte-unchanged — the pin-safety law. Per-share prices
// (price/fillLabel) never wear this marker by the Lao lock.

import type { ReactNode } from 'react'

export const MASKED_MONEY_CLASS = 'masked-money'

export default function MaskedMoney({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span className={className ? `${MASKED_MONEY_CLASS} ${className}` : MASKED_MONEY_CLASS}>
      {children}
    </span>
  )
}
