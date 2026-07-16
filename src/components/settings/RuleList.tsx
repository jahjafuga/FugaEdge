import { useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'

// Generic string-list editor (add / edit-in-place / remove / reorder). Its one
// consumer today is the Daily Rule Breaks vocabulary. Journal RULES use
// JournalRuleEditor (the id-stable {id,name,archived} model with rename-by-id
// + archive).
//
// BEAT 2 "STOP THE BLEEDING" — the FROZEN-ROW guard.
// Rule-breaks have no id and no archived flag: a day links to one by NAME
// (journal.rule_breaks) and Analytics groups by that raw string, so renaming or deleting a
// used label silently ORPHANS every day carrying it — it keeps counting in Analytics while
// vanishing from the vocabulary, un-restorable. Until Beat 3 ships a history-preserving
// rename + an archive model, a label used on >= 1 day is FROZEN: its input is read-only
// (which closes the per-keystroke rename vector at its source) and its delete is disabled.
// Unused labels are untouched — they behave exactly as before.
//
// Dave #12 — REORDER (the VocabularyEditor chevron pattern, ported): adjacent
// swap in the draft array with end-guards; the savebar persists, so there is
// no instant-IPC half and no busy state. POSITION IS NOT IDENTITY: the freeze
// keys on the label (usageByLabel), so frozen rows keep their read-only name,
// disabled delete, and day-count wherever they sit — their arrows stay LIVE.
interface RuleListProps {
  rules: string[]
  onChange: (next: string[]) => void
  /** label (trimmed) -> distinct journal days it is used on. Undefined while the count is
   *  still loading (or if the read failed): rows then behave exactly as they did before the
   *  guard existed. */
  usageByLabel?: Record<string, number>
}

export default function RuleList({ rules, onChange, usageByLabel }: RuleListProps) {
  const [draft, setDraft] = useState('')

  // Stable synthetic row ids — UI-only, never persisted. Index keys made a
  // moved row's DOM node stay put while VALUES swapped through it (focus and
  // in-flight edit state landed on the wrong label); label keys collide on the
  // transient duplicates the list legitimately allows. The ledger tracks ids
  // by position through every mutation THIS component performs (move / remove
  // / add keep it in sync before onChange re-renders); an external length
  // change (e.g. the savebar reload replacing the array) re-derives.
  const nextIdRef = useRef(0)
  const idsRef = useRef<number[]>([])
  if (idsRef.current.length !== rules.length) {
    const ids = idsRef.current.slice(0, rules.length)
    while (ids.length < rules.length) ids.push(nextIdRef.current++)
    idsRef.current = ids
  }

  // Trim BOTH sides. The write paths trim today, but a legacy or hand-edited value can drift;
  // if a stored " Overtrading " failed to match the vocabulary's "Overtrading", the guard would
  // read the row as UNUSED and let the user delete it — orphaning the very days it protects.
  // Drift can therefore only ever FREEZE a row, never free one.
  const daysUsed = (label: string): number => usageByLabel?.[label.trim()] ?? 0

  const updateAt = (i: number, text: string) => {
    const next = [...rules]
    next[i] = text
    onChange(next)
  }

  const remove = (i: number) => {
    const ids = [...idsRef.current]
    ids.splice(i, 1)
    idsRef.current = ids
    onChange(rules.filter((_, idx) => idx !== i))
  }

  // Adjacent swap with end-guards — the VocabularyEditor move(), minus the
  // IPC: the draft array swaps and the savebar persists. The id ledger swaps
  // in lockstep so the moved row keeps its DOM node (and any focus in it).
  const move = (i: number, dir: 'up' | 'down') => {
    const swap = dir === 'up' ? i - 1 : i + 1
    if (swap < 0 || swap >= rules.length) return
    const next = [...rules]
    ;[next[i], next[swap]] = [next[swap], next[i]]
    const ids = [...idsRef.current]
    ;[ids[i], ids[swap]] = [ids[swap], ids[i]]
    idsRef.current = ids
    onChange(next)
  }

  const commitDraft = () => {
    const v = draft.trim()
    if (!v) return
    idsRef.current = [...idsRef.current, nextIdRef.current++]
    onChange([...rules, v])
    setDraft('')
  }

  const onDraftKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitDraft()
    }
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border/40 overflow-hidden rounded-md border border-border-subtle/60 bg-bg-1/40">
        {rules.length === 0 && (
          <li className="px-4 py-3 text-center text-sm text-fg-tertiary">
            No rules yet. Add one below.
          </li>
        )}
        {rules.map((r, i) => {
          const used = daysUsed(r)
          const frozen = used > 0
          return (
            <li key={idsRef.current[i]} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label={`Move ${r} up`}
                    disabled={i === 0}
                    onClick={() => move(i, 'up')}
                    className="flex h-3.5 w-4 items-center justify-center text-fg-tertiary transition-colors hover:text-gold disabled:opacity-25 disabled:hover:text-fg-tertiary"
                  >
                    <ChevronUp size={12} strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${r} down`}
                    disabled={i === rules.length - 1}
                    onClick={() => move(i, 'down')}
                    className="flex h-3.5 w-4 items-center justify-center text-fg-tertiary transition-colors hover:text-gold disabled:opacity-25 disabled:hover:text-fg-tertiary"
                  >
                    <ChevronDown size={12} strokeWidth={2.5} />
                  </button>
                </div>
                <input
                  value={r}
                  readOnly={frozen}
                  // readOnly stops a real browser, but a programmatic change event would still
                  // reach onChange — so the guard is enforced here too, not just in the DOM.
                  onChange={(e) => {
                    if (frozen) return
                    updateAt(i, e.target.value)
                  }}
                  className={`flex-1 rounded-sm border border-transparent bg-transparent px-2 py-1 text-sm focus:border-gold focus:outline-none ${
                    frozen
                      ? 'cursor-not-allowed text-fg-tertiary'
                      : 'text-fg-primary'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (frozen) return
                    remove(i)
                  }}
                  disabled={frozen}
                  aria-label={
                    frozen ? `Cannot remove ${r} — used on ${used} days` : 'Remove rule'
                  }
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-border-subtle text-fg-tertiary transition-colors duration-150 hover:border-loss hover:text-loss disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border-subtle disabled:hover:text-fg-tertiary"
                >
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </div>
              {frozen && (
                <div className="mt-1 px-2 text-[11px] text-fg-tertiary">
                  used on {used} {used === 1 ? 'day' : 'days'}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-1 px-3 py-2 focus-within:border-gold">
        <Plus size={12} strokeWidth={2.5} className="text-fg-tertiary" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onDraftKey}
          placeholder="Add a rule (press Enter)"
          className="flex-1 bg-transparent text-sm text-fg-primary placeholder:text-fg-muted focus:outline-none"
        />
        <button
          type="button"
          onClick={commitDraft}
          disabled={!draft.trim()}
          className="rounded-sm border border-border-subtle px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-secondary transition-colors duration-150 hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
        >
          add
        </button>
      </div>
    </div>
  )
}
