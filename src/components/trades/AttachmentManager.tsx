import { useCallback, useEffect, useRef, useState } from 'react'
import { ipc } from '@/lib/ipc'
import type {
  AddAttachmentFile,
  AttachmentRecord,
} from '@shared/attachment-types'

interface AttachmentManagerProps {
  tradeId: number
}

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const MAX_BYTES = 10 * 1024 * 1024

function srcFor(tradeId: number, filename: string): string {
  // Filename is a server-generated UUID, but encode just in case to keep the
  // URL valid for the custom protocol resolver.
  return `electron://attachments/${tradeId}/${encodeURIComponent(filename)}`
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function AttachmentManager({ tradeId }: AttachmentManagerProps) {
  const [items, setItems] = useState<AttachmentRecord[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [rejected, setRejected] = useState<{ name: string; reason: string }[]>([])
  const [over, setOver] = useState(false)
  const [lightboxId, setLightboxId] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load existing attachments on mount + whenever the trade changes.
  useEffect(() => {
    let cancelled = false
    setItems(null)
    ipc
      .attachmentsList(tradeId)
      .then((list) => {
        if (!cancelled) setItems(list)
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [tradeId])

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => ALLOWED.has(f.type))
      const unsupported = Array.from(files).filter((f) => !ALLOWED.has(f.type))
      const tooBig = list.filter((f) => f.size > MAX_BYTES)
      const good = list.filter((f) => f.size <= MAX_BYTES)

      if (good.length === 0 && unsupported.length === 0 && tooBig.length === 0) return

      setBusy(true)
      setErr(null)
      const upfrontRejects: { name: string; reason: string }[] = [
        ...unsupported.map((f) => ({
          name: f.name,
          reason: `Unsupported type: ${f.type || 'unknown'}`,
        })),
        ...tooBig.map((f) => ({
          name: f.name,
          reason: `Too large (${(f.size / 1024 / 1024).toFixed(1)} MB; cap is 10 MB)`,
        })),
      ]

      try {
        const payload: AddAttachmentFile[] = await Promise.all(
          good.map(async (f) => ({
            original_name: f.name,
            mime_type: f.type,
            data: new Uint8Array(await f.arrayBuffer()),
          })),
        )
        const result =
          payload.length > 0
            ? await ipc.attachmentsAdd({ trade_id: tradeId, files: payload })
            : { added: [], rejected: [] as { name: string; reason: string }[] }

        setItems((prev) => [...(prev ?? []), ...result.added])
        const combined = [...upfrontRejects, ...result.rejected]
        setRejected(combined)
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [tradeId],
  )

  const handleDelete = useCallback(async (id: number) => {
    setErr(null)
    try {
      const removed = await ipc.attachmentsDelete(id)
      if (removed) {
        setItems((prev) => (prev ?? []).filter((x) => x.id !== id))
      }
      setLightboxId((cur) => (cur === id ? null : cur))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const openLightbox = items?.find((x) => x.id === lightboxId) ?? null

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-disabled={busy}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (busy) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!busy) setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          if (busy) return
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
        }}
        className={`flex flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-5 text-center text-xs transition-all duration-150 ease-smooth ${
          busy
            ? 'cursor-not-allowed border-white/[0.06] opacity-60'
            : over
              ? 'border-gold/60 bg-gold/[0.06] text-gold'
              : 'border-white/[0.08] bg-white/[0.015] text-subtle hover:border-gold/40 hover:text-gold'
        }`}
      >
        <span className="font-serif text-lg leading-none">↧</span>
        <span>
          {busy
            ? 'Saving…'
            : 'Drop chart screenshots here, or click to choose'}
        </span>
        <span className="font-mono text-[10px] text-muted">
          PNG / JPG / GIF / WebP · 10 MB max
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {rejected.length > 0 && (
        <div className="rounded-md border border-red/30 bg-red/[0.06] p-3 text-xs">
          <div className="mb-1 uppercase tracking-wider text-red">
            Some files skipped
          </div>
          <ul className="space-y-0.5">
            {rejected.map((r, i) => (
              <li key={i} className="text-subtle">
                <span className="font-mono text-text">{r.name}</span> — {r.reason}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setRejected([])}
            className="mt-2 text-[10px] uppercase tracking-wider text-muted hover:text-text"
          >
            dismiss
          </button>
        </div>
      )}

      {err && (
        <div className="rounded-md border border-red/40 bg-red/[0.08] p-3 text-xs text-red">
          {err}
        </div>
      )}

      {items === null ? (
        <div className="text-xs text-muted">Loading attachments…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-muted">No attachments yet.</div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {items.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setLightboxId(a.id)}
              className="group relative aspect-[4/3] overflow-hidden rounded-md border border-white/[0.06] bg-bg/40 transition-all duration-150 hover:border-gold/40"
              title={`${a.original_name} · ${humanSize(a.size_bytes)}`}
            >
              <img
                src={srcFor(a.trade_id, a.filename)}
                alt={a.original_name}
                className="h-full w-full object-cover"
                draggable={false}
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-bg/85 to-transparent px-2 py-1 text-[10px] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <span className="truncate font-mono text-text">{a.original_name}</span>
                <span className="font-mono text-muted">{humanSize(a.size_bytes)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {openLightbox && (
        <Lightbox
          attachment={openLightbox}
          onClose={() => setLightboxId(null)}
          onDelete={() => handleDelete(openLightbox.id)}
        />
      )}
    </div>
  )
}

function Lightbox({
  attachment,
  onClose,
  onDelete,
}: {
  attachment: AttachmentRecord
  onClose: () => void
  onDelete: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-6 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] max-w-[92vw] flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 rounded-md border border-white/[0.06] bg-bg/95 px-4 py-2">
          <div className="min-w-0">
            <div className="truncate font-mono text-sm text-text">
              {attachment.original_name}
            </div>
            <div className="font-mono text-[10px] text-muted">
              {attachment.mime_type} · {humanSize(attachment.size_bytes)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete "${attachment.original_name}"?`)) onDelete()
              }}
              className="rounded border border-red/40 px-2 py-1 text-[10px] uppercase tracking-wider text-red transition-colors hover:bg-red/[0.10]"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-white/[0.08] px-2 py-1 text-[10px] uppercase tracking-wider text-subtle transition-colors hover:border-gold/40 hover:text-gold"
            >
              Close
            </button>
          </div>
        </div>

        <img
          src={srcFor(attachment.trade_id, attachment.filename)}
          alt={attachment.original_name}
          className="max-h-[80vh] max-w-[92vw] rounded-md border border-white/[0.06] object-contain"
          draggable={false}
        />
      </div>
    </div>
  )
}
