import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import { buildOnboardingKeySave } from '@/core/onboarding'

// ONBOARDING — the "Connect data providers" step (step 5). Collects the two
// OPTIONAL free API keys save-only (no verify, matching the prior Massive-only
// onboarding flow), then completes onboarding via onComplete.
//
// Self-contained on purpose: the shared ApiKeyEntry gates its save on the
// Massive key, so it cannot accept an FMP-only submission. This step's single
// save persists whichever keys are plausible (buildOnboardingKeySave) and is
// enabled when EITHER is. ApiKeyEntry is left untouched for the backfill no-key
// modal. Renderer UI + ipc only; no DB access (ARCHITECTURE #1).

const MASSIVE_SIGNUP = 'https://massive.com/dashboard/signup?redirect=%2Fdashboard%2Fkeys'
const FMP_SIGNUP = 'https://site.financialmodelingprep.com/developer/docs/dashboard'

interface ApiKeysStepProps {
  /** Runs the rest of the onboarding commit + closes the modal. */
  onComplete: () => void
}

export default function ApiKeysStep({ onComplete }: ApiKeysStepProps) {
  const [massive, setMassive] = useState('')
  const [fmp, setFmp] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const payload = buildOnboardingKeySave(massive, fmp)
  const canSave = !saving && (payload.polygon_api_key != null || payload.fmp_api_key != null)

  const handleSave = async () => {
    if (!canSave) return
    setError(null)
    setSaving(true)
    try {
      await ipc.settingsSave(payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
      return
    }
    // Save-only path: the parent unmounts the modal on completion, so there is
    // intentionally no setSaving(false) here (mirrors ApiKeyEntry).
    onComplete()
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2
          id="onboarding-title"
          className="text-xl font-semibold tracking-tight text-fg-primary"
        >
          Connect data providers (optional)
        </h2>
        <p className="mt-1 text-sm text-fg-tertiary">
          FugaEdge uses Massive for country, shares outstanding, and intraday
          charts, and FMP for real float, sector, and industry. Both are free and
          optional. Add either now or later in Settings; the matching enrichments
          turn on once a key is set.
        </p>
      </header>

      <ProviderKey
        label="Massive API key"
        signupLabel="Get a free Massive API key"
        signupUrl={MASSIVE_SIGNUP}
        placeholder="paste your massive.com API key"
        value={massive}
        onChange={setMassive}
        disabled={saving}
      />
      <ProviderKey
        label="FMP API key"
        signupLabel="Get a free FMP API key"
        signupUrl={FMP_SIGNUP}
        placeholder="paste your financialmodelingprep.com API key"
        value={fmp}
        onChange={setFmp}
        disabled={saving}
      />

      {error && (
        <div className="rounded-md border border-loss/40 bg-loss-soft px-3 py-2 text-xs text-fg-secondary">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 self-start rounded-md bg-gold px-4 text-[11px] font-semibold uppercase tracking-wider text-accent-ink transition-colors duration-150 hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save and finish'}
        </button>
        <p className="text-xs text-fg-tertiary">
          You can add or change these anytime in Settings.
        </p>
      </div>
    </div>
  )
}

function ProviderKey({
  label,
  signupLabel,
  signupUrl,
  placeholder,
  value,
  onChange,
  disabled,
}: {
  label: string
  signupLabel: string
  signupUrl: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  return (
    <div className="rounded-[var(--card-radius)] border border-border bg-bg-3 shadow-md p-3">
      <button
        type="button"
        onClick={() => void ipc.openExternal(signupUrl)}
        className="inline-flex h-8 cursor-pointer items-center gap-1.5 self-start rounded-md border border-border-strong bg-bg-1 px-3 text-xs font-semibold text-fg-primary transition-colors duration-150 hover:bg-bg-0 hover:border-gold/60 hover:text-gold"
      >
        {signupLabel}
        <ArrowUpRight size={12} strokeWidth={2.25} />
      </button>
      <label className="mt-2 block">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          {label}
        </span>
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="mt-1 w-full rounded-md border border-border-strong bg-bg-1 px-3 py-2 font-mono text-sm text-fg-primary placeholder:text-fg-tertiary outline-none transition-colors duration-150 focus:border-gold disabled:opacity-50"
        />
      </label>
    </div>
  )
}
