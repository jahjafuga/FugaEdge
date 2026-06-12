// FugaEdge cohort activation public key — v0.2.5 Session 0.5 (spec §C / D2).
//
// Generated 2026-06-12 by `node scripts/activation-keygen.mjs init`. The
// matching PRIVATE key lives in secrets/activation-signing-key.json —
// gitignored, never committed, backed up by the founder outside the repo.
// Rotating the keypair invalidates every issued cohort key; the keygen
// script refuses to re-init while the secrets file exists.
//
// This constant is intentionally public: signature verification only.
export const ACTIVATION_PUBLIC_KEY_HEX =
  '639750d85aeb427a765817705156c96906815d1cec283441564c9a780e296fe7'
