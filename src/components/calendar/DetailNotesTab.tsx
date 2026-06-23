import { useEffect, useRef, useState } from 'react'

const DEBOUNCE_MS = 500

interface DetailNotesTabProps {
  /** Identity that resets the editor when it changes (day's date / week start). */
  resetKey: string
  initialValue: string
  onSave: (body: string) => Promise<void> | void
  label: string
  placeholder: string
}

// v0.2.2 Day 4.5a — generalized from DayDetailModal/NotesTab, behavior-
// preserving. Debounced 500ms autosave; a pending edit also flushes on unmount
// (tab switch / modal close) so nothing is lost inside the debounce window.
// The save target is now a callback so both Day (session_meta.notes) and Week
// (week_notes) reuse it.
export default function DetailNotesTab({
  resetKey,
  initialValue,
  onSave,
  label,
  placeholder,
}: DetailNotesTabProps) {
  const [value, setValue] = useState(initialValue)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef(initialValue)
  // Mirror current value + latest onSave into refs so the unmount-only effect
  // can flush the latest pending edit without re-subscribing per keystroke.
  const valueRef = useRef(value)
  const onSaveRef = useRef(onSave)
  valueRef.current = value
  onSaveRef.current = onSave

  // Re-seed ONLY when the editor switches to a different day/week (resetKey).
  // Deliberately NOT keyed on initialValue: a bare initialValue change (e.g. a
  // parent optimistically refreshing detail.note after a save) must NOT clobber
  // in-progress typing. On a real tab switch the tab unmounts, so re-mount
  // re-seeds the fresh initialValue via useState's initializer, not this effect.
  useEffect(() => {
    setValue(initialValue)
    lastSaved.current = initialValue
    setStatus('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialValue omitted by design (see above)
  }, [resetKey])

  // Flush a pending edit when this tab unmounts.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (valueRef.current !== lastSaved.current) {
        void onSaveRef.current(valueRef.current)
      }
    }
  }, [])

  const onChange = (next: string) => {
    setValue(next)
    setStatus('idle')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (next === lastSaved.current) return
      setStatus('saving')
      void Promise.resolve(onSaveRef.current(next))
        .then(() => {
          lastSaved.current = next
          setStatus('saved')
        })
        .catch(() => setStatus('idle'))
    }, DEBOUNCE_MS)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <label
          htmlFor="detail-note"
          className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary"
        >
          {label}
        </label>
        <span className="text-[11px] text-fg-tertiary">
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
        </span>
      </div>
      <textarea
        id="detail-note"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[300px] w-full resize-y rounded-md border border-border-subtle bg-bg-2 p-3 text-sm leading-relaxed text-fg-primary placeholder:text-fg-tertiary focus:border-border focus:outline-none"
      />
    </div>
  )
}
