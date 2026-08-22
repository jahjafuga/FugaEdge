import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import {
  resolveQuery,
  type ResolverVocabulary,
} from '@/core/trades/queryResolver'
import type { TradesFilterState } from '@/core/trades/tradesFilter'

// v0.2.7 — THE BUBBLE. The query resolver's face on the Trades page.
//
// THE RULINGS this surface exists to honour:
//   B1  LIVE CANDIDATE. Every keystroke re-resolves the whole text against
//       the snapshot into a CANDIDATE state, pushed up through onDraft — the
//       page filters by the draft, so the table and the header count are the
//       candidate, live. Resolution plus a full filter pass costs a fraction
//       of a millisecond; there is nothing to debounce.
//   B2  ESCAPE RESTORES the state captured at open (the draft is simply
//       dropped — the committed state was never touched). Enter and
//       click-away COMMIT. Either way the bubble closes.
//   B3  AMBIGUITY IS OFFERED. The resolver names candidates and picks none;
//       clicking one EDITS THE TEXT — the ambiguous token becomes the picked
//       word, which then resolves exactly, becomes a chip, and stays
//       re-editable like anything else typed.
//   B4  UNRESOLVED IS SHOWN, verbatim, muted, no error tone. It is the seam
//       where a model sits later, and it must read as "not understood YET",
//       never as the user's mistake.
//
// ESCAPE DISCIPLINE — DetailModalShell's lesson, taken one step further. Its
// comment records that two document listeners cannot stop each other with
// stopPropagation, so guards must be explicit. This component therefore adds
// NO document keydown listener at all: Escape and Enter are handled on the
// bubble's own React subtree, and stopPropagation() there halts the native
// event at the React root — BEFORE it ever reaches the document-level
// listeners beneath (the table's bulk-clear, the dropdowns). K8 pins this
// with a probe listener. The only document listener is the mousedown-outside
// close, mounted while open — the dropdown idiom, commit-on-click-away.
//
// Chips remove by SOURCE: the resolver reports the text behind every applied
// line, so removing a chip strips those words and re-resolves. The text field
// stays the single source of truth for the whole draft.

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
  // The state captured at open — B2's restore target. Held in a ref so the
  // committed prop updating mid-session cannot quietly move the snapshot.
  const snapshot = useRef<TradesFilterState>(committed)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const resolution = useMemo(
    () => resolveQuery(text, vocab, new Date(), snapshot.current),
    [text, vocab, open], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // B1 — the candidate goes up whenever it changes; down to null on close.
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
      if (commit && text.trim() !== '') onCommit(resolution.state)
      setText('')
      setOpen(false)
      onDraft(null)
    },
    [text, resolution, onCommit, onDraft],
  )

  // The shortcut — both modifier styles, registered the way Ctrl+B is:
  // window keydown, skipped while an input/textarea/contenteditable has
  // focus so typing a literal Ctrl+K in a notes field does nothing.
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

  // Click-away COMMITS (B2) — the guarded dropdown idiom, mounted while open.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(true)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, close])

  // Autofocus on open.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  /** Remove one applied chip: strip its source words, re-resolve (B5). */
  const removeSource = (source: string) => {
    const pattern = new RegExp(`(^|\\s)${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i')
    setText((t) => t.replace(pattern, ' ').replace(/\s+/g, ' ').trim())
    inputRef.current?.focus()
  }

  /** Resolve an ambiguity by EDITING THE TEXT — the pick becomes the word. */
  const pick = (ambiguousText: string, candidate: string) => {
    const pattern = new RegExp(`(^|\\s)${ambiguousText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i')
    setText((t) => t.replace(pattern, `$1${candidate}`))
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Halt the native event at the React root so the document listeners
      // beneath (bulk-clear, dropdowns) never see it — the bubble only.
      e.stopPropagation()
      e.preventDefault()
      close(false)
    } else if (e.key === 'Enter') {
      e.stopPropagation()
      close(true)
    }
  }

  return (
    <div ref={rootRef} className="relative" onKeyDown={open ? onKeyDown : undefined}>
      <button
        type="button"
        onClick={() => (open ? close(true) : doOpen())}
        title="Ask your book (Ctrl+K)"
        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border-subtle bg-bg-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
      >
        <Sparkles size={12} strokeWidth={2} />
        Ask
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-[420px] rounded-md border border-border-subtle bg-bg-3 p-3 shadow-lg">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask your book — try: china losers, float under 10m"
            aria-label="Ask your book"
            className="w-full rounded-md border border-border-strong bg-bg-1 px-3 py-2 text-sm text-fg-primary placeholder:text-fg-muted outline-none transition-colors duration-150 focus:border-gold"
          />

          {/* applied chips — each removable, removal re-resolves (B5) */}
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

          {/* ambiguity — offered, never picked (B3) */}
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

          {/* the seam — verbatim, muted, no error tone (B4) */}
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
    </div>
  )
}
