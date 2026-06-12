// v0.2.5 Phase A — ULID generation (spec §B / D17: ulidx is the release's
// second and final new dependency).
//
// Pure isomorphic module: no electron, no node:* imports — ulidx itself is
// isomorphic (WebCrypto randomness), so this runs identically in the main
// process today and a web backend later. The monotonic factory guarantees
// ids minted within the same millisecond still sort by creation order —
// xp_events relies on lexicographic id order matching insert order.
import { monotonicFactory } from 'ulidx'

const mint = monotonicFactory()

/** A new 26-char Crockford-base32 ULID, monotonic within this process. */
export function newUlid(): string {
  return mint()
}
