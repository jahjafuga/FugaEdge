import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import TierBadge from './TierBadge'
import SystemTierChip from './SystemTierChip'
import type { PlaybookTier, PlaybookWithStats } from '@shared/playbook-types'

interface PlaybookPickerProps {
  value: number | null
  valueLabel?: string | null
  /** The selected playbook's quality tier (fed from the trade's playbook_tier)
   *  so the trigger can show its TierBadge without waiting for the lazy list. */
  tier?: PlaybookTier | null
  onChange: (next: number | null) => void
}

// Loads active playbooks lazily on first open. Cached at the module level
// so multiple pickers don't all fetch — playbooks rarely change mid-session.
//
// Multi-account RULED BOUNDARY (Playbook slice) — this cache is PINNED
// names-only: the argless fetch means its payload's STATS are always the
// aligned 'all' scope, and every consumer of this cache reads names/tiers
// ONLY. Do not scope-key it and do not drop it; if a consumer ever needs
// per-scope stats from here, that is a new ruling.
let _cache: PlaybookWithStats[] | null = null
let _inflight: Promise<PlaybookWithStats[]> | null = null

async function loadPlaybooks(): Promise<PlaybookWithStats[]> {
  if (_cache) return _cache
  if (_inflight) return _inflight
  _inflight = ipc.playbooksList().then((list) => {
    _cache = list
    _inflight = null
    return list
  })
  return _inflight
}

export function invalidatePlaybookCache(): void {
  _cache = null
}

export default function PlaybookPicker({ value, valueLabel, tier, onChange }: PlaybookPickerProps) {
  const [open, setOpen] = useState(false)
  const [playbooks, setPlaybooks] = useState<PlaybookWithStats[] | null>(_cache)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || playbooks) return
    let cancelled = false
    loadPlaybooks().then((list) => {
      if (!cancelled) setPlaybooks(list)
    })
    return () => {
      cancelled = true
    }
  }, [open, playbooks])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const display =
    value != null
      ? valueLabel ??
        playbooks?.find((p) => p.id === value)?.name ??
        '—'
      : 'No playbook'

  const active = value != null

  const renderPlaybookRow = (p: PlaybookWithStats) => {
    const isActive = p.id === value
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => {
          onChange(p.id)
          setOpen(false)
        }}
        className={`flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors duration-150 ${
          isActive ? 'bg-white/[0.04] text-fg-primary' : 'text-fg-primary hover:bg-white/[0.04]'
        }`}
      >
        <span className="inline-flex items-center gap-1.5">
          {p.is_system ? <SystemTierChip /> : <TierBadge tier={p.tier} />}
          <span>{p.name}</span>
        </span>
        {isActive && <Check size={11} strokeWidth={2.5} />}
      </button>
    )
  }

  return (
    <div ref={wrapRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-xs transition-colors duration-150 hover:border-gold/40 hover:text-gold ${
          active ? 'text-fg-primary' : 'text-fg-tertiary'
        }`}
      >
        <span className="inline-flex items-center gap-1.5">
          {active && tier != null && <TierBadge tier={tier} />}
          <span>{display}</span>
        </span>
        {open ? (
          <ChevronUp size={11} strokeWidth={2} />
        ) : (
          <ChevronDown size={11} strokeWidth={2} />
        )}
      </button>
      {active && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onChange(null)
          }}
          className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.06] text-fg-tertiary transition-colors duration-150 hover:border-red/40 hover:text-red"
          aria-label="Unlink playbook from this trade"
          title="Unlink playbook from this trade"
        >
          ×
        </button>
      )}
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-[280px] w-[240px] overflow-auto rounded-md border border-white/[0.08] bg-bg/95 p-1 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => {
              onChange(null)
              setOpen(false)
            }}
            className={`flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors duration-150 ${
              !active ? 'bg-white/[0.04] text-fg-primary' : 'text-fg-primary hover:bg-white/[0.04]'
            }`}
          >
            <span>No playbook</span>
            {!active && <Check size={11} strokeWidth={2.5} />}
          </button>
          <div className="my-1 h-px bg-white/[0.04]" />
          {!playbooks && (
            <div className="px-2 py-2 text-[10px] text-fg-muted">Loading…</div>
          )}
          {playbooks &&
            (() => {
              const visible = playbooks.filter((p) => !p.archived)
              // System rows (e.g. "No Setup") pin to the TOP, above a thin
              // divider; user playbooks keep their alphabetical order below.
              // Plain name, no tier chip — identical row treatment for both.
              const system = visible.filter((p) => p.is_system)
              const users = visible.filter((p) => !p.is_system)
              return (
                <>
                  {system.map(renderPlaybookRow)}
                  {system.length > 0 && users.length > 0 && (
                    <div className="my-1 h-px bg-white/[0.04]" />
                  )}
                  {users.map(renderPlaybookRow)}
                </>
              )
            })()}
        </div>
      )}
    </div>
  )
}
