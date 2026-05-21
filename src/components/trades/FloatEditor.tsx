import { useEffect, useState } from 'react'
import { int } from '@/lib/format'

interface FloatEditorProps {
  /** Current persisted float (whole-share count) or null when unset. */
  value: number | null
  /** Called with the parsed numeric value (or null to clear). Fires on
   *  blur and on Enter — NOT on every keystroke, so saves don't spam IPC. */
  onChange: (next: number | null) => void
}

// Parse "1.2M", "450K", "1.5B", or raw numbers (with optional commas) into
// a share count. Returns null for empty / unparseable input. Exported so the
// format-then-parse round trip can be unit-tested.
export function parseInput(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '').trim()
  if (cleaned === '') return null
  const m = cleaned.match(/^([0-9]*\.?[0-9]+)([kmbKMB])?$/)
  if (!m) return null
  const num = Number.parseFloat(m[1])
  if (!Number.isFinite(num) || num <= 0) return null
  const suffix = m[2]?.toLowerCase()
  const mult = suffix === 'b' ? 1_000_000_000 : suffix === 'm' ? 1_000_000 : suffix === 'k' ? 1_000 : 1
  return Math.round(num * mult)
}

export default function FloatEditor({ value, onChange }: FloatEditorProps) {
  // Local draft state — only commits on blur/Enter. This avoids fighting
  // the parent's auth on every keystroke (and prevents the input value from
  // jumping to the formatted value mid-typing).
  const [draft, setDraft] = useState<string>(value == null ? '' : int(value))

  // Sync from parent when the underlying value changes (e.g. trade swap).
  useEffect(() => {
    setDraft(value == null ? '' : int(value))
  }, [value])

  const commit = () => {
    const parsed = parseInput(draft)
    // No-op if parsing didn't change the effective value (avoid pointless IPC).
    if (parsed === value) {
      setDraft(value == null ? '' : int(value))
      return
    }
    onChange(parsed)
    setDraft(parsed == null ? '' : int(parsed))
  }

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLInputElement).blur()
        } else if (e.key === 'Escape') {
          setDraft(value == null ? '' : int(value))
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      placeholder="e.g. 1.2M"
      aria-label="Shares outstanding"
      className="h-8 w-full rounded-md border border-border-subtle bg-bg-1 px-2.5 font-mono text-sm text-fg-primary placeholder:text-fg-muted transition-colors duration-150 focus:border-gold focus:outline-none"
    />
  )
}
