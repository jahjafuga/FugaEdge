// v0.2.5 Phase B Session 4 — avatar picker + the L21 pipeline:
// <input type=file> → canvas center-crop to square → 256×256 →
// JPEG data-URL (q 0.85) → size sanity check → profileUpdate. Transparency
// loss accepted (photos). Display is circle-masked; the fallback is an
// initials disc from display_name (or a neutral icon when unnamed).
// Renderer-native file input per the AttachmentManager precedent; CSP
// img-src already allows data: URLs.
//
// Profile redesign (Slice 1) — added the `hero` variant: the disc itself is the
// trigger with a hover camera overlay (no text link), for the hero identity
// band. The upload pipeline (processAvatarFile → profileUpdate) is unchanged.

import { useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import Avatar from '@/components/ui/Avatar'
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
  /** Disc diameter in px. Default 112 (the identity size). */
  size?: number
  /** Hero variant: the disc is the trigger with a hover camera overlay and no
   *  text link. Same upload flow (processAvatarFile → profileUpdate). */
  hero?: boolean
}

export default function AvatarPicker({
  profile,
  onUpdated,
  size = 112,
  hero = false,
}: AvatarPickerProps) {
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

  const fileInput = (
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
  )

  const label = profile.avatar_data
    ? profileStrings.avatar.change
    : profileStrings.avatar.add

  if (hero) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          title={label}
          aria-label={label}
          className="group relative block rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-gold/50"
        >
          <Avatar
            avatarData={profile.avatar_data}
            initials={initials}
            size={size}
            testId="avatar-disc"
          />
          <span
            className={`absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white transition-opacity duration-150 ${
              busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Camera className="h-5 w-5" strokeWidth={2} />
            )}
          </span>
        </button>
        {fileInput}
        {error && (
          <p className="absolute left-1/2 top-full mt-1 w-44 -translate-x-1/2 text-center text-[10px] text-danger">
            {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Avatar
        avatarData={profile.avatar_data}
        initials={initials}
        size={size}
        testId="avatar-disc"
      />
      {fileInput}
      <button
        type="button"
        className="text-xs text-fg-tertiary underline-offset-2 hover:text-fg-primary hover:underline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? profileStrings.avatar.processing : label}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
