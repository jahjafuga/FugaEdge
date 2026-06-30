import { useState, type KeyboardEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'

// Generic string-list editor (add / edit-in-place / remove). Used for plain
// string lists like day tags. Journal RULES use JournalRuleEditor (the id-stable
// {id,name,archived} model with rename-by-id + archive).
interface RuleListProps {
  rules: string[]
  onChange: (next: string[]) => void
}

export default function RuleList({ rules, onChange }: RuleListProps) {
  const [draft, setDraft] = useState('')

  const updateAt = (i: number, text: string) => {
    const next = [...rules]
    next[i] = text
    onChange(next)
  }

  const remove = (i: number) => {
    onChange(rules.filter((_, idx) => idx !== i))
  }

  const commitDraft = () => {
    const v = draft.trim()
    if (!v) return
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
        {rules.map((r, i) => (
          <li key={i} className="flex items-center gap-2 px-3 py-2">
            <input
              value={r}
              onChange={(e) => updateAt(i, e.target.value)}
              className="flex-1 rounded-sm border border-transparent bg-transparent px-2 py-1 text-sm text-fg-primary focus:border-gold focus:outline-none"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Remove rule"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-border-subtle text-fg-tertiary transition-colors duration-150 hover:border-loss hover:text-loss"
            >
              <Trash2 size={13} strokeWidth={2} />
            </button>
          </li>
        ))}
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
