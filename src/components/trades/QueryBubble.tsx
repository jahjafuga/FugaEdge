import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import {
  resolveQuery,
  type ResolverVocabulary,
} from '@/core/trades/queryResolver'
import type { TradesFilterState } from '@/core/trades/tradesFilter'

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
    },
    [text, resolution, onCommit, onDraft, liveCount],
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

  return (
    <div
      ref={rootRef}
      className="fixed bottom-6 right-6 z-40"
      onKeyDown={open ? onKeyDown : undefined}
    >
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-[440px] rounded-lg border border-gold/30 bg-bg-3 p-3 shadow-lg">
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
              Hi, I&apos;m <span className="font-semibold text-gold">{HIQ_NAME}</span>. Ask your
              book: try &quot;china losers&quot; or &quot;float under 10m&quot;.
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
                  className="inline-flex h-6 items-center gap-1 rounded-full border border-gold/40 bg-gold/[0.08] px-2 text-[10px] font-semibold uppercase tracking-wider text-gold"
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
                  className="inline-flex h-6 cursor-pointer items-center rounded-full border border-border-subtle bg-bg-1 px-2 font-mono text-[11px] text-fg-primary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
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
              <span className="font-mono text-fg-primary tnum">{liveCount}</span> trades match
            </span>
            <span>Enter applies · Esc cancels</span>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => (open ? close(true) : doOpen())}
        title={`${HIQ_NAME} - ask your book (Ctrl+K)`}
        className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-gold/40 bg-bg-3 px-4 text-xs font-semibold uppercase tracking-wider text-gold shadow-lg transition-colors duration-150 hover:border-gold/70 hover:bg-gold/[0.08]"
      >
        <Sparkles size={14} strokeWidth={2} />
        {HIQ_NAME}
      </button>
    </div>
  )
}
