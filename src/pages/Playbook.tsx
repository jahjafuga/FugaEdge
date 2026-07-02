import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Plus } from 'lucide-react'
import PageShell from '@/components/layout/PageShell'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import PlaybookPerformance from '@/components/playbook/PlaybookPerformance'
import { invalidatePlaybookCache } from '@/components/playbook/PlaybookPicker'
import TierBadge from '@/components/playbook/TierBadge'
import { tierTone } from '@/components/playbook/tierTone'
import SystemTierChip from '@/components/playbook/SystemTierChip'
import { ipc } from '@/lib/ipc'
import { useAccountScope } from '@/lib/accountScope'
import { int, percent, pnlClass, signed } from '@/lib/format'
import {
  PLAYBOOK_TIERS,
  type PlaybookTier,
  type PlaybookWithStats,
} from '@shared/playbook-types'

export default function Playbook() {
  // Multi-account slice — the switcher's scope: per-playbook STATS follow it
  // (every list fetch carries it; re-fetch on change). Definitions are global
  // — the list itself never changes under any scope.
  const { scope } = useAccountScope()
  const [list, setList] = useState<PlaybookWithStats[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  // Inline "new playbook" creator — replaces window.prompt, which Electron's
  // renderer does not implement (it returns null, silently killing creation).
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  // Form state for the right-side editor — mirrors the selected playbook,
  // resets when selection changes. dirty check happens at save time.
  const [editor, setEditor] = useState<{
    name: string
    description: string
    rules: string
    ideal_conditions: string
    archived: boolean
    tier: PlaybookTier
  } | null>(null)

  const refresh = useCallback(async () => {
    setErr(null)
    try {
      const fresh = await ipc.playbooksList({ accountScope: scope })
      setList(fresh)
      invalidatePlaybookCache()
      // Keep the same selection if it still exists; otherwise pick the first.
      if (selectedId == null && fresh.length > 0) {
        setSelectedId(fresh[0].id)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }, [selectedId, scope])

  useEffect(() => {
    refresh()
    // Re-fetch on switcher change (the established mirror); selection changes
    // must NOT re-fetch, so refresh itself stays out of the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  const selected = useMemo(
    () => list?.find((p) => p.id === selectedId) ?? null,
    [list, selectedId],
  )

  // Reset editor when selection changes.
  useEffect(() => {
    if (selected) {
      setEditor({
        name: selected.name,
        description: selected.description,
        rules: selected.rules,
        ideal_conditions: selected.ideal_conditions,
        archived: selected.archived,
        tier: selected.tier,
      })
      setSavedAt(null)
    } else {
      setEditor(null)
    }
  }, [selected])

  const startCreate = useCallback(() => {
    setNewName('')
    setCreating(true)
  }, [])

  const cancelCreate = useCallback(() => {
    setCreating(false)
    setNewName('')
  }, [])

  const submitCreate = useCallback(async () => {
    const name = newName.trim()
    if (!name) return
    try {
      const created = await ipc.playbookCreate({ name })
      invalidatePlaybookCache()
      const fresh = await ipc.playbooksList({ accountScope: scope })
      setList(fresh)
      setSelectedId(created.id)
      setCreating(false)
      setNewName('')
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    }
  }, [newName, scope])

  const handleSave = useCallback(async () => {
    if (!selected || !editor || saving) return
    setSaving(true)
    try {
      await ipc.playbookUpdate({
        id: selected.id,
        name: editor.name,
        description: editor.description,
        rules: editor.rules,
        ideal_conditions: editor.ideal_conditions,
        archived: editor.archived,
        tier: editor.tier,
      })
      invalidatePlaybookCache()
      const fresh = await ipc.playbooksList({ accountScope: scope })
      setList(fresh)
      setSavedAt(Date.now())
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }, [editor, saving, selected, scope])

  // Archive must persist immediately. Previously the button only flipped
  // local editor state, so the change was lost on navigation away/back.
  const handleArchiveToggle = useCallback(async () => {
    if (!selected || !editor) return
    const nextArchived = !editor.archived
    try {
      await ipc.playbookUpdate({ id: selected.id, archived: nextArchived })
      invalidatePlaybookCache()
      const fresh = await ipc.playbooksList({ accountScope: scope })
      setList(fresh)
      setEditor({ ...editor, archived: nextArchived })
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    }
  }, [editor, selected, scope])

  const handleDelete = useCallback(async () => {
    if (!selected) return
    const ok = window.confirm(
      `Delete ${selected.name}? Trades linked to this playbook will show as No playbook assigned but will not be deleted.`,
    )
    if (!ok) return
    try {
      await ipc.playbookDelete(selected.id)
      invalidatePlaybookCache()
      const fresh = await ipc.playbooksList({ accountScope: scope })
      setList(fresh)
      // Pick a neighbor if there's anything left; otherwise clear selection.
      setSelectedId(fresh.length > 0 ? fresh[0].id : null)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    }
  }, [selected, scope])

  if (err) {
    return (
      <PageShell subtitle="Define your momentum setups and track performance per playbook.">
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-loss/40 bg-loss-soft p-4 text-sm text-fg-secondary">
          <AlertCircle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-loss" />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-loss">
              Failed to load playbooks
            </div>
            <div className="mt-1">{err}</div>
          </div>
        </div>
      </PageShell>
    )
  }

  if (!list) {
    return (
      <PageShell subtitle="Define your momentum setups and track performance per playbook.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          <Skeleton className="h-[440px]" />
          <Skeleton className="h-[440px]" />
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell subtitle={`${int(list.length)} playbook${list.length === 1 ? '' : 's'} · setup library.`}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
        {/* Left: playbook list */}
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-muted">
              Playbooks
            </div>
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-gold/40 bg-gold/[0.08] px-2 text-[10px] font-semibold uppercase tracking-wider text-gold transition-colors duration-150 hover:bg-gold/[0.18]"
            >
              <Plus size={11} strokeWidth={2.5} />
              New
            </button>
          </div>
          {creating && (
            <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    submitCreate()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    cancelCreate()
                  }
                }}
                placeholder="New playbook name…"
                className="min-w-0 flex-1 rounded-md border border-border-strong bg-bg-1 px-2 py-1 text-sm text-fg-primary placeholder:text-fg-muted outline-none focus:border-gold"
              />
              <button
                type="button"
                onClick={submitCreate}
                disabled={!newName.trim()}
                className="shrink-0 cursor-pointer rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-bg transition-all duration-150 hover:brightness-110 disabled:cursor-default disabled:opacity-40"
                style={{
                  background:
                    'linear-gradient(135deg, #d4af37 0%, #b59122 100%)',
                }}
              >
                Create
              </button>
              <button
                type="button"
                onClick={cancelCreate}
                className="shrink-0 cursor-pointer rounded border border-white/[0.08] px-2 py-1 text-[10px] uppercase tracking-wider text-subtle transition-colors hover:border-gold/40 hover:text-gold"
              >
                Cancel
              </button>
            </div>
          )}
          <ul className="max-h-[600px] overflow-y-auto">
            {(() => {
              // Beat 4b — system rows (e.g. "No Setup") pin to the TOP, above a
              // thin divider; user playbooks keep their alphabetical order below
              // (mirrors PlaybookPicker). A system row shows the muted N/A chip
              // in place of a grade badge — the stored 'C' is inert, never shown.
              const system = list.filter((p) => p.is_system)
              const users = list.filter((p) => !p.is_system)
              const renderRow = (p: PlaybookWithStats) => {
                const isSel = p.id === selectedId
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className={`flex w-full items-start justify-between gap-3 border-b border-border-subtle px-4 py-3 text-left transition-colors duration-150 ${
                        isSel
                          ? 'bg-gold/[0.06]'
                          : 'hover:bg-bg-3'
                      } ${p.archived ? 'opacity-60' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {p.is_system ? <SystemTierChip /> : <TierBadge tier={p.tier} />}
                          {/* Active item: full primary text + medium weight. Inactive:
                              tertiary (#6b7280 in light) — readable but clearly
                              secondary. Gold indicator dot on the right marks
                              selection without dyeing the label. */}
                          <span
                            className={`truncate text-sm ${
                              isSel
                                ? 'font-medium text-fg-primary'
                                : 'font-normal text-fg-tertiary'
                            }`}
                          >
                            {p.name}
                          </span>
                          {p.archived && (
                            <span className="rounded-sm bg-bg-3 px-1 text-[9px] uppercase tracking-wider text-fg-tertiary">
                              archived
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-fg-muted">
                          <span>{int(p.stats.trade_count)}t</span>
                          <span>·</span>
                          <span className={pnlClass(p.stats.net_pnl)}>
                            {p.stats.trade_count > 0 ? signed(p.stats.net_pnl) : '—'}
                          </span>
                          {p.stats.win_rate != null && (
                            <>
                              <span>·</span>
                              <span className="text-gold">
                                {percent(p.stats.win_rate, 0)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {isSel && (
                        <span className="ml-1 mt-1 inline-block h-2 w-2 rounded-full bg-gold" />
                      )}
                    </button>
                  </li>
                )
              }
              return (
                <>
                  {system.map(renderRow)}
                  {system.length > 0 && users.length > 0 && (
                    <li aria-hidden="true">
                      <div className="my-1 h-px bg-white/[0.04]" />
                    </li>
                  )}
                  {users.map(renderRow)}
                </>
              )
            })()}
          </ul>
        </Card>

        {/* Right: editor + performance */}
        {!selected || !editor ? (
          <Card>
            <div className="px-6 py-16 text-center text-sm text-muted">
              Select a playbook from the left, or create a new one.
            </div>
          </Card>
        ) : (
          <div className="space-y-5">
            <PlaybookPerformance stats={selected.stats} />

            <Card padded={false}>
              <div className="flex items-baseline justify-between border-b border-white/[0.05] px-5 py-3">
                <div className="text-[10px] uppercase tracking-wider text-muted">
                  Setup definition
                </div>
                <div className="flex items-center gap-3">
                  {selected.is_system && (
                    <span className="text-[10px] uppercase tracking-wider text-fg-tertiary">
                      System playbook
                    </span>
                  )}
                  {savedAt && (
                    <span className="text-[10px] uppercase tracking-wider text-win">
                      saved
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleArchiveToggle}
                    disabled={selected.is_system}
                    className="rounded border border-white/[0.08] px-2 py-0.5 text-[10px] uppercase tracking-wider text-subtle transition-colors hover:border-gold/40 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/[0.08] disabled:hover:text-subtle"
                  >
                    {editor.archived ? 'restore' : 'archive'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={selected.is_system}
                    className="rounded border border-red/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-red transition-colors hover:bg-red/[0.08] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                    title={selected.is_system ? 'System playbooks cannot be deleted.' : 'Permanently delete this playbook. Trades will be unlinked but not deleted.'}
                  >
                    delete
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || selected.is_system}
                    className="rounded-md px-3 py-1 text-xs font-medium text-bg transition-all duration-150 hover:brightness-110 disabled:opacity-40"
                    style={{
                      background:
                        'linear-gradient(135deg, #d4af37 0%, #b59122 100%)',
                    }}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
              <div className="space-y-4 p-5">
                <Field label="Name">
                  <input
                    value={editor.name}
                    onChange={(e) =>
                      setEditor({ ...editor, name: e.target.value })
                    }
                    disabled={selected.is_system}
                    className="w-full rounded-md border border-border-strong bg-bg-1 px-3 py-2 text-sm text-fg-primary outline-none focus:border-gold disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </Field>

                <Field label="Tier">
                  {selected.is_system ? (
                    // Beat 4b — a system playbook (No Setup) is NOT graded: a
                    // static N/A chip, never the clickable A+/A/B/C pills. The
                    // panel's "System playbook" note covers the why, so this
                    // line just reads "N/A · not graded".
                    <div className="flex items-center gap-2">
                      <SystemTierChip />
                      <span className="text-[11px] text-fg-tertiary">not graded</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {PLAYBOOK_TIERS.map((t) => {
                        const active = editor.tier === t
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setEditor({ ...editor, tier: t })}
                            aria-pressed={active}
                            className={`inline-flex h-7 cursor-pointer items-center rounded-md border px-2.5 text-[11px] font-semibold uppercase tracking-wider transition-colors duration-150 ${
                              active
                                ? tierTone(t)
                                : 'border-border-subtle bg-bg-2 text-fg-tertiary hover:border-border hover:text-fg-secondary'
                            }`}
                          >
                            {t}
                          </button>
                        )
                      })}
                      <span className="text-[11px] text-fg-tertiary">
                        A+ = best · A = strong · B = solid · C = weak
                      </span>
                    </div>
                  )}
                </Field>

                <Field label="Description">
                  <input
                    value={editor.description}
                    onChange={(e) =>
                      setEditor({ ...editor, description: e.target.value })
                    }
                    disabled={selected.is_system}
                    placeholder="One-liner — what this setup is."
                    className="w-full rounded-md border border-border-strong bg-bg-1 px-3 py-2 text-sm text-fg-primary placeholder:text-fg-muted outline-none focus:border-gold disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </Field>

                <Field label="Entry rules">
                  <textarea
                    value={editor.rules}
                    onChange={(e) => setEditor({ ...editor, rules: e.target.value })}
                    rows={5}
                    disabled={selected.is_system}
                    placeholder={`What triggers an entry?\nWhat's the stop?\nWhat's the profit target?`}
                    className="w-full resize-y rounded-md border border-border-strong bg-bg-1 px-3 py-2 text-sm text-fg-primary placeholder:text-fg-muted outline-none focus:border-gold disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </Field>

                <Field label="Ideal conditions">
                  <textarea
                    value={editor.ideal_conditions}
                    onChange={(e) =>
                      setEditor({ ...editor, ideal_conditions: e.target.value })
                    }
                    rows={4}
                    disabled={selected.is_system}
                    placeholder={`Time of day, RVOL, news catalyst, daily range, etc.`}
                    className="w-full resize-y rounded-md border border-border-strong bg-bg-1 px-3 py-2 text-sm text-fg-primary placeholder:text-fg-muted outline-none focus:border-gold disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </Field>
              </div>
            </Card>
          </div>
        )}
      </div>
    </PageShell>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">
        {label}
      </div>
      {children}
    </div>
  )
}
