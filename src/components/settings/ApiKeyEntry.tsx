import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import { isPlausibleApiKey } from '@/core/onboarding'

// Shared Massive API-key entry UI: the "Get a free key" CTA, the password
// input, the local plausibility check, and the save-to-settings flow.
// Single source of truth consumed by the onboarding modal (step 5) and —
// from Commit B — the backfill no-key modal.
//
// Commit A is a pure extraction of OnboardingModal's old private ApiKeyStep
// with zero behaviour change. The component reports success through
// `onSaved`; the caller owns what happens next (close the modal, run a
// backfill, …). Skip and verify-on-save are deliberately NOT here — the
// onboarding modal keeps its own footer Skip button, and the verify flow
// will arrive with its caller in Commit B.
interface ApiKeyEntryProps {
  /** Called when the user successfully saves a key. Parent decides what to do next. */
  onSaved: () => void
}

export default function ApiKeyEntry({ onSaved }: ApiKeyEntryProps) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openSignup = () => {
    void ipc.openExternal(
      'https://massive.com/dashboard/signup?redirect=%2Fdashboard%2Fkeys',
    )
  }

  const handleSave = async () => {
    if (saving || !isPlausibleApiKey(value)) return
    setError(null)
    setSaving(true)
    try {
      await ipc.settingsSave({ polygon_api_key: value.trim() })
      // Saved. The caller (onSaved) owns what happens next and unmounts this
      // component on success, so there is intentionally no setSaving(false)
      // here.
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  const canSave = !saving && isPlausibleApiKey(value)

  return (
    <div className="flex flex-col gap-4">
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
          You can add or change this anytime in Settings.
        </p>
      </div>
    </div>
  )
}
