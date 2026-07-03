// Beat 3.5 round 2 — the split-cents display figure for the balance
// surfaces. WRAPS money()'s output (the helper itself is untouched):
// dollars at the display size, '.cents' smaller in fg-secondary on the
// same baseline. THE TEXTCONTENT LAW (pinned): textContent equals
// money(value) byte-for-byte — adjacent spans, no whitespace nodes — so
// every '$1,037.82'-class copy pin in the app survives the styling.
// money() always emits exactly two decimals (Intl USD), so the split at
// the last '.' is total; negatives keep their sign in the dollars part.

import { money } from '@/lib/format'

interface MoneyFigureProps {
  value: number
  /** Display scale of the dollars part. Cents ride at ~55% via em. */
  size?: 'sm' | 'lg' | 'xl' | '4xl'
  className?: string
}

const SIZE: Record<NonNullable<MoneyFigureProps['size']>, string> = {
  sm: 'text-sm',
  lg: 'text-lg',
  xl: 'text-xl',
  '4xl': 'text-4xl',
}

export default function MoneyFigure({ value, size = 'lg', className = '' }: MoneyFigureProps) {
  const text = money(value)
  const dot = text.lastIndexOf('.')
  const dollars = text.slice(0, dot)
  const cents = text.slice(dot) // '.82'
  return (
    <span
      className={`font-mono font-bold tracking-tight tnum ${SIZE[size]} ${className}`}
    >{dollars}<span data-testid="money-cents" className="text-[0.55em] font-semibold text-fg-secondary">{cents}</span></span>
  )
}
