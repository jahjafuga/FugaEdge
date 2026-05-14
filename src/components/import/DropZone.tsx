import { useCallback, useRef, useState } from 'react'
import { Download } from 'lucide-react'

interface DroppedFile {
  name: string
  text: string
}

interface DropZoneProps {
  onFiles: (files: DroppedFile[]) => void
  disabled?: boolean
}

export default function DropZone({ onFiles, disabled }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      setError(null)
      const files = Array.from(fileList)
      if (files.length === 0) return
      const bad = files.find((f) => !f.name.toLowerCase().endsWith('.csv'))
      if (bad) {
        setError(`Only .csv files are supported (got "${bad.name}").`)
        return
      }
      try {
        const read = await Promise.all(
          files.map(async (f) => ({ name: f.name, text: await f.text() })),
        )
        onFiles(read)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to read file.')
      }
    },
    [onFiles],
  )

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          if (disabled) return
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
        }}
        className={`group flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-16 text-center transition-all duration-200 ease-smooth ${
          disabled
            ? 'cursor-not-allowed border-border-strong bg-bg-header/40 opacity-50'
            : over
              ? 'border-gold bg-gold/[0.04]'
              : 'border-border-strong bg-bg-header hover:border-gold/60 hover:bg-bg-header/80'
        }`}
      >
        <div className="text-gold transition-transform duration-200 group-hover:scale-105">
          <Download size={36} strokeWidth={1.75} />
        </div>
        <div>
          <div className="text-base font-medium text-fg-primary">
            Drop Trades.csv and/or the daily summary CSV
          </div>
          <div className="mt-1 text-xs text-fg-secondary">
            Drag both at once, or one at a time. Click to choose files.
          </div>
        </div>
        <div className="mt-3 max-w-md text-[11px] uppercase tracking-wider text-fg-tertiary">
          Imports always append. Nothing is overwritten.
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {error && (
        <div className="mt-3 rounded-md border border-loss/40 bg-loss-soft px-4 py-2 text-sm text-loss">
          {error}
        </div>
      )}
    </div>
  )
}
