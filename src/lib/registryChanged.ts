// Stage 3 beat 2.5 — the sibling notify: a MINIMAL module-level
// subscribe/notify pair for 'the accounts registry changed'. No payload —
// the announcement is the whole message; subscribers refetch what they
// need. Mirrors the theme.ts / refreshStore.ts listener-Set idiom (the
// house external-store pattern) without the store: nothing here holds
// state, so there is no snapshot to sync.
//
// Direction is ONE-WAY by ruling: registry mutations announce; the
// Balances card listens. Cash-event mutations change no registry data and
// announce nothing. The switcher keeps its pull-on-open freshness — do not
// wire it here.

type Listener = () => void

const listeners = new Set<Listener>()

/** Subscribe to registry-changed announcements. Returns the unsubscribe
 *  fn — call it in a useEffect cleanup (strict-mode double-mount safe). */
export function subscribeRegistryChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Announce a successful registry mutation. Safe with zero subscribers.
 *  Iterates a snapshot so a listener unsubscribing mid-notify is safe. */
export function notifyRegistryChanged(): void {
  for (const l of [...listeners]) l()
}
