import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  resolveQuery,
  type ResolverVocabulary,
} from '@/core/trades/queryResolver'
import { countOffers, dedupeOffers, responseLine } from '@/core/trades/queryResponse'
import { answerText, type RowForAnswer } from '@/core/trades/queryAnswer'
import {
  countUnmeasuredKept,
  isFiltering,
  type TradesFilterState,
} from '@/core/trades/tradesFilter'
import type { TradeListRow } from '@shared/trades-types'
import {
  clampEdgePosition,
  readEdgePosition,
  writeEdgePosition,
  type EdgePosition,
} from '@/lib/prefs/edgePosition'

// v0.2.7 — Edge. The query resolver's face, re-homed from a filter-bar button
// to a PRESENCE: a floating trigger at the bottom-right of the Trades content
// whose panel expands upward from it. One presence, one shortcut — the bar's
// ASK button is retired.
//
// THE NAME lives in one constant. The trigger wears it, the greeting signs
// it, the input is labelled by it (which is also the structural hook the
// tests and the self-photography harness both query — visible, not merely
// reachable, per the falsification lesson).
//
// THE RULINGS, carried over intact and extended:
//   B1-B4  unchanged from the first home: live candidate, Escape restores /
//          Enter commits (click-away now DISCARDS), ambiguity offered never
//          picked,
//          unresolved shown verbatim and muted.
//   H2     CONVERSATION SURFACE. A greeting teaches two grammar shapes on
//          open. Every COMMITTED ask appends an exchange to a session-only
//          log — the ask verbatim, then the response line (count + what
//          applied). Previews never log; commits do.
//   H3     NO FAKE LATENCY. Local resolution is synchronous and renders
//          immediately — no timer sits anywhere in the local path. The
//          `pending` state below is the FUTURE MODEL SEAM: it renders only
//          when a resolution genuinely awaits something, which today is
//          never. Pinned by a frozen-timer test.
//   H6     Brand gold on the presence; green and red stay P&L-only.
//
// Positioning: `fixed` — the layout has no transformed ancestor (measured:
// main is `relative isolate overflow-hidden`; isolate makes a stacking
// context but only transform/filter would re-root fixed), so the trigger
// anchors to the viewport at right-6 bottom-6, clear of the page scroll
// gutter, z-40 beneath every modal layer. No portal needed.

export const EDGE_NAME = 'Edge'

/** S3 — the FAB's vertical footprint the table must clear: bottom offset 24
 *  + disc 48 + breathing room 16. TradesTable pads its scroll container by
 *  this so no last row ever hides beneath the disc. */
export const EDGE_FAB_CLEARANCE_PX = 88

/** D1 — the line between a CLICK and a CARRY. Movement under this many
 *  pixels is a click and opens; over it is a drag and never opens. */
export const EDGE_DRAG_THRESHOLD_PX = 5

/** The disc's box and the house margin — the clamp's inputs. */
const DISC_PX = 48
const MARGIN_PX = 24
/** Panel footprint estimates for the flip decision (D4). Width is the shared
 *  --edge-panel-w value; height is a working estimate — the flip only needs
 *  to know whether a panel roughly this tall fits above the disc. */
const PANEL_W_PX = 440
const PANEL_EST_H_PX = 320

type EdgePlace = { v: 'up' | 'down'; h: 'right' | 'left' }

/** D4 — where the panel lives relative to the disc, from the LIVE position.
 *  null position = the default corner = the classic up-right. */
function placeFor(pos: EdgePosition | null, vw: number, vh: number): EdgePlace {
  if (!pos) return { v: 'up', h: 'right' }
  const v: EdgePlace['v'] = pos.y >= PANEL_EST_H_PX + MARGIN_PX ? 'up' : 'down'
  // 'right' = the panel's right edge aligns with the disc's (extends left);
  // it needs that much room to the left of the disc's right edge.
  const h: EdgePlace['h'] = pos.x + DISC_PX >= PANEL_W_PX + MARGIN_PX ? 'right' : 'left'
  void vh
  void vw
  return { v, h }
}

