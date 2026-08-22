import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import {
  resolveQuery,
  type ResolverVocabulary,
} from '@/core/trades/queryResolver'
import { isFiltering, type TradesFilterState } from '@/core/trades/tradesFilter'

// v0.2.7 — HiQ. The query resolver's face, re-homed from a filter-bar button
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
//          Enter and click-away commit, ambiguity offered never picked,
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

export const HIQ_NAME = 'HiQ'

/** The AnimatedNumber matchMedia pattern: reduced motion strips every
 *  [data-hiq-anim] hook so the reduced path is STRUCTURAL — asserted by test,
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
          <span key={`${i}-${ch}`} data-hiq-anim className="hiq-digit">
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
  /** Push the candidate up (null = no draft — closed or empty). */
  onDraft: (draft: TradesFilterState | null) => void
  onCommit: (next: TradesFilterState) => void
}

export default function QueryBubble({
  committed,
  vocab,
  liveCount,
  onDraft,
  onCommit,
}: QueryBubbleProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  /** Session-only conversation log. Commits append; previews never do. */
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const reduced = useReducedMotion()
  const committedActive = isFiltering(committed)
  /** Closing ghost: the panel's collapse is drawn by an input-less shell so
   *  the REAL close is instant (the K battery asserts the input is gone the
   *  same tick). null = no ghost; 'commit' | 'discard' pick the speed. */
  const [ghost, setGhost] = useState<null | 'commit' | 'discard'>(null)
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
  }, [committed])

  const close = useCallback(
    (commit: boolean) => {
      if (commit && text.trim() !== '') {
        onCommit(resolution.state)
        // H2 — the exchange logs ON COMMIT, verbatim ask + response line.
        const what = resolution.applied.length > 0 ? ' - ' + resolution.applied.join(', ') : ''
        setExchanges((xs) => [
          ...xs,
          { ask: text.trim(), response: `${liveCount} trade${liveCount === 1 ? '' : 's'}${what}` },
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

  // Click-away COMMITS — the guarded dropdown idiom, mounted while open.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(true)
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

  /** Animation hook attacher — the whole skin flows through this so the
   *  reduced path strips every hook in one place. */
  const anim = (cls: string) => (reduced ? {} : { 'data-hiq-anim': true, className: cls })
  const animCls = (cls: string) => (reduced ? '' : cls)

  return (
    <div
      ref={rootRef}
      className="fixed bottom-6 right-6 z-40"
      onKeyDown={open ? onKeyDown : undefined}
    >
      {open && (
        <div
          {...(reduced ? {} : { 'data-hiq-anim': true })}
          className={`absolute bottom-full right-0 mb-2 w-[440px] origin-bottom-right rounded-lg border border-gold/40 bg-bg-3/95 p-3 shadow-lg backdrop-blur-sm ${animCls('hiq-panel-in')}`}
          style={{ boxShadow: '0 0 0 1px rgb(var(--gold) / 0.15), 0 0 24px rgb(var(--gold) / 0.10), 0 12px 32px rgb(0 0 0 / 0.45)' }}
        >
          {/* the wordmark — small, top-left, monogram beside it */}
          <div className="mb-2 flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gold/50 text-[8px] font-bold text-gold">
              {HIQ_NAME[0]}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gold">{HIQ_NAME}</span>
          </div>
          {/* the conversation so far — session-only, commits only */}
          {exchanges.length > 0 && (
            <div className="mb-2 max-h-[180px] space-y-2 overflow-auto border-b border-border-subtle pb-2">
              {exchanges.map((x, i) => (
                <div key={i} className="text-xs">
                  <div data-hiq-ask className="text-fg-primary">{x.ask}</div>
                  <div className="text-fg-tertiary">{x.response}</div>
                </div>
              ))}
            </div>
          )}

          {/* the greeting — teaches two grammar shapes, signed by the name */}
          {exchanges.length === 0 && text === '' && (
            <div className="mb-2 text-xs text-fg-secondary">
              <span {...anim('hiq-greet-line')} style={reduced ? undefined : { animationDelay: '0ms' }}>
                Hi, I&apos;m <span className="font-semibold text-gold">{HIQ_NAME}</span>.{' '}
              </span>
              <span {...anim('hiq-greet-line')} style={reduced ? undefined : { animationDelay: '80ms' }}>
                Ask your book: try &quot;china losers&quot; or &quot;float under 10m&quot;.
              </span>
            </div>
          )}

          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Ask ${HIQ_NAME}...`}
            aria-label="Ask HiQ"
            className="w-full rounded-md border border-border-strong bg-bg-1 px-3 py-2 text-sm text-fg-primary placeholder:text-fg-muted outline-none transition-colors duration-150 focus:border-gold"
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
                  {...(reduced ? {} : { 'data-hiq-anim': true })}
                  className={`inline-flex h-6 items-center gap-1 rounded-full border border-gold/40 bg-gold/[0.08] px-2 text-[10px] font-semibold uppercase tracking-wider text-gold ${animCls('hiq-chip')}`}
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

          {/* ambiguity — offered, never picked */}
          {resolution.ambiguous.map((a) => (
            <div key={a.text} className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-fg-tertiary">&quot;{a.text}&quot; could mean</span>
              {a.candidates.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pick(a.text, c)}
                  {...(reduced ? {} : { 'data-hiq-anim': true })}
                  style={reduced ? undefined : { animationDelay: `${a.candidates.indexOf(c) * 40}ms` }}
                  className={`inline-flex h-6 cursor-pointer items-center rounded-full border border-gold/40 bg-bg-1 px-2 font-mono text-[11px] text-fg-primary transition-colors duration-150 hover:border-gold/70 hover:text-gold ${animCls('hiq-pill')}`}
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

      {/* the closing ghost — an input-less shell drawing the collapse; the
          real close was instant. aria-hidden, no pointer, self-removing. */}
      {ghost && (
        <div
          aria-hidden="true"
          data-hiq-anim
          onAnimationEnd={() => setGhost(null)}
          className={`pointer-events-none absolute bottom-full right-0 mb-2 h-24 w-[440px] origin-bottom-right rounded-lg border border-gold/40 bg-bg-3/95 ${ghost === 'commit' ? 'hiq-panel-out' : 'hiq-panel-out-fast'}`}
        />
      )}

      <button
        type="button"
        onClick={() => (open ? close(true) : doOpen())}
        title={`${HIQ_NAME} - ask your book (Ctrl+K)`}
        key={pulse}
        className={`relative inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-gold/50 bg-bg-3 text-gold transition-transform duration-150 ease-out-soft hover:scale-105 ${
          open ? animCls('hiq-fab-open') : animCls('hiq-fab')
        } ${pulse > 0 && !open && !reduced ? 'hiq-fab-pulse' : ''}`}
        {...(reduced ? {} : { 'data-hiq-anim': true })}
      >
        <span className="flex flex-col items-center leading-none">
          <Sparkles size={12} strokeWidth={2} />
          <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wide">{HIQ_NAME}</span>
        </span>
        {/* HiQ remembering — a filter is active on the committed state */}
        {committedActive && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-gold shadow-[0_0_6px_rgb(var(--gold)/0.8)]" />
        )}
      </button>
    </div>
  )
}
