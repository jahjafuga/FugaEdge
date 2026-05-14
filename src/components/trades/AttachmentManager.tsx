import { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2, Upload, X } from 'lucide-react'
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
  const hasItems = items != null && items.length > 0

  // v0.1.5 inverted layout: thumbnails are the primary content; the upload
  // path is a small top-right button. Drag-and-drop still works anywhere
  // on the tab via the outer wrapper; the visible drop overlay only
  // surfaces while a drag is over the tab.
  return (
    <div
      className="relative space-y-3"
      onDragOver={(e) => {
        e.preventDefault()
        if (!busy) setOver(true)
      }}
      onDragLeave={(e) => {
        // Only clear when the drag leaves the wrapper itself, not when it
        // crosses between child elements (which fire dragleave-then-
        // dragenter rapidly).
        if (e.currentTarget === e.target) setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (busy) return
        if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
      }}
    >
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

      {hasItems && (
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Screenshots ({items.length})
          </div>
          <button
            type="button"
            onClick={() => !busy && inputRef.current?.click()}
            disabled={busy}
            className="inline-flex h-9 w-[140px] cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border-strong bg-bg-1 px-3 text-xs font-semibold text-fg-primary transition-colors duration-150 hover:border-gold/60 hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ImagePlus size={14} strokeWidth={2.25} />
            {busy ? 'Uploading…' : 'Add Screenshot'}
          </button>
        </div>
      )}

      {rejected.length > 0 && (
        <div className="rounded-md border border-loss/30 bg-loss/[0.06] p-3 text-xs">
          <div className="mb-1 uppercase tracking-wider text-loss">
            Some files skipped
          </div>
          <ul className="space-y-0.5">
            {rejected.map((r, i) => (
              <li key={i} className="text-fg-secondary">
                <span className="text-fg-primary">{r.name}</span> — {r.reason}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setRejected([])}
            className="mt-2 text-[10px] uppercase tracking-wider text-fg-tertiary hover:text-fg-primary"
          >
            dismiss
          </button>
        </div>
      )}

      {err && (
        <div className="rounded-md border border-loss/40 bg-loss/[0.08] p-3 text-xs text-loss">
          {err}
        </div>
      )}

      {items === null ? (
        <div className="text-xs text-fg-tertiary">Loading attachments…</div>
      ) : items.length === 0 ? (
        <EmptyState
          busy={busy}
          onClick={() => !busy && inputRef.current?.click()}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((a) => (
            <ThumbnailTile
              key={a.id}
              attachment={a}
              onOpen={() => setLightboxId(a.id)}
              onDelete={() => {
                if (window.confirm(`Delete "${a.original_name}"?`)) {
                  handleDelete(a.id)
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Drag overlay — surfaces ONLY while a drag is over the tab. */}
      {over && !busy && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-gold/60 bg-gold/[0.06] backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-2 text-gold">
            <Upload size={28} strokeWidth={1.75} />
            <span className="text-sm font-semibold">Drop to upload</span>
            <span className="text-[11px] text-gold/80">
              PNG / JPG / GIF / WebP · 10 MB max
            </span>
          </div>
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

function EmptyState({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-subtle bg-bg-2 px-6 py-12 text-center">
      <ImagePlus size={32} strokeWidth={1.5} className="text-fg-muted" />
      <div className="text-sm text-fg-tertiary">No screenshots yet</div>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-gold px-4 text-xs font-semibold text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-gold-hover active:bg-gold-dim disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ImagePlus size={14} strokeWidth={2.25} />
        {busy ? 'Uploading…' : 'Add Screenshot'}
      </button>
      <div className="text-[10px] text-fg-muted">
        Or drag and drop anywhere on this tab
      </div>
    </div>
  )
}

function ThumbnailTile({
  attachment: a,
  onOpen,
  onDelete,
}: {
  attachment: AttachmentRecord
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full overflow-hidden rounded-lg border border-border-subtle bg-bg-1 shadow-sm transition-all duration-150 ease-out-soft hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-md"
        title={`${a.original_name} · ${humanSize(a.size_bytes)}`}
        style={{ height: 180 }}
      >
        <img
          src={srcFor(a.trade_id, a.filename)}
          alt={a.original_name}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        aria-label="Delete screenshot"
        title="Delete screenshot"
        className="absolute right-2 top-2 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border-strong bg-bg-1/95 text-fg-tertiary opacity-0 shadow-sm transition-all duration-150 hover:border-loss/60 hover:text-loss group-hover:opacity-100"
      >
        <Trash2 size={13} strokeWidth={2} />
      </button>
      <div className="mt-1.5 flex items-baseline justify-between gap-2 px-0.5">
        <span className="truncate text-xs text-fg-secondary" title={a.original_name}>
          {a.original_name}
        </span>
        <span className="text-[10px] text-fg-muted tnum">
          {humanSize(a.size_bytes)}
        </span>
      </div>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-1/85 p-6 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] max-w-[92vw] flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 rounded-md border border-border-subtle bg-bg-2/95 px-4 py-2 shadow-sm">
          <div className="min-w-0">
            <div className="truncate text-sm text-fg-primary">
              {attachment.original_name}
            </div>
            <div className="text-[10px] text-fg-tertiary tnum">
              {attachment.mime_type} · {humanSize(attachment.size_bytes)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete "${attachment.original_name}"?`)) onDelete()
              }}
              className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-loss/40 px-2 text-[10px] font-semibold uppercase tracking-wider text-loss transition-colors hover:bg-loss/[0.10]"
            >
              <Trash2 size={11} strokeWidth={2.25} />
              Delete
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border-subtle text-fg-tertiary transition-colors hover:border-gold/40 hover:text-gold"
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        </div>

        <img
          src={srcFor(attachment.trade_id, attachment.filename)}
          alt={attachment.original_name}
          className="max-h-[80vh] max-w-[92vw] rounded-md border border-border-subtle object-contain"
          draggable={false}
        />
      </div>
    </div>
  )
}
