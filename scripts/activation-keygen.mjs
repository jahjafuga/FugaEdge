#!/usr/bin/env node
// FugaEdge activation keygen — v0.2.5 Session 0.5 (spec §C / D2).
//
// Plain Node ESM, no build step. Ed25519 via @noble/ed25519's async API
// (rides Node's built-in WebCrypto — no extra hash dependency, per D17/A6).
//
//   node scripts/activation-keygen.mjs init
//       Generate the cohort signing keypair → secrets/activation-signing-key.json.
//       REFUSES to run if the file already exists (rotating the key would
//       invalidate every issued cohort key — delete the file manually only
//       if that is genuinely what you want).
//
//   node scripts/activation-keygen.mjs issue --name "Jane T" --email "jane@x.com"
//       Sign {name, email, issued_at} and print the activation key:
//       FUGA-<base64url(payload)>.<base64url(signature)>
//
//   node scripts/activation-keygen.mjs inspect <key>
//       Decode + verify a key against the stored PUBLIC key; print the
//       payload, or the failure reason.

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ed from '@noble/ed25519'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SECRETS_DIR = join(ROOT, 'secrets')
const KEY_PATH = join(SECRETS_DIR, 'activation-signing-key.json')

// Node's Buffer supports base64url (unpadded) natively. Buffer is fine in
// this node-only script — the "no Buffer" rule applies to src/core only.
const toB64url = (bytes) => Buffer.from(bytes).toString('base64url')
const fromB64url = (s) => new Uint8Array(Buffer.from(s, 'base64url'))

async function readKeypair() {
  if (!existsSync(KEY_PATH)) {
    console.error(`No signing keypair at ${KEY_PATH} — run \`init\` first.`)
    process.exit(1)
  }
  return JSON.parse(await readFile(KEY_PATH, 'utf8'))
}

async function cmdInit() {
  if (existsSync(KEY_PATH)) {
    console.error(
      `REFUSING to overwrite ${KEY_PATH}\n` +
        'A signing keypair already exists. Rotating it would invalidate every\n' +
        'issued cohort key. If you truly intend that, delete the file yourself\n' +
        'and re-run init.',
    )
    process.exit(1)
  }
  const secretKey = ed.utils.randomSecretKey()
  const publicKey = await ed.getPublicKeyAsync(secretKey)
  const record = {
    privateKeyHex: ed.etc.bytesToHex(secretKey),
    publicKeyHex: ed.etc.bytesToHex(publicKey),
    createdAt: new Date().toISOString(),
  }
  await mkdir(SECRETS_DIR, { recursive: true })
  await writeFile(KEY_PATH, JSON.stringify(record, null, 2) + '\n', 'utf8')
  console.log(`publicKeyHex: ${record.publicKeyHex}`)
  console.log('')
  console.log('!'.repeat(72))
  console.log('!! BACK THIS FILE UP OUTSIDE THE REPO — NOW:')
  console.log(`!!   ${KEY_PATH}`)
  console.log('!! It is gitignored and exists nowhere else. Lose it and you can')
  console.log('!! never issue another key for this cohort public key.')
  console.log('!'.repeat(72))
}

function argValue(flag) {
  const i = process.argv.indexOf(flag)
  if (i === -1 || i === process.argv.length - 1) return null
  return process.argv[i + 1]
}

async function cmdIssue() {
  const name = argValue('--name')
  const email = argValue('--email')
  if (!name || !email) {
    console.error('Usage: issue --name "<name>" --email "<email>"')
    process.exit(1)
  }
  const { privateKeyHex } = await readKeypair()
  const payload = { name, email, issued_at: new Date().toISOString() }
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const sig = await ed.signAsync(payloadBytes, ed.etc.hexToBytes(privateKeyHex))
  console.log(`FUGA-${toB64url(payloadBytes)}.${toB64url(sig)}`)
}

async function cmdInspect() {
  const raw = process.argv[3]
  if (!raw) {
    console.error('Usage: inspect <key>')
    process.exit(1)
  }
  const { publicKeyHex } = await readKeypair()
  const key = raw.trim()
  if (!key.startsWith('FUGA-')) {
    console.error('FAIL: key must start with FUGA-')
    process.exit(1)
  }
  const parts = key.slice('FUGA-'.length).split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    console.error('FAIL: expected exactly one dot separating payload and signature')
    process.exit(1)
  }
  let payloadBytes, sigBytes
  try {
    payloadBytes = fromB64url(parts[0])
    sigBytes = fromB64url(parts[1])
  } catch {
    console.error('FAIL: base64url decode failed')
    process.exit(1)
  }
  const ok = await ed
    .verifyAsync(sigBytes, payloadBytes, ed.etc.hexToBytes(publicKeyHex))
    .catch(() => false)
  if (!ok) {
    console.error('FAIL: signature does not verify against the stored public key')
    process.exit(1)
  }
  console.log('VERIFIED. Payload:')
  console.log(new TextDecoder().decode(payloadBytes))
}

const cmd = process.argv[2]
if (cmd === 'init') await cmdInit()
else if (cmd === 'issue') await cmdIssue()
else if (cmd === 'inspect') await cmdInspect()
else {
  console.error('Usage: activation-keygen.mjs <init | issue | inspect>')
  process.exit(1)
}
