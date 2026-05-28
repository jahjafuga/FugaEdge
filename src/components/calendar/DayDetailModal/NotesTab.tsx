import { useEffect, useRef, useState } from 'react'
import { dayRepo } from '@/data/dayRepo'

const DEBOUNCE_MS = 500

interface NotesTabProps {
  date: string
  note: string | null
}

// v0.2.2 Day 4 — day-level free-text note, stored on session_meta.notes.
// Debounced 500ms autosave; a pending edit also flushes on unmount (tab
// switch / modal close) so nothing is lost inside the debounce window.
export default function NotesTab({ date, note }: NotesTabProps) {
  const [value, setValue] = useState(note ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef(note ?? '')
  // Mirror current value/date into refs so the unmount-only effect can flush
  // the latest pending edit without re-subscribing on every keystroke.
  const valueRef = useRef(value)
  const dateRef = useRef(date)
  valueRef.current = value
  dateRef.current = date

  // Reset when the modal switches to a different day.
  useEffect(() => {
    setValue(note ?? '')
    lastSaved.current = note ?? ''
    setStatus('idle')
  }, [date, note])

  // Flush a pending edit when this tab unmounts.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (valueRef.current !== lastSaved.current) {
        void dayRepo.saveDayNote(dateRef.current, valueRef.current)
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
      void dayRepo
        .saveDayNote(dateRef.current, next)
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
          htmlFor="day-note"
          className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary"
        >
          Day notes
        </label>
        <span className="text-[11px] text-fg-tertiary">
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
        </span>
      </div>
      <textarea
        id="day-note"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="How did the day go? Plan, execution, what to repeat or fix…"
        className="min-h-[300px] w-full resize-y rounded-md border border-border-subtle bg-bg-2 p-3 text-sm leading-relaxed text-fg-primary placeholder:text-fg-tertiary focus:border-border focus:outline-none"
      />
    </div>
  )
}
