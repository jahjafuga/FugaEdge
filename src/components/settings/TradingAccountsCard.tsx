// Multi-account Beat 3 — the Settings "Trading accounts" card: the registry
// UI over the six accounts IPC channels. Mutations replace local state with
// the returned fresh list (the one-round-trip pattern the IPC layer was built
// for); this card deliberately does NOT ride the settings save-bar — it
// mutates through its own channels, the MistakesVocabularyEditor /
// TrashSection precedent. Repo guard errors (duplicate name, archive-the-
// default, delete-with-trades, delete-the-default) surface as friendly inline
// text with the Electron IPC wrapper prefix stripped.

import { useEffect, useState } from 'react'
import { Pencil, Star, Trash2 } from 'lucide-react'
import Card from '@/components/ui/Card'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { ipc } from '@/lib/ipc'
import type { Account, AccountType } from '@shared/accounts-types'
import { ACCOUNT_TYPES } from '@shared/accounts-types'
import { ACCOUNT_TYPE_LABELS, accountStrings } from '@/components/accounts/strings'

const S = accountStrings.card

// ~6 preset swatches (gold first — the house accent).
const COLOR_PRESETS = [
  { name: 'Gold', value: '#d4af37' },
  { name: 'Blue', value: '#4f9cf9' },
  { name: 'Green', value: '#34d399' },
  { name: 'Pink', value: '#f472b6' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Violet', value: '#a78bfa' },
]

/** Electron wraps main-side throws ("Error invoking remote method '…': Error:
 *  <message>") — show the repo's friendly message, not the plumbing. */
function friendly(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')
}

interface EditDraft {
  id: string
  name: string
  broker: string
  account_type: AccountType
  color: string | null
}

export default function TradingAccountsCard() {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Create form
  const [name, setName] = useState('')
  const [broker, setBroker] = useState('')
  const [type, setType] = useState<AccountType>('margin')
  const [color, setColor] = useState<string | null>(null)

  // Row edit + delete confirm
  const [edit, setEdit] = useState<EditDraft | null>(null)
  const [deleting, setDeleting] = useState<Account | null>(null)

  useEffect(() => {
    let cancelled = false
    ipc
      .accountsList()
      .then((list) => {
        if (!cancelled) setAccounts(list)
      })
      .catch((e) => {
        if (!cancelled) setError(friendly(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function run(mutation: () => Promise<Account[]>): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      setAccounts(await mutation())
      return true
    } catch (e) {
      setError(friendly(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    const ok = await run(() =>
      ipc.accountsCreate({
        name,
        broker: broker.trim() || null,
        account_type: type,
        color,
      }),
    )
    if (ok) {
      setName('')
      setBroker('')
      setType('margin')
      setColor(null)
    }
  }

  const saveEdit = async () => {
    if (!edit) return
    const ok = await run(() =>
      ipc.accountsUpdate(edit.id, {
        name: edit.name,
        broker: edit.broker.trim() || null,
        account_type: edit.account_type,
        color: edit.color,
      }),
    )
    if (ok) setEdit(null)
  }

  const confirmDelete = async () => {
    if (!deleting) return
    const target = deleting
    setDeleting(null)
    await run(() => ipc.accountsDelete(target.id))
  }

  return (
    <Card title={S.heading} subtitle={S.sub}>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-loss/40 bg-loss-soft px-3 py-2 text-sm text-fg-secondary"
        >
          {error}
        </div>
      )}

      {/* ── The registry ─────────────────────────────────────────────── */}
      {accounts === null ? (
        <div className="py-4 text-sm text-fg-tertiary">Loading…</div>
      ) : (
        <ul className="space-y-1.5">
          {accounts.map((a) =>
            edit?.id === a.id ? (
              <li
                key={a.id}
                className="rounded-md border border-gold/40 bg-bg-1 px-3 py-2.5"
              >
                <EditForm
                  draft={edit}
                  onChange={setEdit}
                  onSave={() => void saveEdit()}
                  onCancel={() => setEdit(null)}
                  busy={busy}
                />
              </li>
            ) : (
              <li
                key={a.id}
                className={`flex items-center gap-3 rounded-md border border-border-subtle bg-bg-1 px-3 py-2 ${
                  a.status === 'archived' ? 'opacity-50' : ''
                }`}
              >
                {/* Color swatch dot */}
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: a.color ?? 'var(--fg-muted, #666)' }}
                />
                {/* Default star / set-default */}
                {a.status === 'active' ? (
                  a.is_default ? (
                    <button
                      type="button"
                      aria-label={S.defaultStar}
                      title={S.defaultStar}
                      className="cursor-default text-gold"
                    >
                      <Star size={15} strokeWidth={2} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={S.setDefault(a.name)}
                      title={S.setDefault(a.name)}
                      disabled={busy}
                      onClick={() => void run(() => ipc.accountsSetDefault(a.id))}
                      className="cursor-pointer text-fg-muted transition-colors duration-150 hover:text-gold"
                    >
                      <Star size={15} strokeWidth={2} />
                    </button>
                  )
                ) : (
                  <span className="w-[15px]" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-fg-primary">{a.name}</span>
                  {a.broker && (
                    <span className="ml-2 text-xs text-fg-tertiary">{a.broker}</span>
                  )}
                </div>
                <span className="shrink-0 rounded border border-border-subtle px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-fg-tertiary">
                  {ACCOUNT_TYPE_LABELS[a.account_type]}
                </span>
                {a.status === 'archived' && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-fg-muted">
                    {S.archivedTag}
                  </span>
                )}
                <div className="flex shrink-0 items-center gap-1.5">
                  {a.status === 'active' ? (
                    <>
                      <RowAction
                        label={S.edit}
                        onClick={() =>
                          setEdit({
                            id: a.id,
                            name: a.name,
                            broker: a.broker ?? '',
                            account_type: a.account_type,
                            color: a.color,
                          })
                        }
                        busy={busy}
                      >
                        <Pencil size={13} strokeWidth={2} aria-hidden /> {S.edit}
                      </RowAction>
                      <RowAction
                        label={S.archive}
                        onClick={() => void run(() => ipc.accountsSetStatus(a.id, 'archived'))}
                        busy={busy}
                      >
                        {S.archive}
                      </RowAction>
                    </>
                  ) : (
                    <RowAction
                      label={S.unarchive}
                      onClick={() => void run(() => ipc.accountsSetStatus(a.id, 'active'))}
                      busy={busy}
                    >
                      {S.unarchive}
                    </RowAction>
                  )}
                  <RowAction label={S.delete} onClick={() => setDeleting(a)} busy={busy} danger>
                    <Trash2 size={13} strokeWidth={2} aria-hidden /> {S.delete}
                  </RowAction>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      {/* ── Create ───────────────────────────────────────────────────── */}
      <div className="mt-5 border-t border-border-subtle pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.2fr_1fr_1fr]">
          <label className="block">
            <span className="mb-1 block text-xs text-fg-tertiary">{S.nameLabel}</span>
            <input
              type="text"
              aria-label={S.nameLabel}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-bg-1 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-fg-tertiary">{S.brokerLabel}</span>
            <input
              type="text"
              aria-label={S.brokerLabel}
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-bg-1 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-fg-tertiary">{S.typeLabel}</span>
            <select
              aria-label={S.typeLabel}
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
              className="w-full rounded-md border border-border-subtle bg-bg-1 px-2.5 py-1.5 text-sm"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {type === 'sim' && (
          <p className="mt-2 text-xs text-fg-tertiary">{accountStrings.simImportNote}</p>
        )}
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-xs text-fg-tertiary">{S.colorLabel}</span>
            {COLOR_PRESETS.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-label={`${S.colorLabel} ${c.name}`}
                title={c.name}
                onClick={() => setColor(color === c.value ? null : c.value)}
                className={`h-5 w-5 cursor-pointer rounded-full border-2 transition-transform duration-150 hover:scale-110 ${
                  color === c.value ? 'border-fg-primary' : 'border-transparent'
                }`}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void create()}
            className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-accent-ink transition-colors duration-150 hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {S.add}
          </button>
        </div>
      </div>

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={S.deleteConfirmTitle}
        body={<p className="text-sm text-fg-secondary">{deleting ? S.deleteConfirmBody(deleting.name) : ''}</p>}
        confirmLabel={S.deleteConfirmLabel}
        busy={busy}
        tone="destructive"
        onConfirm={() => void confirmDelete()}
      />
    </Card>
  )
}

function RowAction({
  label,
  onClick,
  busy,
  danger = false,
  children,
}: {
  label: string
  onClick: () => void
  busy: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={busy}
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1 rounded border border-border-subtle px-2 py-1 text-xs transition-colors duration-150 ${
        danger
          ? 'text-fg-tertiary hover:border-loss/50 hover:text-loss'
          : 'text-fg-tertiary hover:border-border hover:text-fg-primary'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  )
}

function EditForm({
  draft,
  onChange,
  onSave,
  onCancel,
  busy,
}: {
  draft: EditDraft
  onChange: (d: EditDraft) => void
  onSave: () => void
  onCancel: () => void
  busy: boolean
}) {
  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.2fr_1fr_1fr]">
        <input
          type="text"
          aria-label="Edit name"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          className="w-full rounded-md border border-border-subtle bg-bg-2 px-3 py-1.5 text-sm"
        />
        <input
          type="text"
          aria-label="Edit broker"
          value={draft.broker}
          placeholder={S.brokerLabel}
          onChange={(e) => onChange({ ...draft, broker: e.target.value })}
          className="w-full rounded-md border border-border-subtle bg-bg-2 px-3 py-1.5 text-sm"
        />
        <select
          aria-label="Edit account type"
          value={draft.account_type}
          onChange={(e) => onChange({ ...draft, account_type: e.target.value as AccountType })}
          className="w-full rounded-md border border-border-subtle bg-bg-2 px-2.5 py-1.5 text-sm"
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-label={`${S.colorLabel} ${c.name}`}
              onClick={() => onChange({ ...draft, color: draft.color === c.value ? null : c.value })}
              className={`h-5 w-5 cursor-pointer rounded-full border-2 ${
                draft.color === c.value ? 'border-fg-primary' : 'border-transparent'
              }`}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-fg-tertiary hover:text-fg-primary"
          >
            {S.cancel}
          </button>
          <button
            type="button"
            disabled={busy || !draft.name.trim()}
            onClick={onSave}
            className="rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-accent-ink hover:bg-gold-hover disabled:opacity-40"
          >
            {S.save}
          </button>
        </div>
      </div>
    </div>
  )
}
