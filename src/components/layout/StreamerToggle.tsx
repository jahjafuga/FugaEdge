// Beat 4 — the header streamer-mode toggle: an eye-icon beside ThemeToggle
// (same h-9 w-9 button shape). Eye = dollars visible (click to hide);
// EyeOff = hidden (click to show). One class flip on <html> — no
// re-render storm; the masked state is pure CSS.

import { Eye, EyeOff } from 'lucide-react'
import { useStreamerMode } from '@/lib/streamerMode'

export default function StreamerToggle() {
  const { on, setOn } = useStreamerMode()
  const label = on ? 'Show dollar amounts' : 'Hide dollar amounts'
  return (
    <button
      type="button"
      onClick={() => setOn(!on)}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 ease-out-soft hover:border-border hover:text-fg-primary"
    >
      {on ? <EyeOff size={14} strokeWidth={2} /> : <Eye size={14} strokeWidth={2} />}
    </button>
  )
}
