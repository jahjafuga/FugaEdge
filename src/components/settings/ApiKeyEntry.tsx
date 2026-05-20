import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import { isPlausibleApiKey } from '@/core/onboarding'
import type { MassiveKeyStatus } from '@shared/massive-types'

// Shared Massive API-key entry UI: the "Get a free key" CTA, the password
// input, the local plausibility check, the save-to-settings flow, and an
// optional post-save verification against Massive.
//
// Consumed by the onboarding modal (step 5 — save-only) and the backfill
// no-key modal (verifyOnSave — pings Massive after save and renders the
// 4-state result inline). The caller owns what happens next via onSaved.
interface ApiKeyEntryProps {
  /** Fired after a successful save. In verifyOnSave mode, carries the
   *  Massive verification result; otherwise null (saved, not verified). */
  onSaved: (status: MassiveKeyStatus | null) => void

  /** After saving, ping Massive and render the 4-state result inline.
   *  Default false — onboarding keeps its save-only path. */
  verifyOnSave?: boolean

  /** Skip the built-in heading/description block — for embedding in a
   *  Modal that supplies its own title/subtitle. Default false. */
  hideHeader?: boolean

  /** Primary button label. Default 'Save and finish'. */
  saveLabel?: string
}

export default function ApiKeyEntry({
  onSaved,
  verifyOnSave = false,
  hideHeader = false,
  saveLabel = 'Save and finish',
}: ApiKeyEntryProps) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keyStatus, setKeyStatus] = useState<MassiveKeyStatus | null>(null)

  const openSignup = () => {
    void ipc.openExternal(
      'https://massive.com/dashboard/signup?redirect=%2Fdashboard%2Fkeys',
    )
  }

  const handleSave = async () => {
    if (saving || !isPlausibleApiKey(value)) return
    const trimmed = value.trim()
    setError(null)
    setKeyStatus(null)
    setSaving(true)
    try {
      await ipc.settingsSave({ polygon_api_key: trimmed })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
      return
    }
    if (!verifyOnSave) {
      // Onboarding save-only path: the caller unmounts this component on
      // success, so there is intentionally no setSaving(false) here.
      onSaved(null)
      return
    }
    // Backfill path: confirm the key with Massive, surface the 4-state
    // result inline, then hand it up — the caller auto-retries on 'valid'.
    // The component stays mounted, so the form is re-enabled afterward.
    setVerifying(true)
    const status = await ipc.testMassiveKey(trimmed)
    setKeyStatus(status)
    setVerifying(false)
    setSaving(false)
    onSaved(status)
  }

  const canSave = !saving && isPlausibleApiKey(value)

  return (
    <div className="flex flex-col gap-4">
      {!hideHeader && (
        <header>
          <h2
            id="onboarding-title"
            className="text-xl font-semibold tracking-tight text-fg-primary"
          >
            Connect Massive (optional)
          </h2>
          <p className="mt-1 text-sm text-fg-tertiary">
            FugaEdge uses Massive to auto-fetch country, shares outstanding,
            and intraday chart data for the tickers you trade. Without an API
            key these features stay unavailable until you add one in Settings.
          </p>
        </header>
      )}

      <button
        type="button"
        onClick={openSignup}
        className="inline-flex h-8 cursor-pointer items-center gap-1.5 self-start rounded-md border border-border-strong bg-bg-1 px-3 text-xs font-semibold text-fg-primary transition-colors duration-150 hover:bg-bg-0 hover:border-gold/60 hover:text-gold"
      >
        Get a free Massive API key
        <ArrowUpRight size={12} strokeWidth={2.25} />
      </button>

      <label className="block">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          API key
        </span>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="paste your massive.com API key"
          disabled={saving}
          className="mt-1 w-full rounded-md border border-border-strong bg-bg-1 px-3 py-2 font-mono text-sm text-fg-primary placeholder:text-fg-tertiary outline-none transition-colors duration-150 focus:border-gold disabled:opacity-50"
        />
      </label>

      {error && (
        <div className="rounded-md border border-loss/40 bg-loss-soft px-3 py-2 text-xs text-fg-secondary">
          {error}
        </div>
      )}

      {keyStatus && (
        <div
          className={`mt-1.5 text-xs ${
            keyStatus.kind === 'valid'
              ? 'text-win'
              : keyStatus.kind === 'invalid'
                ? 'text-danger'
                : 'text-warning'
          }`}
        >
          {keyStatus.kind === 'valid' && '✓ Key verified.'}
          {keyStatus.kind === 'invalid' &&
            "✗ Massive didn't accept that key. Double-check the value and try saving again."}
          {keyStatus.kind === 'rate-limited' &&
            "Key saved. Couldn't fully verify right now — Massive's rate limit was hit. Try Save again in a minute to verify."}
          {keyStatus.kind === 'network-error' &&
            "Key saved. Couldn't reach Massive — check your connection and try Save again to verify."}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 self-start rounded-md bg-gold px-4 text-[11px] font-semibold uppercase tracking-wider text-accent-ink transition-colors duration-150 hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (verifying ? 'Verifying…' : 'Saving…') : saveLabel}
        </button>
        <p className="text-xs text-fg-tertiary">
          You can add or change this anytime in Settings.
        </p>
      </div>
    </div>
  )
}
