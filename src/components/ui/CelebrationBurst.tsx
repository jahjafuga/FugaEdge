import { useEffect, useRef, useState, type CSSProperties } from 'react'

// v0.2.5 Phase B Session 6 (R1) — reusable one-shot GOLD celebration burst.
// CSS-only, NO library (D17 stays closed). Premium, not Vegas: gold-toned
// ONLY, one-shot (never loops), fully vanishes (no residue). Honors
// prefers-reduced-motion via this matchMedia guard (the AnimatedNumber pattern)
// AND the global index.css reset — reduced-motion users get ZERO particles +
// no flash; the badge / card / level state-change carries the moment.
//
// Fills its nearest positioned ancestor and bursts from that ancestor's centre.
// Page-wide moments mount it inside the fixed full-viewport overlay (see
// src/lib/celebration.tsx); modal-local moments (the weekly button) render it
// inside the modal with intensity="light". Bump `trigger` to fire a burst.

const FULL_COUNT = 48
const LIGHT_COUNT = 22
const DURATION_MS = 1500

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

interface Particle {
  id: number
  style: CSSProperties
}

export default function CelebrationBurst({
  trigger,
  intensity = 'full',
}: {
  trigger: number
  intensity?: 'full' | 'light'
}) {
  const [particles, setParticles] = useState<Particle[]>([])
  const timer = useRef(0)

  useEffect(() => {
    if (!trigger || prefersReducedMotion()) return
    const count = intensity === 'light' ? LIGHT_COUNT : FULL_COUNT
    const reach = intensity === 'light' ? 95 : 175
    const next: Particle[] = Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5
      const dist = reach * (0.45 + Math.random() * 0.55)
      const size = 10 + Math.random() * 4
      return {
        id: trigger * 1000 + i,
        style: {
          width: `${size.toFixed(1)}px`,
          height: `${size.toFixed(1)}px`,
          '--cb-dx': `${(Math.cos(angle) * dist).toFixed(1)}px`,
          '--cb-dy': `${(Math.sin(angle) * dist).toFixed(1)}px`,
          '--cb-rot': `${Math.round(Math.random() * 540 - 270)}deg`,
          animationDelay: `${Math.round(Math.random() * 90)}ms`,
        } as CSSProperties,
      }
    })
    setParticles(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setParticles([]), DURATION_MS)
    return () => window.clearTimeout(timer.current)
  }, [trigger, intensity])

  if (particles.length === 0) return null
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
      {intensity === 'full' && <span className="celebration-flash" />}
      {particles.map((p) => (
        <span key={p.id} className="celebration-particle" style={p.style} />
      ))}
    </div>
  )
}
