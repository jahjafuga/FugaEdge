// v0.2.5 Phase B Session 4 — avatar picker + the L21 pipeline:
// <input type=file> → canvas center-crop to square → 256×256 →
// JPEG data-URL (q 0.85) → size sanity check → profileUpdate. Transparency
// loss accepted (photos). Display is circle-masked; the fallback is an
// initials disc from display_name (or a neutral icon when unnamed).
// Renderer-native file input per the AttachmentManager precedent; CSP
// img-src already allows data: URLs.

import { useRef, useState } from 'react'
import { User } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import type { Profile } from '@shared/identity-types'
import { initialsFrom } from './helpers'
import { profileStrings } from './strings'

const AVATAR_SIDE = 256
const JPEG_QUALITY = 0.85
// Data-URL length cap (~chars ≈ bytes × 4/3): a 256² JPEG at q0.85 lands
// far below this; the cap only rejects pathological inputs (L21 sanity).
const MAX_DATA_URL_LENGTH = 200 * 1024

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image decode failed'))
    img.src = url
  })
}

/** Exported for the pipeline's CDP smoke; pure-DOM, no IPC. */
export async function processAvatarFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const sx = (img.naturalWidth - side) / 2
    const sy = (img.naturalHeight - side) / 2
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIDE
    canvas.height = AVATAR_SIDE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unavailable')
    ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIDE, AVATAR_SIDE)
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  } finally {
    URL.revokeObjectURL(url)
  }
}

interface AvatarPickerProps {
  profile: Profile
  onUpdated: (profile: Profile) => void
}

export default function AvatarPicker({ profile, onUpdated }: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initials = initialsFrom(profile.display_name)

  async function handleFile(file: File) {
    setBusy(true)
    setError(null)
    try {
      const dataUrl = await processAvatarFile(file)
      if (dataUrl.length > MAX_DATA_URL_LENGTH) {
        setError(profileStrings.avatar.tooLarge)
        return
      }
      const updated = await ipc.profileUpdate({ avatar_data: dataUrl })
      onUpdated(updated)
    } catch {
      setError(profileStrings.avatar.readError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-bg-3"
        data-testid="avatar-disc"
      >
        {profile.avatar_data ? (
          <img
            src={profile.avatar_data}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : initials ? (
          <span className="text-3xl font-semibold text-gold">{initials}</span>
        ) : (
          <User className="h-10 w-10 text-fg-tertiary" />
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        className="text-xs text-fg-tertiary underline-offset-2 hover:text-fg-primary hover:underline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy
          ? profileStrings.avatar.processing
          : profile.avatar_data
            ? profileStrings.avatar.change
            : profileStrings.avatar.add}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
