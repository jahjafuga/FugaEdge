import iconUrl from '@/assets/fugaedge-icon.png'
import logoUrl from '@/assets/fugaedge-logo.png'

interface BrandMarkProps {
  /**
   * - `mark`: the gold F-monogram + bull silhouette icon (square). Used for
   *   the sidebar tile and the Dashboard empty-state splash.
   * - `full`: the full logo with wordmark below. Used on larger empty-state
   *   screens that benefit from showing the brand name.
   */
  variant?: 'mark' | 'full'
  className?: string
}

export default function BrandMark({ variant = 'mark', className = '' }: BrandMarkProps) {
  const src = variant === 'full' ? logoUrl : iconUrl
  const defaultClass =
    variant === 'full' ? 'h-auto w-[160px]' : 'h-[42px] w-[42px]'
  return (
    <img
      src={src}
      alt="FugaEdge"
      className={className || defaultClass}
      draggable={false}
    />
  )
}
