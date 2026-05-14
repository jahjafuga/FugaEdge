import { useEffect, useState } from 'react'
import type { TradeNote, UpdateNoteInput } from '@shared/trades-types'

interface NoteEditorProps {
  tradeId: number
  note: TradeNote | null
  onSave: (input: UpdateNoteInput) => Promise<void>
}

function isDirty(a: TradeNote | null, text: string): boolean {
  return (a?.text ?? '') !== text
}

export default function NoteEditor({ tradeId, note, onSave }: NoteEditorProps) {
  const [text, setText] = useState(note?.text ?? '')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Reset state when the trade changes underneath us (e.g. parent re-fetches).
  useEffect(() => {
    setText(note?.text ?? '')
    setSavedAt(null)
  }, [tradeId, note])

  const dirty = isDirty(note, text)

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onSave({ trade_id: tradeId, text })
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted">Note</div>
        <div className="flex items-center gap-3">
          {savedAt && !dirty && (
            <span className="text-[10px] uppercase tracking-wider text-win">saved</span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="rounded-md bg-gold px-4 py-1.5 text-xs font-medium text-bg transition-all duration-150 hover:bg-gold-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="Plan, thesis, mistakes, lessons…"
        className="w-full resize-y rounded border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus:border-gold focus:outline-none"
      />
    </div>
  )
}