const PLACE_PANEL: Record<string, string> = {
  'up-right': 'bottom-full mb-2 right-0 origin-bottom-right',
  'up-left': 'bottom-full mb-2 left-0 origin-bottom-left',
  'down-right': 'top-full mt-2 right-0 origin-top-right',
  'down-left': 'top-full mt-2 left-0 origin-top-left',
}

/** S2 — the mark the disc wears. ONE constant selects among three shipped
 *  candidates; the founder rules from the frames and the swap is this line.
 *  (The capture harness may override per shot via window.__edgeMarkOverride —
 *  dev-only, so all three can be photographed without three commits.) */
export type EdgeMarkKind = 'swoosh' | 'monogram' | 'loop' | 'loupe'
// FOUNDER-RULED from the frames: the mark is the LOUPE - the thing that
// finds. The other candidates stay shipped behind the constant.
export const EDGE_MARK: EdgeMarkKind = 'loupe'

/** The three candidates, all tiny, all gold, all stroke-honest at disc scale.
 *  SWOOSH: an inline bezier echoing the aurora's curve — no logo-mark asset
 *  exists at this scale (the icon file is stroke clipart; the brand swoosh is
 *  a full-page background), so the mark is drawn, not scaled down.
 *  MONOGRAM: the E. LOOP: an open gold ring with a cut — the edge of the
 *  loop, a filter's aperture. */
export function Mark({ kind, size = 18 }: { kind: EdgeMarkKind; size?: number }) {
  if (kind === 'monogram') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
        <text
          x="10" y="15" textAnchor="middle"
          fontSize="15" fontWeight="800" fontFamily="inherit"
          fill="rgb(var(--gold))"
        >
          E
        </text>
      </svg>
    )
  }
  if (kind === 'loop') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
        <circle
          cx="10" cy="10" r="7"
          fill="none" stroke="rgb(var(--gold))" strokeWidth="2.2"
          strokeLinecap="round" strokeDasharray="33 11" strokeDashoffset="8"
        />
      </svg>
    )
  }
  if (kind === 'loupe') {
    // THE LOUPE - ring + handle toward the disc's lower-right, house stroke
    // weight. NO glass-glint arc: at sixteen pixels inside a forty-eight
    // pixel disc a one-pixel glint reads as noise, not glass - legibility
    // won (judged at disc scale, stated in the beat).
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
        <circle
          cx="8.5" cy="8.5" r="5.5"
          fill="none" stroke="rgb(var(--gold))" strokeWidth="2.2"
        />
        <path
          d="M12.6 12.6 L17 17"
          fill="none" stroke="rgb(var(--gold))" strokeWidth="2.4" strokeLinecap="round"
        />
      </svg>
    )
  }
  // swoosh — two nested curves, the aurora's gesture at 20px
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M2 14 C 7 15.5, 13 12, 18 4"
        fill="none" stroke="rgb(var(--gold))" strokeWidth="2.2" strokeLinecap="round"
      />
      <path
        d="M4 17 C 9 17.5, 14 15, 17.5 10"
        fill="none" stroke="rgb(var(--gold) / 0.45)" strokeWidth="1.6" strokeLinecap="round"
      />
    </svg>
  )
}

/** The AnimatedNumber matchMedia pattern: reduced motion strips every
 *  [data-edge-anim] hook so the reduced path is STRUCTURAL — asserted by test,
 *  not just visually instant. jsdom has no matchMedia; optional-chain to
 *  "not reduced" there. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(
    () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

/** THE MOTION LAW made a component: the NEW value is in the DOM the same tick
 *  it arrives — the roll only decorates. Each digit that changed remounts
 *  (key = position+char) and ticks up into place; unchanged digits hold
 *  still. Deliberately NOT AnimatedNumber: its count-up interpolates through
 *  wrong intermediate values, which gates the answer on an animation. */
