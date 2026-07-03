// Multi-account Beat 3 — the import "Trading account" picker (replaces the
// old Real/Paper radios). Controlled: the page owns the selection because
// changing it re-invokes the preview (preview honesty — duplicate badges
// re-annotate against the chosen account). Presentational beyond that — no
// IPC here. Sim-unlock audit fix beat 3: the block retired; a sim selection
// shows the informational practice note only.

import { Link } from 'react-router-dom'
import type { Account } from '@shared/accounts-types'
import { activeAccounts } from '@/core/import/account-picker'
import { ACCOUNT_TYPE_LABELS, accountStrings } from '@/components/accounts/strings'

interface AccountPickerCardProps {
  accounts: Account[]
  value: string | null
  onChange: (id: string) => void
}

export default function AccountPickerCard({ accounts, value, onChange }: AccountPickerCardProps) {
  const S = accountStrings.picker
  const options = activeAccounts(accounts)
  const simSelected = accounts.some((a) => a.id === value && a.account_type === 'sim')

  return (
    <div className="card-premium px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">{S.heading}</div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <select
          aria-label={S.selectLabel}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-[240px] rounded-md border border-border bg-bg-1 px-2.5 py-1.5 text-sm text-fg-primary outline-none focus:border-gold"
        >
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} — {ACCOUNT_TYPE_LABELS[a.account_type]}
            </option>
          ))}
        </select>
        <Link
          to="/settings"
          className="text-xs text-fg-tertiary underline-offset-2 transition-colors duration-150 hover:text-gold hover:underline"
        >
          {S.manageHint}
        </Link>
      </div>
      {simSelected && (
        <p className="mt-3 text-xs text-fg-tertiary">{accountStrings.practiceImportNote}</p>
      )}
    </div>
  )
}
