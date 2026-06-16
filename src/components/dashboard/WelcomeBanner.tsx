import { useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'

// WELCOME BANNER — a small personal greeting at the top of the dashboard.
// Reads the EXISTING profile display_name (ipc.profileGet) — no new field,
// storage, or IPC; the name is set on the /profile Identity card. Own
// fetch-on-mount (like MarketSentimentCard; no useProfile hook exists).
//
// Honest-empty: an unset / blank name shows a plain "Welcome back" — never a
// dangling comma or a fabricated name. The line renders immediately (the
// no-name form) and fills the name in when the fetch resolves, so there's no
// skeleton flash or layout jump.
export default function WelcomeBanner() {
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ipc
      .profileGet()
      .then((p) => {
        if (cancelled) return
        const dn = p.display_name?.trim()
        setName(dn && dn.length > 0 ? dn : null)
      })
      .catch(() => {
        // A failed profile read must never block the greeting — leave the
        // plain "Welcome back" form.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <h1 className="text-2xl font-semibold tracking-tight text-fg-primary">
      Welcome back
      {name ? (
        <>
          , <span className="text-gold">{name}</span>
        </>
      ) : null}
    </h1>
  )
}