export function Roll({ text, animate = true }: { text: string; animate?: boolean }) {
  // Reduce-aware HERE so every consumer — the panel's count, the page
  // header — strips its hooks without each caller knowing about motion.
  const reduced = useReducedMotion()
  const on = animate && !reduced
  return (
    <span className="inline-flex">
      {text.split('').map((ch, i) =>
        on ? (
          <span key={`${i}-${ch}`} data-edge-anim className="edge-digit">
            {ch}
          </span>
        ) : (
          <span key={`${i}-${ch}`}>{ch}</span>
        ),
      )}
    </span>
  )
}

interface Exchange {
  ask: string
  response: string
}

interface QueryBubbleProps {
  /** The committed filter state — the snapshot Escape restores to. */
  committed: TradesFilterState
  vocab: ResolverVocabulary
  /** The page's LIVE filtered count (the draft's while one exists). */
  liveCount: number
  /** v0.2.7 slice B -- the SAME rows the count was taken from. An answer
   *  computed over any other set would be a second number claiming to
   *  describe the first. Optional so every existing mount is unchanged;
   *  without it an answer ask still filters and simply says nothing. */
  liveRows?: readonly RowForAnswer[]
  /** v0.2.7 -- how many rows a RANGE dropped as never measured, ALREADY
   *  COUNTED by the page. It has to be: the count comes from the rows before
   *  the filter ran, and this component only ever sees the rows that
   *  survived it. Optional, so every existing mount is unchanged. */
  coverageOf?: (state: TradesFilterState) => { skipped: number; column: string } | null
  /** Push the candidate up (null = no draft — closed or empty). */
  onDraft: (draft: TradesFilterState | null) => void
  onCommit: (next: TradesFilterState) => void
}

