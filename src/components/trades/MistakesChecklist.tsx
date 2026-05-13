import { useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { useThemeMode } from '@/lib/theme'

interface MistakesChecklistProps {
  selected: string[]
  onChange: (next: string[]) => void
}

// Available mistake labels live in settings.mistake_list, edited via the
// Settings page. Cache once at module scope so multiple checklists across the
// expanded trades share one fetch.
let _cache: string[] | null = null
let _inflight: Promise<string[]> | null = null

async function loadMistakeList(): Promise<string[]> {
  if (_cache) return _cache
  if (_inflight) return _inflight
  _inflight = ipc.settingsGet().then((p) => {
    _cache = p.values.mistake_list
    _inflight = null
    return _cache
  })
  return _inflight
}

export function invalidateMistakeListCache(): void {
  _cache = null
}

export default function MistakesChecklist({ selected, onChange }: MistakesChecklistProps) {
  const [available, setAvailable] = useState<string[] | null>(_cache)
  const { resolved } = useThemeMode()
  const isLight = resolved === 'light'

  useEffect(() => {
    if (available) return
    let cancelled = false
    loadMistakeList().then((list) => {
      if (!cancelled) setAvailable(list)
    })
    return () => {
      cancelled = true
    }
  }, [available])

  if (!available) {
    return <div className="text-xs text-muted">Loading mistake list…</div>
  }

  if (available.length === 0) {
    return (
      <div className="text-xs text-muted">
        No mistakes configured. Add some in Settings → Mistakes.
      </div>
    )
  }

  const toggle = (label: string) => {
    if (selected.includes(label)) onChange(selected.filter((s) => s !== label))
    else onChange([...selected, label])
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {available.map((label) => {
        const active = selected.includes(label)
        // Light mode uses an amber palette per the design spec
        // (#f8f9fb / #d1d5db / #0d0f14 default; #fef3c7 / #d4af37 / #92400e
        // selected). Dark mode keeps the original red-tinted chip style.
        const style = isLight
          ? active
            ? {
                backgroundColor: '#fef3c7',
                borderColor: '#d4af37',
                color: '#92400e',
              }
            : {
                backgroundColor: '#f8f9fb',
                borderColor: '#d1d5db',
                color: '#0d0f14',
              }
          : undefined
        return (
          <button
            key={label}
            type="button"
            onClick={() => toggle(label)}
            style={style}
            className={`rounded-full border px-2.5 py-1 font-mono text-[10px] transition-all duration-150 ease-smooth ${
              isLight
                ? ''
                : active
                  ? 'border-red/40 bg-red/15 text-red shadow-[0_0_12px_-6px_rgba(248,113,113,0.5)]'
                  : 'border-white/[0.06] bg-white/[0.02] text-subtle hover:border-red/30 hover:text-red'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
