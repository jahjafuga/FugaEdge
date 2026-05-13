import { useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { colorForTag } from '@/lib/tagColor'

interface DayTagsEditorProps {
  date: string
  tags: string[]
  onChange: (next: string[]) => void
}

// Module-level cache so opening multiple days in a row doesn't re-fetch.
// settings.day_tag_list rarely changes during a session.
let cachedOptions: string[] | null = null
let cachedAt = 0

export function invalidateDayTagOptionsCache() {
  cachedOptions = null
  cachedAt = 0
}

export default function DayTagsEditor({ date, tags, onChange }: DayTagsEditorProps) {
  const [options, setOptions] = useState<string[] | null>(
    cachedOptions && Date.now() - cachedAt < 60_000 ? cachedOptions : null,
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (options !== null) return
    let cancelled = false
    ipc
      .settingsGet()
      .then((p) => {
        if (cancelled) return
        const list = p.values.day_tag_list ?? []
        cachedOptions = list
        cachedAt = Date.now()
        setOptions(list)
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [options])

  const toggle = async (tag: string) => {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]
    setSaving(true)
    setErr(null)
    onChange(next) // optimistic
    try {
      const res = await ipc.dayTagsSave({ date, tags: next })
      onChange(res.tags)
    } catch (e) {
      // roll back
      onChange(tags)
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (options === null) {
    return (
      <div className="text-[10px] uppercase tracking-widest text-fg-tertiary">
        Loading tag options…
      </div>
    )
  }

  if (options.length === 0) {
    return (
      <div className="text-[10px] uppercase tracking-widest text-fg-tertiary">
        No day-note tags configured · add some in Settings → Day note tags.
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-widest text-fg-tertiary">
        Day tags
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((tag) => {
          const active = tags.includes(tag)
          const color = colorForTag(tag)
          return (
            <button
              key={tag}
              type="button"
              disabled={saving}
              onClick={() => toggle(tag)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors duration-150 ${
                active
                  ? 'border-transparent text-accent-ink'
                  : 'border-border-subtle bg-bg-1/40 text-fg-secondary hover:border-gold/40 hover:text-fg-primary'
              } ${saving ? 'opacity-60' : ''}`}
              style={
                active
                  ? { backgroundColor: color, borderColor: color }
                  : undefined
              }
            >
              <span
                className="block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: active ? '#0d0f14' : color }}
              />
              {tag}
            </button>
          )
        })}
      </div>
      {err && (
        <div className="text-[10px] text-loss">Failed to save: {err}</div>
      )}
    </div>
  )
}
