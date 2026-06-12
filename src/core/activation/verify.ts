// v0.2.5 §C / D2 — pure activation-key verifier.
//
// Key format (produced by scripts/activation-keygen.mjs):
//   FUGA-<base64url(payload-json)>.<base64url(ed25519-signature)>
//
// Pure module: no electron, no node:* imports, no Buffer — base64url decodes
// via atob, text via TextDecoder, signature check via @noble/ed25519's ASYNC
// API (rides WebCrypto in both the renderer and Node 19+; the sync variants
// would require @noble/hashes — a D17 violation — so they are never used).
// Runs identically in the renderer today and a web backend later.

import * as ed from '@noble/ed25519'
import { ACTIVATION_PUBLIC_KEY_HEX } from '@shared/activation-pubkey'

export interface ActivationPayload {
  name: string
  email: string
  issued_at: string
}

export type VerifyFailureReason =
  | 'malformed-key' // structure/encoding wrong before any crypto runs
  | 'bad-signature' // bytes decode but the signature does not verify
  | 'bad-payload' // signature ok but payload is not the expected JSON shape
  | 'verify-error' // unexpected internal failure (e.g. WebCrypto unavailable)

export type VerifyResult =
  | { ok: true; payload: ActivationPayload }
  | { ok: false; reason: VerifyFailureReason }

const PREFIX = 'FUGA-'
const B64URL_RE = /^[A-Za-z0-9_-]+$/

/** Split a raw key into its base64url payload + signature parts.
 *  Trims surrounding whitespace; requires the FUGA- prefix and exactly one
 *  dot with non-empty sides. Returns null on any structural mismatch. */
export function parseActivationKey(
  raw: string,
): { payloadB64: string; sigB64: string } | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith(PREFIX)) return null
  const body = trimmed.slice(PREFIX.length)
  const parts = body.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return { payloadB64: parts[0], sigB64: parts[1] }
}

// base64url → bytes via atob (no Buffer, per the web-portability rule).
// Returns null when the input isn't base64url or atob rejects it.
function b64urlToBytes(s: string): Uint8Array | null {
  if (!B64URL_RE.test(s)) return null
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  let binary: string
  try {
    binary = atob(padded)
  } catch {
    return null
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function parsePayload(bytes: Uint8Array): ActivationPayload | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const p = parsed as Record<string, unknown>
  if (
    typeof p.name !== 'string' ||
    typeof p.email !== 'string' ||
    typeof p.issued_at !== 'string'
  ) {
    return null
  }
  return { name: p.name, email: p.email, issued_at: p.issued_at }
}

/** Verify a raw activation key. Never throws — every failure mode collapses
 *  to {ok:false, reason}. publicKeyHex defaults to the shipped cohort key
 *  and is injectable so tests can use an ephemeral keypair. */
export async function verifyActivationKey(
  raw: string,
  publicKeyHex: string = ACTIVATION_PUBLIC_KEY_HEX,
): Promise<VerifyResult> {
  try {
    const parsed = parseActivationKey(raw)
    if (!parsed) return { ok: false, reason: 'malformed-key' }

    const payloadBytes = b64urlToBytes(parsed.payloadB64)
    const sigBytes = b64urlToBytes(parsed.sigB64)
    if (!payloadBytes || !sigBytes) return { ok: false, reason: 'malformed-key' }

    const verified = await ed
      .verifyAsync(sigBytes, payloadBytes, ed.etc.hexToBytes(publicKeyHex))
      // noble throws on structurally-invalid signatures/keys (wrong length
      // etc.) — collapse to an ordinary failed verification.
      .catch(() => false)
    if (!verified) return { ok: false, reason: 'bad-signature' }

    const payload = parsePayload(payloadBytes)
    if (!payload) return { ok: false, reason: 'bad-payload' }

    return { ok: true, payload }
  } catch {
    return { ok: false, reason: 'verify-error' }
  }
}
