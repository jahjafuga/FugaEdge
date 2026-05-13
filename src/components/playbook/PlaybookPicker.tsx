import { useEffect, useRef, useState } from 'react'
import { ipc } from '@/lib/ipc'
import type { PlaybookWithStats } from '@shared/playbook-types'

interface PlaybookPickerProps {
  value: number | null
  valueLabel?: string | null
  onChange: (next: number | null) => void
}

// Loads active playbooks lazily on first open. Cached at the module level
// so multiple pickers don't all fetch — playbooks rarely change mid-session.
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

export default function PlaybookPicker({ value, valueLabel, onChange }: PlaybookPickerProps) {
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

  return (
    <div ref={wrapRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-xs transition-colors duration-150 ${
          active
            ? 'border-gold/40 bg-gold/[0.08] text-gold'
            : 'border-white/[0.08] bg-white/[0.02] text-subtle hover:border-gold/40 hover:text-gold'
        }`}
      >
        <span>{display}</span>
        <span className="text-[11px]">{open ? '▴' : '▾'}</span>
      </button>
      {active && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onChange(null)
          }}
          className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.06] text-subtle transition-colors duration-150 hover:border-red/40 hover:text-red"
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
            className={`flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left font-mono text-xs transition-colors duration-150 ${
              !active ? 'text-gold' : 'text-text hover:bg-white/[0.04]'
            }`}
          >
            <span>No playbook</span>
            {!active && <span className="text-[10px]">✓</span>}
          </button>
          <div className="my-1 h-px bg-white/[0.04]" />
          {!playbooks && (
            <div className="px-2 py-2 font-mono text-[10px] text-muted">Loading…</div>
          )}
          {playbooks
            ?.filter((p) => !p.archived)
            .map((p) => {
              const isActive = p.id === value
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p.id)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left font-mono text-xs transition-colors duration-150 ${
                    isActive ? 'text-gold' : 'text-text hover:bg-white/[0.04]'
                  }`}
                >
                  <span>{p.name}</span>
                  {isActive && <span className="text-[10px]">✓</span>}
                </button>
              )
            })}
        </div>
      )}
    </div>
  )
}