export default function QueryBubble({
  committed,
  vocab,
  liveCount,
  liveRows,
  coverageOf,
  onDraft,
  onCommit,
}: QueryBubbleProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  /** Session-only conversation log. Commits append; previews never do. */
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const reduced = useReducedMotion()
  const committedActive = isFiltering(committed)
  // dev-only per-shot override for the capture harness; the constant rules
  const markKind: EdgeMarkKind =
    ((window as { __edgeMarkOverride?: EdgeMarkKind }).__edgeMarkOverride) ?? EDGE_MARK
  /** Closing ghost: the panel's collapse is drawn by an input-less shell so
   *  the REAL close is instant (the K battery asserts the input is gone the
   *  same tick). null = no ghost; 'commit' | 'discard' pick the speed. */
  const [ghost, setGhost] = useState<null | 'commit' | 'discard'>(null)
  /** L2 - the lens-becomes-panel morph on open: the same input-less,
   *  self-removing ghost idiom as the close, drawn as a ring expanding from
   *  the loupe's lens to the panel's hairline. Decoration only; the real
   *  panel opens the same tick. */
  const [lensGhost, setLensGhost] = useState(false)
  /** D2/D3 — the carried position; null = the default corner. Restored
   *  through the clamp so a stale blob can never strand the disc. */
  const [pos, setPos] = useState<EdgePosition | null>(() => {
    const stored = readEdgePosition()
    return stored
      ? clampEdgePosition(stored, window.innerWidth, window.innerHeight, DISC_PX, MARGIN_PX)
      : null
  })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{
    startX: number
    startY: number
    origX: number
    origY: number
    moved: boolean
  } | null>(null)
  const [pulse, setPulse] = useState(0)
  // The state captured at open — the restore target. Held in a ref so the
  // committed prop updating mid-session cannot quietly move the snapshot.
  const snapshot = useRef<TradesFilterState>(committed)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const resolution = useMemo(
    () => resolveQuery(text, vocab, new Date(), snapshot.current),
    [text, vocab, open], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // H3 — the future model seam. Local resolution is synchronous, so nothing
  // is ever pending today; when a model joins, THIS is the only flag that
  // may gate a working state. Never a timer.
  const pending = false

  // The candidate goes up whenever it changes; down to null on close.
  useEffect(() => {
    onDraft(open && text.trim() !== '' ? resolution.state : null)
  }, [open, text, resolution, onDraft])

  const doOpen = useCallback(() => {
    snapshot.current = committed
    setText('')
    setOpen(true)
    if (!reduced) setLensGhost(true)
  }, [committed, reduced])

  // ONE LIST, COMPUTED ONCE. The chips the trader sees and the number the
  // sentence quotes come from the same call, so they cannot drift apart.
  const offerKindOf = useCallback(
    (display: string, text: string) =>
      resolution.offerKinds?.get(`${text}${String.fromCharCode(0)}${display}`),
    [resolution.offerKinds],
  )
  const shownOffers = useMemo(
    () => dedupeOffers(resolution.ambiguous, offerKindOf),
    [resolution.ambiguous, offerKindOf],
  )
  const totalOffers = useMemo(
    () => countOffers(resolution.ambiguous, offerKindOf),
    [resolution.ambiguous, offerKindOf],
  )

  const close = useCallback(
    (commit: boolean) => {
      if (commit && text.trim() !== '') {
        onCommit(resolution.state)
        // H2 — the exchange logs ON COMMIT, verbatim ask + response line.
        // The line is built by pure core now. It used to be assembled here from
        // the count and the applied list alone, which could not tell "no filter
        // ran" apart from "a filter ran and matched everything" — so a query
        // that resolved to NOTHING logged the whole book and read as success.
        // `unresolved` is what makes the difference sayable, so it is threaded
        // in from the same resolution the state came from.
        setExchanges((xs) => [
          ...xs,
          {
            ask: text.trim(),
            response: responseLine({
              // A RANGE dropped these; only the page can count them.
              coverage: coverageOf ? coverageOf(resolution.state) : null,
              // An EXCLUSION kept these, so they are in the rows already here.
              excluded: countUnmeasuredKept(
                (liveRows ?? []) as unknown as readonly TradeListRow[],
                resolution.state,
              ),
              count: liveCount,
              // W1 -- the words the trader wrote, so the refusal can quote
              // the sentence instead of the span that failed.
              typed: text.trim(),
              // W4 and W5 -- the readings on offer, kept and total.
              offers: { shown: shownOffers.reduce((n, a) => n + a.candidates.length, 0), total: totalOffers },
              applied: resolution.applied,
              unresolved: resolution.unresolved,
              // The ask's limit, so the line can name the matched count AND
              // the shown one. Without it the response would report the
              // truncated number as the answer.
              limit: resolution.state.limit,
              // The state the ask composed ON and the state it produced. The
              // line makes claims about the state, and without these it made
              // them from `applied`, which only describes the ask -- so every
              // wording it wore was true on one path and false on another.
              before: snapshot.current,
              // The number, computed HERE from the rows the page is
              // showing -- not re-queried, not re-filtered.
              answer: answerText(resolution.answer, liveRows ?? []),
              after: resolution.state,
            }),
          },
        ])
      }
      setText('')
      setOpen(false)
      onDraft(null)
      if (!reduced) {
        setGhost(commit ? 'commit' : 'discard')
        if (commit) setPulse((n) => n + 1)
      }
    },
    [text, resolution, onCommit, onDraft, liveCount, reduced],
  )

  // The shortcut — both modifier styles, the Ctrl+B idiom: window keydown,
  // skipped while an input/textarea/contenteditable has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        const t = e.target as HTMLElement | null
        const tag = t?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return
        e.preventDefault()
        doOpen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doOpen])

  // Click-away DISCARDS. It used to commit, on the guarded-dropdown idiom, and
  // the bubble's own footer has read "Enter applies · Esc cancels" the whole
  // time — describing behaviour the code did not have. Committing on the way
  // out also installed a range chooser row from a query nobody finished, which
  // is how an empty FLOAT pair ended up living on the strip for good. Enter
  // applies; everything else backs out. The Edge disc itself sits INSIDE
  // rootRef, so its own click still commits through the pointer path below.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, close])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  /** Remove one applied chip: strip its source words, re-resolve. */
  const removeSource = (source: string) => {
    const pattern = new RegExp(`(^|\\s)${escapeRe(source)}(?=\\s|$)`, 'i')
    setText((t) => t.replace(pattern, ' ').replace(/\s+/g, ' ').trim())
    inputRef.current?.focus()
  }
  /** Resolve an ambiguity by EDITING THE TEXT — the pick becomes the word. */
  const pick = (ambiguousText: string, candidate: string) => {
    const pattern = new RegExp(`(^|\\s)${escapeRe(ambiguousText)}(?=\\s|$)`, 'i')
    setText((t) => t.replace(pattern, `$1${candidate}`))
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Halt the native event at the React root so document listeners beneath
      // (bulk-clear, dropdown closers) never see it.
      e.stopPropagation()
      e.preventDefault()
      close(false)
    } else if (e.key === 'Enter') {
      e.stopPropagation()
      close(true)
    }
  }

  /** D1/D2 — the carry. Pointer-only enhancement: down on the disc arms a
   *  potential drag; movement past the threshold makes it one (and suppresses
   *  the click); release snaps to the nearest vertical edge, clamped, and
   *  persists. jsdom carries no setPointerCapture — optional-chained, with
   *  window move/up listeners doing the real work (the dropdown idiom). */
  const onFabPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const origin = pos ?? {
      x: window.innerWidth - MARGIN_PX - DISC_PX,
      y: window.innerHeight - MARGIN_PX - DISC_PX,
    }
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: origin.x, origY: origin.y, moved: false }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    setDragging(true)
  }
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      if (!d.moved && Math.hypot(dx, dy) <= EDGE_DRAG_THRESHOLD_PX) return
      d.moved = true
      setPos(
        clampEdgePosition(
          { x: d.origX + dx, y: d.origY + dy },
          window.innerWidth, window.innerHeight, DISC_PX, MARGIN_PX,
        ),
      )
    }
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current
      dragRef.current = null
      setDragging(false)
      if (!d) return
      if (!d.moved) {
        // a click within the threshold — the disc's ordinary open/commit
        if (open) close(true)
        else doOpen()
        return
      }
      // D2 — snap to the nearest vertical edge, clamp, persist (D3)
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      const raw = { x: d.origX + dx, y: d.origY + dy }
      const clamped = clampEdgePosition(raw, window.innerWidth, window.innerHeight, DISC_PX, MARGIN_PX)
      const snapLeft = clamped.x + DISC_PX / 2 < window.innerWidth / 2
      const snapped = {
        x: snapLeft ? MARGIN_PX : window.innerWidth - MARGIN_PX - DISC_PX,
        y: clamped.y,
      }
      setPos(snapped)
      writeEdgePosition(snapped)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging, open, close, doOpen])

  const place = placeFor(pos, window.innerWidth, window.innerHeight)
  const placeKey = `${place.v}-${place.h}`
  const placeCls = PLACE_PANEL[placeKey]

  /** Animation hook attacher — the whole skin flows through this so the
   *  reduced path strips every hook in one place. */
  const anim = (cls: string) => (reduced ? {} : { 'data-edge-anim': true, className: cls })
  const animCls = (cls: string) => (reduced ? '' : cls)

  return (
    <div
      ref={rootRef}
      data-edge-root
      className={`fixed z-40 ${pos ? '' : 'bottom-6 right-6'} ${
        !dragging && !reduced ? 'edge-snap' : ''
      }`}
      style={{
        ['--edge-panel-w' as string]: `${PANEL_W_PX}px`,
        ...(pos ? { left: pos.x, top: pos.y } : {}),
      }}
      onKeyDown={open ? onKeyDown : undefined}
    >
      {open && (
        <div
          {...(reduced ? {} : { 'data-edge-anim': true })}
          data-edge-place={placeKey}
          className={`card-premium card-accent absolute w-[var(--edge-panel-w)] overflow-hidden p-3 ${placeCls} ${animCls('edge-panel-in')}`}
          style={{ boxShadow: '0 0 0 1px rgb(var(--gold) / 0.15), 0 0 24px rgb(var(--gold) / 0.10), 0 12px 32px rgb(0 0 0 / 0.45)' }}
        >
          {/* the wordmark — small, top-left, monogram beside it */}
          <div className="mb-2 flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gold/50 text-[8px] font-bold text-gold">
              {EDGE_NAME[0]}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gold">{EDGE_NAME}</span>
          </div>
          {/* the conversation so far — session-only, commits only */}
          {exchanges.length > 0 && (
            <div className="mb-2 max-h-[180px] space-y-2 overflow-auto border-b border-gold/10 pb-2">
              {exchanges.map((x, i) => (
                <div key={i} className="text-xs">
                  <div data-edge-ask className="text-fg-primary">{x.ask}</div>
                  <div className="text-fg-tertiary">{x.response}</div>
                </div>
              ))}
            </div>
          )}

          {/* the greeting — teaches two grammar shapes, signed by the name */}
          {exchanges.length === 0 && text === '' && (
            <div className="mb-2 text-xs text-fg-secondary">
              <span {...anim('edge-greet-line')} style={reduced ? undefined : { animationDelay: '0ms' }}>
                Hi, I&apos;m <span className="font-semibold text-gold">{EDGE_NAME}</span>.{' '}
              </span>
              <span {...anim('edge-greet-line')} style={reduced ? undefined : { animationDelay: '80ms' }}>
                Ask your book: try &quot;china losers&quot; or &quot;float under 10m&quot;.
              </span>
            </div>
          )}

          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Ask ${EDGE_NAME}...`}
            aria-label={`Ask ${EDGE_NAME}`}
            className="w-full rounded-md border border-gold/25 bg-bg-0/60 px-3 py-2 text-sm text-fg-primary placeholder:text-fg-muted outline-none transition-colors duration-150 focus:border-gold"
          />

          {/* the future model seam — renders ONLY when something truly awaits */}
          {pending && (
            <div className="mt-2 text-xs text-fg-muted">working on it...</div>
          )}

          {/* applied chips — each removable, removal re-resolves */}
          {resolution.applied.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {resolution.applied.map((label, i) => (
                <span
                  key={`${label}-${i}`}
                  {...(reduced ? {} : { 'data-edge-anim': true })}
                  className={`inline-flex h-6 items-center gap-1 rounded-full border border-gold/40 bg-gold/[0.08] px-2 text-[10px] font-semibold uppercase tracking-wider text-gold ${animCls('edge-chip')}`}
                >
                  {label}
                  <button
                    type="button"
                    aria-label={`remove ${label}`}
                    onClick={() => removeSource(resolution.appliedSources[i])}
                    className="inline-flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-full text-gold/70 hover:text-gold"
                  >
                    <X size={10} strokeWidth={2.5} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* ambiguity -- offered, never picked, deduplicated, and capped.
              THE SAME LIST THE SENTENCE COUNTS. If the bubble rendered one
              list and the line counted another the two would disagree on
              screen, which is the class of defect this whole campaign has
              been removing. */}
          {shownOffers.map((a) => (
            <div key={a.text} className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-fg-tertiary">&quot;{a.text}&quot; could mean</span>
              {a.candidates.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pick(a.text, c)}
                  {...(reduced ? {} : { 'data-edge-anim': true })}
                  style={reduced ? undefined : { animationDelay: `${a.candidates.indexOf(c) * 40}ms` }}
                  className={`inline-flex h-6 cursor-pointer items-center rounded-full border border-gold/40 bg-bg-0/50 px-2 font-mono text-[11px] text-fg-primary transition-colors duration-150 hover:border-gold/70 hover:text-gold ${animCls('edge-pill')}`}
                >
                  {c}
                </button>
              ))}
            </div>
          ))}

          {/* the seam — verbatim, muted, no error tone */}
          {resolution.unresolved.length > 0 && (
            <div className="mt-2 text-xs text-fg-muted">
              didn&apos;t match anything in this book:{' '}
              <span className="italic">{resolution.unresolved.join(' · ')}</span>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-fg-tertiary">
            <span>
              <span className="font-mono text-fg-primary tnum"><Roll text={String(liveCount)} /></span> trades match
            </span>
            <span>Enter applies · Esc cancels</span>
          </div>
        </div>
      )}

      {/* L2 - the open morph: lens expands to the panel's hairline. Same
          ghost idiom as the close - aria-hidden, no pointer, self-removing.
          End geometry derives from the shared panel vars (--edge-panel-w +
          --card-radius), never a hand-typed copy. */}
      {lensGhost && (
        <div
          aria-hidden="true"
          data-edge-lens
          data-edge-anim
          onAnimationEnd={() => setLensGhost(false)}
          data-edge-place={placeKey}
          className={`edge-lens-open pointer-events-none absolute h-24 w-[var(--edge-panel-w)] ${placeCls}`}
        />
      )}

      {/* the closing ghost — the same input-less, self-removing idiom. On
          COMMIT it is the reverse morph: hairline contracts back into the
          lens (L3), beside the existing pulse. Escape keeps the plain fast
          fade - a discard does not celebrate. */}
      {ghost && (
        <div
          aria-hidden="true"
          data-edge-anim
          {...(ghost === 'commit' ? { 'data-edge-lens': true } : {})}
          onAnimationEnd={() => setGhost(null)}
          className={
            ghost === 'commit'
              ? `edge-lens-close pointer-events-none absolute h-24 w-[var(--edge-panel-w)] ${placeCls}`
              : `card-premium pointer-events-none absolute h-24 w-[var(--edge-panel-w)] edge-panel-out-fast ${placeCls}`
          }
        />
      )}

      <button
        type="button"
        onPointerDown={onFabPointerDown}
        onClick={(e) => {
          // D6 — pointer opens are decided at pointerup (click vs carry);
          // this onClick serves the KEYBOARD path (Enter/Space on the
          // tabbable disc), where no pointer sequence ran.
          if (e.detail !== 0) return
          if (open) close(true)
          else doOpen()
        }}
        title={`${EDGE_NAME} - ask your book (Ctrl+K)`}
        key={pulse}
        data-edge-mark={markKind}
        className={`group relative inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-gold/50 bg-bg-0/90 text-gold backdrop-blur-sm transition-transform duration-150 ease-out-soft hover:scale-105 ${
          open ? animCls('edge-fab-open') : animCls('edge-fab')
        } ${pulse > 0 && !open && !reduced ? 'edge-fab-pulse' : ''}`}
        {...(reduced ? {} : { 'data-edge-anim': true })}
      >
        <span className="flex flex-col items-center leading-none">
          <span className={animCls('transition-transform duration-150 ease-out-soft group-hover:-rotate-6')}>
            <Mark kind={markKind} size={16} />
          </span>
          <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wide">{EDGE_NAME}</span>
        </span>
        {/* Edge remembering — a filter is active on the committed state */}
        {committedActive && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-gold shadow-[0_0_6px_rgb(var(--gold)/0.8)]" />
        )}
      </button>
    </div>
  )
}
