import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import TierBadge from '@/components/playbook/TierBadge'
import { filterAvailableSecondaries } from '@/core/playbook/availableSecondaries'
import type { TradeListRow } from '@shared/trades-types'
import type { PlaybookTag, PlaybookWithStats } from '@shared/playbook-types'

interface ConfluenceTagsProps {
  trade: TradeListRow
}

// Beat 3 — SECONDARY confluence tags (trade_playbooks). The PRIMARY setup stays
// on the playbook picker; these are the EXTRA signals that lined up. Hidden
// entirely when the primary is "No Setup" (Invariant 2: no setup → no
// confluence). System rows and the current primary are never offered
// (filterAvailableSecondaries; also repo-enforced). Persists per-tag via the
// Beat-2 add/remove IPC, then re-fetches the tag set for a clean refresh.
export default function ConfluenceTags({ trade }: ConfluenceTagsProps) {
  const [tags, setTags] = useState<PlaybookTag[] | null>(null)
  const [playbooks, setPlaybooks] = useState<PlaybookWithStats[] | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // The trade's current secondaries — reloads when the trade changes.
  useEffect(() => {
    let cancelled = false
    ipc
      .playbookTagsGet(trade.id)
      .then((t) => {
        if (!cancelled) setTags(t)
      })
      .catch(() => {
        if (!cancelled) setTags([])
      })
    return () => {
      cancelled = true
    }
  }, [trade.id])

  // The playbook list for the add dropdown (loaded once).
  useEffect(() => {
    let cancelled = false
    ipc
      .playbooksList()
      .then((list) => {
        if (!cancelled) setPlaybooks(list)
      })
      .catch(() => {
        if (!cancelled) setPlaybooks([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Dropdown: click-outside + Escape (mirrors PlaybookPicker).
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

  const refetchTags = useCallback(async () => {
    setTags(await ipc.playbookTagsGet(trade.id))
  }, [trade.id])

  const addTag = useCallback(
    async (playbookId: number) => {
      if (busy) return
      setBusy(true)
      setOpen(false)
      try {
        await ipc.playbookTagAdd({ trade_id: trade.id, playbook_id: playbookId })
        await refetchTags()
      } catch (e) {
        window.alert(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [busy, trade.id, refetchTags],
  )

  const removeTag = useCallback(
    async (playbookId: number) => {
      if (busy) return
      setBusy(true)
      try {
        await ipc.playbookTagRemove({ trade_id: trade.id, playbook_id: playbookId })
        await refetchTags()
      } catch (e) {
        window.alert(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [busy, trade.id, refetchTags],
  )

  // GATE (Invariant 2): hide the whole section when the primary is "No Setup".
  // "Primary is a system row (No Setup)" is inferred from a non-null primary
  // with a null tier — Route A nulls the tier ONLY for is_system playbooks, so
  // the two are equivalent today. Chosen over an explicit is_system lookup
  // because it's synchronous (no flash before the playbook list loads). If tier
  // handling (Route A) ever changes, revisit this coupling. An untagged trade
  // (playbook_id null) is NOT No Setup, so the section shows.
  const primaryIsSystem = trade.playbook_id != null && trade.playbook_tier == null
  if (primaryIsSystem) return null

  const selectedIds = (tags ?? []).map((t) => t.id)
  const available = playbooks
    ? filterAvailableSecondaries(playbooks, trade.playbook_id, selectedIds)
    : []

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-2 p-4">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        Confluence
      </div>
      <p className="mb-3 text-sm text-fg-secondary">
        Extra setups that lined up on this trade — secondary signals beyond the primary.
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {(tags ?? []).map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] text-fg-secondary"
          >
            <TierBadge tier={tag.tier} />
            <span>{tag.name}</span>
            <button
              type="button"
              onClick={() => removeTag(tag.id)}
              disabled={busy}
              aria-label={`Remove ${tag.name}`}
              className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-fg-tertiary transition-colors hover:text-red disabled:opacity-40"
            >
              <X size={11} strokeWidth={2.5} />
            </button>
          </span>
        ))}

        {/* + Add confluence — dropdown mirroring PlaybookPicker's mechanics. */}
        <div ref={wrapRef} className="relative inline-flex">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[11px] text-subtle transition-colors duration-150 hover:border-gold/40 hover:text-gold disabled:opacity-40"
          >
            <Plus size={11} strokeWidth={2.5} />
            <span>Add confluence</span>
            {open ? (
              <ChevronUp size={11} strokeWidth={2} />
            ) : (
              <ChevronDown size={11} strokeWidth={2} />
            )}
          </button>
          {open && (
            <div className="absolute left-0 top-full z-30 mt-1 max-h-[240px] w-[240px] overflow-auto rounded-md border border-white/[0.08] bg-bg/95 p-1 shadow-lg backdrop-blur">
              {!playbooks && (
                <div className="px-2 py-2 text-[10px] text-muted">Loading…</div>
              )}
              {playbooks && available.length === 0 && (
                <div className="px-2 py-2 text-[10px] text-muted">
                  No other playbooks to add.
                </div>
              )}
              {available.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addTag(p.id)}
                  className="flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-xs text-text transition-colors duration-150 hover:bg-white/[0.04]"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <TierBadge tier={p.tier} />
                    <span>{p.name}</span>
                  </span>
                  <Plus size={11} strokeWidth={2.5} className="text-fg-tertiary" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
