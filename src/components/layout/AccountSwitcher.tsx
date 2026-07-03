// Multi-account Beat 4 — the TopBar account switcher (left of ThemeToggle):
// single account OR "All accounts" (the default). Archived accounts stay
// SELECTABLE under a dimmed "Archived" divider group; sim accounts are
// selectable individually and carry their "Sim (practice)" label ("All"
// excludes them by definition — the scoping seam's wall). Dropdown mechanics
// mirror ProfileMenu (open / click-outside / Escape / ARIA). Presentation is
// eyes-gated; the selection persists through the scope provider.

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Layers } from 'lucide-react'
import { useAccountScope } from '@/lib/accountScope'
import { ACCOUNT_TYPE_LABELS, accountStrings } from '@/components/accounts/strings'
import type { Account, AccountScope } from '@shared/accounts-types'

const S = accountStrings.switcher

function Dot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color ?? 'var(--fg-muted, #666)' }}
    />
  )
}

export default function AccountSwitcher() {
  const { scope, setScope, accounts, reloadAccounts } = useAccountScope()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Click-outside + Escape close (the ProfileMenu mechanics).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const active = accounts.filter((a) => a.status === 'active')
  const archived = accounts.filter((a) => a.status === 'archived')
  const selected =
    scope === 'all' ? null : accounts.find((a) => a.id === scope.accountId) ?? null
  // Sim-unlock audit fix beat 3 — the All label qualifies the moment ANY sim
  // account exists, active OR archived (archiving hides neither the account
  // nor the exclusion): 'All accounts (sim excluded)'.
  const someSim = accounts.some((a) => a.account_type === 'sim')
  const allLabel = someSim ? S.allSimExcluded : S.all

  const pick = (s: AccountScope) => {
    setScope(s)
    setOpen(false)
  }

  const openMenu = () => {
    const next = !open
    setOpen(next)
    // Registry freshness: accounts created/archived in Settings appear on
    // the next open without a reload.
    if (next) void reloadAccounts()
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={openMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={S.triggerLabel}
        title={S.triggerLabel}
        className="inline-flex h-9 max-w-[220px] cursor-pointer items-center gap-2 rounded-md border border-border-subtle bg-bg-2 px-3 text-sm text-fg-secondary transition-colors duration-150 ease-out-soft hover:border-border hover:text-fg-primary"
      >
        {selected ? (
          <Dot color={selected.color} />
        ) : (
          <Layers size={13} strokeWidth={2} aria-hidden className="shrink-0 text-fg-tertiary" />
        )}
        <span className="truncate">{selected ? selected.name : allLabel}</span>
        <ChevronDown size={13} strokeWidth={2} aria-hidden className="shrink-0 text-fg-muted" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={S.menuLabel}
          className="absolute right-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-md border border-border bg-bg-2/95 shadow-lg backdrop-blur"
        >
          <div className="p-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => pick('all')}
              className={`flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-white/[0.04] ${
                scope === 'all' ? 'text-gold' : 'text-fg-secondary hover:text-fg-primary'
              }`}
            >
              <Layers size={14} strokeWidth={2} aria-hidden />
              {allLabel}
            </button>
            {active.map((a) => (
              <SwitcherItem key={a.id} account={a} selected={selected?.id === a.id} onPick={pick} />
            ))}
          </div>
          {archived.length > 0 && (
            <div className="border-t border-border-subtle p-1 opacity-60">
              <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                {S.archivedDivider}
              </div>
              {archived.map((a) => (
                <SwitcherItem key={a.id} account={a} selected={selected?.id === a.id} onPick={pick} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SwitcherItem({
  account,
  selected,
  onPick,
}: {
  account: Account
  selected: boolean
  onPick: (s: AccountScope) => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => onPick({ accountId: account.id })}
      className={`flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-white/[0.04] ${
        selected ? 'text-gold' : 'text-fg-secondary hover:text-fg-primary'
      }`}
    >
      <Dot color={account.color} />
      <span className="min-w-0 flex-1 truncate">{account.name}</span>
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-fg-muted">
        {ACCOUNT_TYPE_LABELS[account.account_type]}
      </span>
    </button>
  )
}
