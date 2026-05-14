import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import {
  TOUR_FLAG_KEY,
  TOUR_FORCE_KEY,
  TOUR_STEPS,
  type TourStep,
} from '@/core/tour'

interface ProductTourProps {
  onComplete: () => void
}

// PRODUCT TOUR
//
// Step-based overlay with a single semi-opaque backdrop ring (using a
// huge `box-shadow` to create the "everything outside the cutout is
// dimmed" effect) plus a tooltip card auto-positioned next to the target.
// All position math is recomputed on resize / scroll / step change.
//
// Behaviour:
//   - Steps without an anchor (chart-tab) render the tooltip centered
//     over the dimmed page with no cutout.
//   - Steps whose anchor element is missing from the DOM are auto-skipped
//     forward so a missing latest-session row doesn't strand the tour.
//   - Skip / Finish both set the localStorage flag and clear the force
//     token so a normal reload doesn't re-trigger.

const TOOLTIP_W = 340
const TOOLTIP_OFFSET = 14
const RING_PADDING = 6
const RING_RADIUS = 8

interface TargetRect {
  top: number
  left: number
  width: number
  height: number
}

interface TooltipPosition {
  top: number
  left: number
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center'
}

export default function ProductTour({ onComplete }: ProductTourProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const [tooltipHeight, setTooltipHeight] = useState(160)
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>({
    top: 0,
    left: 0,
    placement: 'center',
  })
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Resolve the current step, auto-skipping any whose anchor element
  // doesn't exist. Returns null only if every remaining step is missing
  // its anchor — at which point we finish the tour silently.
  const resolvedStep = useMemo<{ step: TourStep; index: number } | null>(() => {
    let i = stepIndex
    while (i < TOUR_STEPS.length) {
      const step = TOUR_STEPS[i]
      if (!step.anchor) return { step, index: i }
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`)
      if (el) return { step, index: i }
      i++
    }
    return null
  }, [stepIndex])

  const step = resolvedStep?.step ?? null
  const visibleIndex = resolvedStep?.index ?? stepIndex
  const isLast = visibleIndex === TOUR_STEPS.length - 1

  // If the resolver skipped past one or more missing-anchor steps, sync
  // the stepIndex forward so the indicator + Next math reflect reality.
  useEffect(() => {
    if (resolvedStep && resolvedStep.index !== stepIndex) {
      setStepIndex(resolvedStep.index)
    } else if (!resolvedStep) {
      // No remaining steps have anchors — bail out cleanly.
      finish()
    }
    // We intentionally only depend on resolvedStep — finish has stable
    // identity via useCallback below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedStep])

  const measure = useCallback(() => {
    if (!step) {
      setTargetRect(null)
      return
    }
    if (!step.anchor) {
      setTargetRect(null)
      return
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`)
    if (!el) {
      setTargetRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [step])

  // Initial + on-step measurement. Scrolls the anchor into view first so
  // tall pages don't leave the cutout offscreen.
  useLayoutEffect(() => {
    if (!step) return
    if (step.anchor) {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      // The smooth scroll settles asynchronously — re-measure on each
      // frame for a short window so the cutout follows the element.
      let frames = 0
      const tick = () => {
        measure()
        if (frames++ < 30) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    } else {
      setTargetRect(null)
    }
  }, [step, measure])

  // Keep the rect synced on resize + scroll (capture catches nested
  // scroll containers, e.g. the dashboard's overflow-y-auto wrapper).
  useEffect(() => {
    const onChange = () => measure()
    window.addEventListener('resize', onChange)
    window.addEventListener('scroll', onChange, true)
    return () => {
      window.removeEventListener('resize', onChange)
      window.removeEventListener('scroll', onChange, true)
    }
  }, [measure])

  // Tooltip height feedback — once the card renders we know its height
  // and can decide between above / below / left / right placements.
  useLayoutEffect(() => {
    if (!tooltipRef.current) return
    const h = tooltipRef.current.getBoundingClientRect().height
    if (h && Math.abs(h - tooltipHeight) > 1) setTooltipHeight(h)
  }, [step, tooltipHeight])

  // Position the tooltip given the target rect + measured tooltip height.
  useLayoutEffect(() => {
    if (!step) return
    if (!targetRect) {
      // Centered fallback for no-anchor steps (or while the rect is
      // still being computed).
      setTooltipPos({
        top: Math.max(24, (window.innerHeight - tooltipHeight) / 2),
        left: Math.max(24, (window.innerWidth - TOOLTIP_W) / 2),
        placement: 'center',
      })
      return
    }
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 12
    // Preferred placement: below, then above, then right, then left,
    // finally a centered fallback that overlays the page.
    const canBelow = targetRect.top + targetRect.height + TOOLTIP_OFFSET + tooltipHeight + margin < vh
    const canAbove = targetRect.top - TOOLTIP_OFFSET - tooltipHeight - margin > 0
    const canRight = targetRect.left + targetRect.width + TOOLTIP_OFFSET + TOOLTIP_W + margin < vw
    const canLeft  = targetRect.left - TOOLTIP_OFFSET - TOOLTIP_W - margin > 0

    let placement: TooltipPosition['placement']
    let top: number
    let left: number
    if (canBelow) {
      placement = 'bottom'
      top = targetRect.top + targetRect.height + TOOLTIP_OFFSET
      left = clamp(
        targetRect.left + targetRect.width / 2 - TOOLTIP_W / 2,
        margin,
        vw - TOOLTIP_W - margin,
      )
    } else if (canAbove) {
      placement = 'top'
      top = targetRect.top - TOOLTIP_OFFSET - tooltipHeight
      left = clamp(
        targetRect.left + targetRect.width / 2 - TOOLTIP_W / 2,
        margin,
        vw - TOOLTIP_W - margin,
      )
    } else if (canRight) {
      placement = 'right'
      top = clamp(
        targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
        margin,
        vh - tooltipHeight - margin,
      )
      left = targetRect.left + targetRect.width + TOOLTIP_OFFSET
    } else if (canLeft) {
      placement = 'left'
      top = clamp(
        targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
        margin,
        vh - tooltipHeight - margin,
      )
      left = targetRect.left - TOOLTIP_OFFSET - TOOLTIP_W
    } else {
      placement = 'center'
      top = Math.max(margin, (vh - tooltipHeight) / 2)
      left = Math.max(margin, (vw - TOOLTIP_W) / 2)
    }
    setTooltipPos({ top, left, placement })
  }, [targetRect, tooltipHeight, step])

  const next = () => {
    if (isLast) {
      finish()
    } else {
      setStepIndex((i) => Math.min(i + 1, TOUR_STEPS.length - 1))
    }
  }
  const back = () => setStepIndex((i) => Math.max(i - 1, 0))

  const finish = useCallback(() => {
    window.localStorage.setItem(TOUR_FLAG_KEY, 'true')
    window.localStorage.removeItem(TOUR_FORCE_KEY)
    onComplete()
  }, [onComplete])

  // Esc cancels the tour (treated as Skip).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        finish()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish])

  if (!step) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
      className="fixed inset-0 z-[60]"
    >
      {/* The cutout: a transparent element sized to the target rect with
          a giant box-shadow that paints the rest of the viewport. When no
          anchor is set, render a plain dimmed backdrop instead. */}
      {targetRect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute transition-all duration-[250ms] ease-out"
          style={{
            top: targetRect.top - RING_PADDING,
            left: targetRect.left - RING_PADDING,
            width: targetRect.width + RING_PADDING * 2,
            height: targetRect.height + RING_PADDING * 2,
            borderRadius: RING_RADIUS,
            boxShadow:
              '0 0 0 9999px rgba(0, 0, 0, 0.62), 0 0 0 2px rgb(var(--gold)), 0 0 24px 4px rgba(212, 175, 55, 0.45)',
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-auto absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Top-right HUD: step indicator + skip */}
      <div className="absolute right-4 top-4 z-[61] flex items-center gap-3">
        <span className="text-[10px] uppercase tracking-wider text-fg-secondary">
          Step {visibleIndex + 1} of {TOUR_STEPS.length}
        </span>
        <button
          type="button"
          onClick={finish}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border-strong bg-bg-2 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-fg-secondary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
        >
          <X size={11} strokeWidth={2.25} />
          Skip
        </button>
      </div>

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className="absolute z-[62] rounded-lg border border-border-subtle bg-bg-2 p-5 shadow-lg transition-[top,left] duration-[250ms] ease-out"
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
          width: TOOLTIP_W,
        }}
      >
        <h2 className="text-base font-semibold tracking-tight text-fg-primary">
          {step.title}
        </h2>
        <p className="mt-2 text-sm text-fg-secondary">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border-subtle pt-3">
          <span className="text-[10px] uppercase tracking-wider text-fg-tertiary">
            {step.id}
          </span>
          <div className="flex items-center gap-2">
            {visibleIndex > 0 && (
              <button
                type="button"
                onClick={back}
                className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-border-strong bg-bg-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-fg-secondary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
              >
                <ArrowLeft size={11} strokeWidth={2.25} />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-gold px-3 text-[10px] font-semibold uppercase tracking-wider text-accent-ink transition-colors duration-150 hover:bg-gold-hover"
            >
              {isLast ? (step.finalLabel ?? 'Finish') : 'Next'}
              {!isLast && <ArrowRight size={11} strokeWidth={2.25} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}
