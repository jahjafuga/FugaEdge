import { useEffect, useRef, useState } from 'react'

interface AnimatedNumberProps {
  value: number | null
  /** Receives the current animated value (or null/Infinity passed through). */
  format: (n: number | null) => string
  duration?: number
  className?: string
}

// Count-up animation from the last-displayed value → new value. Honors
// prefers-reduced-motion (snaps). null and non-finite values short-circuit
// the animation entirely so the formatter can render "—" / "N/A" / "∞".
export default function AnimatedNumber({
  value,
  format,
  duration = 600,
  className,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState<number | null>(
    value === null || !Number.isFinite(value) ? value : 0,
  )
  const fromRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => {
    if (value === null || !Number.isFinite(value)) {
      setDisplay(value)
      fromRef.current = 0
      return
    }

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const from = fromRef.current
    const to = value

    if (reduced || from === to) {
      setDisplay(to)
      fromRef.current = to
      return
    }

    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      const current = from + (to - from) * eased
      setDisplay(current)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration])

  return <span className={className}>{format(display)}</span>
}
