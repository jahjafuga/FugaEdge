import { Check, X } from 'lucide-react'

export type RuleState = 'followed' | 'violated' | 'neutral'

interface RuleChecklistProps {
  rules: string[]
  states: Record<string, RuleState>
  onChange: (rule: string, next: RuleState) => void
}

// State is implicit: not in `states` (or set to 'neutral') means no opinion;
// 'followed' / 'violated' are explicit toggles via the buttons.
export default function RuleChecklist({ rules, states, onChange }: RuleChecklistProps) {
  if (rules.length === 0) {
    return (
      <div className="rounded-md border border-border-subtle/60 bg-bg-1/40 px-4 py-6 text-center text-sm text-fg-tertiary">
        No rules configured. Add some in Settings.
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border/40 overflow-hidden rounded-md border border-border-subtle/60 bg-bg-1/40">
      {rules.map((rule) => {
        const state = states[rule] ?? 'neutral'
        return (
          <li key={rule} className="flex items-center justify-between gap-4 px-4 py-2.5">
            <span
              className={`text-sm ${
                state === 'violated'
                  ? 'text-fg-primary'
                  : state === 'followed'
                    ? 'text-fg-primary'
                    : 'text-fg-secondary'
              }`}
            >
              {rule}
            </span>
            <div className="flex items-center gap-1">
              <StateButton
                label="followed"
                icon={<Check size={13} strokeWidth={2.5} />}
                tone="green"
                active={state === 'followed'}
                onClick={() => onChange(rule, state === 'followed' ? 'neutral' : 'followed')}
              />
              <StateButton
                label="violated"
                icon={<X size={13} strokeWidth={2.5} />}
                tone="red"
                active={state === 'violated'}
                onClick={() => onChange(rule, state === 'violated' ? 'neutral' : 'violated')}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function StateButton({
  label,
  icon,
  tone,
  active,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  tone: 'green' | 'red'
  active: boolean
  onClick: () => void
}) {
  const activeClasses =
    tone === 'green'
      ? 'border-green bg-win/15 text-win'
      : 'border-red bg-loss/15 text-loss'
  const idleClasses =
    tone === 'green'
      ? 'border-border-subtle text-fg-secondary hover:border-win/60 hover:text-win'
      : 'border-border-subtle text-fg-secondary hover:border-loss/60 hover:text-loss'
  return (
    <button
      type="button"
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-sm border text-xs transition-all duration-150 ease-smooth ${
        active ? activeClasses : idleClasses
      }`}
    >
      {icon}
    </button>
  )
}
