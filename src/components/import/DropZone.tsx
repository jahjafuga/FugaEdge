import { useCallback, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import type { ImportIssue } from '@shared/import-types'
import { fileReadFailed, unsupportedFileType } from '@/core/import/import-errors'
import ImportIssues from '@/components/import/ImportIssues'

// Mirrors the upstream PreviewInputFile shape: CSV files carry `text`,
// XLSX files carry `bytes`. Mutually exclusive at runtime; the IPC
// handler routes by filename extension.
interface DroppedFile {
  name: string
  text?: string
  bytes?: Uint8Array
}

interface DropZoneProps {
  onFiles: (files: DroppedFile[]) => void
  disabled?: boolean
}

function isXlsxName(name: string): boolean {
  return name.toLowerCase().endsWith('.xlsx')
}

// Ocean One exports a legacy OLE2 .xls (binary, like .xlsx) — read as bytes.
function isXlsName(name: string): boolean {
  return name.toLowerCase().endsWith('.xls')
}

function isCsvName(name: string): boolean {
  return name.toLowerCase().endsWith('.csv')
}

export default function DropZone({ onFiles, disabled }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [issue, setIssue] = useState<ImportIssue | null>(null)

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      setIssue(null)
      const files = Array.from(fileList)
      if (files.length === 0) return
      const bad = files.find(
        (f) => !isCsvName(f.name) && !isXlsxName(f.name) && !isXlsName(f.name),
      )
      if (bad) {
        setIssue(unsupportedFileType(bad.name))
        return
      }
      try {
        const read = await Promise.all(
          files.map(async (f): Promise<DroppedFile> => {
            if (isXlsxName(f.name) || isXlsName(f.name)) {
              // XLSX/XLS are binary — read as ArrayBuffer, wrap in Uint8Array
              // so the value survives structured-clone IPC + contextBridge
              // without an encoding step.
              const buf = await f.arrayBuffer()
              return { name: f.name, bytes: new Uint8Array(buf) }
            }
            return { name: f.name, text: await f.text() }
          }),
        )
        onFiles(read)
      } catch {
        setIssue(fileReadFailed(files.map((f) => f.name).join(', ')))
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
            Drop your broker export file(s)
          </div>
          <div className="mt-1 text-xs text-fg-secondary">
            DAS Trader, Webull, Ocean One, TradeZero, Lightspeed, or ThinkorSwim files. Drag any combination.
          </div>
        </div>
        <div className="mt-3 max-w-md text-[11px] uppercase tracking-wider text-fg-tertiary">
          Imports always append. Nothing is overwritten.
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,application/vnd.ms-excel"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {issue && (
        <div className="mt-3">
          <ImportIssues issues={[issue]} />
        </div>
      )}
    </div>
  )
}
