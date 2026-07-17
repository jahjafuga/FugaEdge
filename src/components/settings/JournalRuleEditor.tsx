import { useState, type KeyboardEvent } from 'react'
import { Archive, ArchiveRestore, Plus, Trash2 } from 'lucide-react'
import type { JournalRule } from '@shared/journal-types'
import { makeJournalRule } from '@/core/journal/rules'

interface JournalRuleEditorProps {
  rules: JournalRule[]
  onChange: (next: JournalRule[]) => void
  /** rule id -> distinct journal days it is marked on (the Remove guard's
   *  read; THE FINAL TWO build A). Undefined while loading (or if the read
   *  failed): rows then behave exactly as before the guard existed. */
  usageById?: Record<string, number>
}

// Journal-rule editor over the id-stable model. Renaming mutates a rule's name
// but KEEPS its id, so per-day history (stored by id) survives — the core fix.
// Archive (set archived:true) is the SAFE retire: the rule leaves the active
// checklist but its id + history are preserved. Remove is GUARDED (THE FINAL
// TWO, build A): a rule marked on >= 1 day cannot be removed — the button
// disables with the day count and points at archive (the RuleList frozen-row
// idiom); unused rules remove freely; archived-but-used rules are guarded the
// same way. Distinct from the generic string-list RuleList (plain day tags).
export default function JournalRuleEditor({ rules, onChange, usageById }: JournalRuleEditorProps) {
  const [draft, setDraft] = useState('')

  // Keyed by the STABLE id (never the name) — a rename can't unfreeze a row.
  const daysUsed = (rule: JournalRule): number => usageById?.[rule.id] ?? 0

  // Rename in place — new array + new object for the edited rule, id + archived
  // preserved. The unchanging id is what keeps a renamed rule's history intact.
  const renameAt = (i: number, name: string) => {
    onChange(rules.map((r, idx) => (idx === i ? { ...r, name } : r)))
  }

  const toggleArchiveAt = (i: number) => {
    onChange(rules.map((r, idx) => (idx === i ? { ...r, archived: !r.archived } : r)))
  }

  const removeAt = (i: number) => {
    onChange(rules.filter((_, idx) => idx !== i))
  }

  const commitDraft = () => {
    const v = draft.trim()
    if (!v) return
    onChange([...rules, makeJournalRule(v)])
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
        {rules.map((rule, i) => {
          const used = daysUsed(rule)
          const frozen = used > 0
          return (
            <li
              key={rule.id}
              className={`px-3 py-2 ${rule.archived ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center gap-2">
                <input
                  value={rule.name}
                  onChange={(e) => renameAt(i, e.target.value)}
                  className="flex-1 rounded-sm border border-transparent bg-transparent px-2 py-1 text-sm text-fg-primary focus:border-gold focus:outline-none"
                />
                {rule.archived && (
                  <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-fg-tertiary">
                    Archived
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => toggleArchiveAt(i)}
                  aria-label={rule.archived ? 'Unarchive rule' : 'Archive rule'}
                  title={
                    rule.archived
                      ? 'Unarchive — show in the daily checklist again'
                      : 'Archive — hide from the daily checklist, keep history'
                  }
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-border-subtle text-fg-tertiary transition-colors duration-150 hover:border-gold hover:text-gold"
                >
                  {rule.archived ? (
                    <ArchiveRestore size={13} strokeWidth={2} />
                  ) : (
                    <Archive size={13} strokeWidth={2} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  disabled={frozen}
                  aria-label={
                    frozen
                      ? `Cannot remove ${rule.name} — used on ${used} ${used === 1 ? 'day' : 'days'}`
                      : 'Remove rule'
                  }
                  title={
                    frozen
                      ? `Used on ${used} ${used === 1 ? 'day' : 'days'} — archive instead`
                      : 'Remove permanently — this rule is not marked on any day'
                  }
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-border-subtle text-fg-tertiary transition-colors duration-150 hover:border-loss hover:text-loss disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border-subtle disabled:hover:text-fg-tertiary"
                >
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </div>
              {frozen && (
                <div className="mt-1 px-2 text-[11px] text-fg-tertiary">
                  used on {used} {used === 1 ? 'day' : 'days'} — archive instead
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
