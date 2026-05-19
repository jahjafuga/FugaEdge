import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Lightbulb,
  Target,
  Upload,
} from 'lucide-react'
import BrandMark from '@/components/layout/BrandMark'
import DropZone from '@/components/import/DropZone'
import { ipc } from '@/lib/ipc'
import {
  DEFAULT_ACCOUNT_SIZE,
  DEFAULT_MAX_DAILY_LOSS,
  ONBOARDING_FLAG_KEY,
  ONBOARDING_FORCE_KEY,
  ONBOARDING_STEPS,
  cleanAmount,
  emptyOnboardingState,
  isPlausibleApiKey,
  templatesForStyle,
  type OnboardingState,
  type TradingStyle,
} from '@/core/onboarding'
import type { PreviewInputFile } from '@shared/import-types'

// ONBOARDING MODAL
//
// Renders a centered card over a dimmed/blurred backdrop. Four steps —
// Welcome / Account / Style / Import. Cannot be dismissed by clicking
// outside; the only exits are "Skip for now" or completing step 4.
//
// On completion (Skip OR Get Started) the parent flips its visibility
// state, we persist settings + playbook templates + the flag, and the
// caller re-renders without the overlay.

interface OnboardingModalProps {
  /** Called after all persistence completes successfully. The parent
   *  hides the overlay + (optionally) reloads dashboard data. */
  onComplete: () => void
}

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [state, setState] = useState<OnboardingState>(emptyOnboardingState)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalSteps = ONBOARDING_STEPS.length
  const isLast = state.step === totalSteps - 1

  const next = () => setState((s) => ({ ...s, step: Math.min(s.step + 1, totalSteps - 1) }))
  const back = () => setState((s) => ({ ...s, step: Math.max(s.step - 1, 0) }))

  // Persistence — runs on Skip and on Get Started. Settings always save;
  // playbook templates only seed when a non-mixed style was picked.
  // Imported trades, if any, are committed by the import step itself
  // before completion fires.
  const commitAndClose = async () => {
    if (committing) return
    setCommitting(true)
    setError(null)
    try {
      const accountSize = state.accountSize > 0 ? state.accountSize : DEFAULT_ACCOUNT_SIZE
      const maxDailyLoss =
        state.maxDailyLoss > 0 ? state.maxDailyLoss : DEFAULT_MAX_DAILY_LOSS

      await ipc.settingsSave({
        account_size: accountSize,
        max_daily_loss: maxDailyLoss,
      })

      if (state.style && state.style !== 'mixed') {
        const templates = templatesForStyle(state.style)
        // Seed sequentially so a UNIQUE-name collision on one doesn't
        // poison the rest of the batch. Errors are logged and swallowed —
        // the user has already advanced past this step, so a name clash
        // (e.g. with the auto-seeded defaults) shouldn't block completion.
        for (const t of templates) {
          try {
            await ipc.playbookCreate({ name: t.name, description: t.description })
          } catch (e) {
            // eslint-disable-next-line no-console
            console.info(
              `[onboarding] skipped playbook "${t.name}":`,
              e instanceof Error ? e.message : e,
            )
          }
        }
      }

      window.localStorage.setItem(ONBOARDING_FLAG_KEY, 'true')
      window.localStorage.removeItem(ONBOARDING_FORCE_KEY)
      onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCommitting(false)
    }
  }

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
    >
      <div
        className="w-full max-w-[600px] rounded-xl border border-border-subtle bg-bg-2 p-6 shadow-lg"
      >
        {/* Header */}
        <header className="flex flex-col items-center text-center">
          <BrandMark variant="mark" className="mb-3 h-12 w-12" />
          <StepDots step={state.step} total={totalSteps} />
        </header>

        {/* Step body — fade transition keyed on step */}
        <div
          key={state.step}
          className="animate-fade-in mt-5 min-h-[300px]"
        >
          {state.step === 0 && <WelcomeStep />}
          {state.step === 1 && (
            <AccountStep
              accountSize={state.accountSize}
              maxDailyLoss={state.maxDailyLoss}
              onChange={(next) => setState((s) => ({ ...s, ...next }))}
            />
          )}
          {state.step === 2 && (
            <StyleStep
              value={state.style}
              onSelect={(style) => setState((s) => ({ ...s, style }))}
            />
          )}
          {state.step === 3 && (
            <ImportStep
              onError={setError}
            />
          )}
          {state.step === 4 && (
            <ApiKeyStep
              onError={setError}
              onComplete={commitAndClose}
            />
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-loss/40 bg-loss-soft px-3 py-2 text-xs text-fg-secondary">
            {error}
          </div>
        )}

        {/* Footer nav */}
        <footer className="mt-6 flex items-center justify-between gap-2 border-t border-border-subtle pt-4">
          <button
            type="button"
            onClick={commitAndClose}
            disabled={committing}
            className="cursor-pointer text-[10px] uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:text-fg-primary disabled:opacity-50"
          >
            Skip for now
          </button>
          <div className="flex items-center gap-2">
            {state.step > 0 && (
              <button
                type="button"
                onClick={back}
                disabled={committing}
                className="inline-flex h-9 cursor-pointer items-center rounded-md border border-border-strong bg-bg-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-fg-secondary transition-colors duration-150 hover:border-gold/40 hover:text-gold disabled:opacity-50"
              >
                Back
              </button>
            )}
            {state.step !== 4 && (isLast ? (
              <button
                type="button"
                onClick={commitAndClose}
                disabled={committing}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-gold px-4 text-[11px] font-semibold uppercase tracking-wider text-accent-ink transition-colors duration-150 hover:bg-gold-hover disabled:opacity-50"
              >
                {committing ? 'Setting up…' : 'Get started'}
                {!committing && <ArrowRight size={13} strokeWidth={2.25} />}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                disabled={committing}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-gold px-4 text-[11px] font-semibold uppercase tracking-wider text-accent-ink transition-colors duration-150 hover:bg-gold-hover disabled:opacity-50"
              >
                {state.step === 0 ? "Let's go" : 'Continue'}
                <ArrowRight size={13} strokeWidth={2.25} />
              </button>
            ))}
          </div>
        </footer>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}

// ── Step indicator ──────────────────────────────────────────────────────

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div role="presentation" className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => {
        const active = i === step
        const past = i < step
        return (
          <span
            key={i}
            aria-hidden="true"
            className={`block h-2 w-2 rounded-full transition-colors duration-150 ${
              active
                ? 'bg-gold'
                : past
                  ? 'bg-gold/40'
                  : 'bg-border-strong'
            }`}
          />
        )
      })}
    </div>
  )
}

// ── Step 1 — Welcome ────────────────────────────────────────────────────

function WelcomeStep() {
  return (
    <div className="flex flex-col gap-4 text-center">
      <h2
        id="onboarding-title"
        className="text-2xl font-semibold tracking-tight text-fg-primary"
      >
        Welcome to FugaEdge
      </h2>
      <p className="mx-auto max-w-md text-sm text-fg-secondary">
        The trading journal built for momentum day-traders. Let's get you set
        up in 60 seconds.
      </p>
      <ul className="mx-auto mt-2 flex w-full max-w-md flex-col gap-3 text-left">
        <BulletRow Icon={BarChart3} text="Import your DAS Trader CSVs" />
        <BulletRow Icon={Target} text="Track playbooks, mistakes, and catalysts" />
        <BulletRow Icon={Lightbulb} text="Surface real edge insights from your data" />
      </ul>
    </div>
  )
}

function BulletRow({
  Icon,
  text,
}: {
  Icon: typeof BarChart3
  text: string
}) {
  return (
    <li className="flex items-center gap-3 rounded-md border border-border-subtle bg-bg-3 px-3 py-2 text-sm text-fg-secondary">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gold/40 bg-gold/[0.08] text-gold">
        <Icon size={14} strokeWidth={2} />
      </span>
      <span>{text}</span>
    </li>
  )
}

// ── Step 2 — Account basics ─────────────────────────────────────────────

function AccountStep({
  accountSize,
  maxDailyLoss,
  onChange,
}: {
  accountSize: number
  maxDailyLoss: number
  onChange: (next: Partial<OnboardingState>) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2
          id="onboarding-title"
          className="text-xl font-semibold tracking-tight text-fg-primary"
        >
          Your trading setup
        </h2>
        <p className="mt-1 text-sm text-fg-tertiary">
          Both fields are optional — defaults work fine and you can change
          them anytime in Settings.
        </p>
      </header>

      <MoneyField
        label="Account size"
        value={accountSize}
        onChange={(v) => onChange({ accountSize: cleanAmount(v) })}
        hint="Used for percentage-based stats and sizing references."
      />
      <MoneyField
        label="Max daily loss alert"
        value={maxDailyLoss}
        onChange={(v) => onChange({ maxDailyLoss: cleanAmount(v) })}
        hint="Dashboard fires a warning when today's net P&L drops below this."
      />
    </div>
  )
}

function MoneyField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: number
  onChange: (next: number) => void
  hint: string
}) {
  return (
    <label className="block">
 <span className="block text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        {label}
      </span>
      <span className="mt-1 flex items-center gap-2">
        <span className="font-mono text-sm text-fg-tertiary">$</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={1}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number.parseFloat(e.target.value || '0'))}
          className="w-full rounded-md border border-border-strong bg-bg-1 px-3 py-2 font-mono text-sm text-fg-primary outline-none transition-colors duration-150 focus:border-gold"
        />
      </span>
      <span className="mt-1 block text-xs text-fg-tertiary">{hint}</span>
    </label>
  )
}

// ── Step 3 — Trading style ──────────────────────────────────────────────

function StyleStep({
  value,
  onSelect,
}: {
  value: TradingStyle | null
  onSelect: (style: TradingStyle) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2
          id="onboarding-title"
          className="text-xl font-semibold tracking-tight text-fg-primary"
        >
          What's your trading style?
        </h2>
        <p className="mt-1 text-sm text-fg-tertiary">
          Helps us pre-populate your playbooks. You can edit anytime.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <StyleCard
          active={value === 'small-cap'}
          onClick={() => onSelect('small-cap')}
          title="Small-cap momentum (Ross Cameron style)"
          playbooks={['Bull Flag 1min', 'Micro Pullback', 'ABCD', 'Halt Resume', 'VWAP Break']}
        />
        <StyleCard
          active={value === 'large-cap'}
          onClick={() => onSelect('large-cap')}
          title="Large-cap momentum"
          playbooks={['Opening Range Breakout', 'VWAP Bounce', 'Trend Continuation']}
        />
        <StyleCard
          active={value === 'mixed'}
          onClick={() => onSelect('mixed')}
          title="Mixed / I'll set up my own"
          playbooks={[]}
          mixedNote
        />
      </div>
    </div>
  )
}

function StyleCard({
  active,
  onClick,
  title,
  playbooks,
  mixedNote,
}: {
  active: boolean
  onClick: () => void
  title: string
  playbooks: string[]
  mixedNote?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-start gap-2 rounded-md border px-3 py-2.5 text-left transition-colors duration-150 ${
        active
          ? 'border-gold/60 bg-gold/[0.08]'
          : 'border-border-subtle bg-bg-3 hover:border-gold/40'
      }`}
    >
      <span className="text-sm font-medium text-fg-primary">{title}</span>
      {playbooks.length > 0 ? (
        <span className="text-[10px] uppercase tracking-wider text-fg-tertiary">
          {playbooks.join(' · ')}
        </span>
      ) : mixedNote ? (
        <span className="text-[10px] uppercase tracking-wider text-fg-tertiary">
          No templates — start blank
        </span>
      ) : null}
    </button>
  )
}

// ── Step 4 — Import ─────────────────────────────────────────────────────

function ImportStep({ onError }: { onError: (msg: string | null) => void }) {
  const [importing, setImporting] = useState(false)
  const [importedCount, setImportedCount] = useState<number | null>(null)

  const handleFiles = async (
    files: { name: string; text?: string; bytes?: Uint8Array }[],
  ) => {
    onError(null)
    setImporting(true)
    try {
      // Preview → commit is the same shape used by the Import page. We skip
      // the preview UI here and commit straight away so the onboarding stays
      // a single forward motion.
      const inputs: PreviewInputFile[] = files.map((f) => ({
        filename: f.name,
        text: f.text,
        bytes: f.bytes,
      }))
      const preview = await ipc.importPreview(inputs)
      const result = await ipc.importCommit({
        trips: preview.trips,
        fees: preview.fees,
      })
      setImportedCount(
        result.insertedTrips + result.insertedFees + result.replacedFees,
      )
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <header>
        <h2
          id="onboarding-title"
          className="text-xl font-semibold tracking-tight text-fg-primary"
        >
          Bring in your trade history
        </h2>
        <p className="mt-1 text-sm text-fg-tertiary">
          Drop your DAS <span className="font-mono">Trades.csv</span> and / or
          daily summary CSV. You can skip this and import later from the
          Import page.
        </p>
      </header>

      <DropZone onFiles={handleFiles} disabled={importing} />

      <p className="text-center text-[10px] uppercase tracking-wider text-fg-tertiary">
        Imports always append. Nothing is overwritten.
      </p>

      {importing && (
        <div className="rounded-md border border-gold/40 bg-gold/[0.08] px-3 py-2 text-xs text-fg-secondary">
          Importing… you can wait or click "Get started" — the import will
          continue in the background.
        </div>
      )}
      {importedCount != null && !importing && (
        <div className="rounded-md border border-win/40 bg-win/[0.08] px-3 py-2 text-xs text-win">
          <Upload size={12} strokeWidth={2} className="-mt-0.5 mr-1 inline" />
          Imported {importedCount} {importedCount === 1 ? 'row' : 'rows'}. Click "Get
          started" to open the dashboard.
        </div>
      )}
    </div>
  )
}

// ── Step 5 — Massive API key (optional) ────────────────────────────────

function ApiKeyStep({
  onError,
  onComplete,
}: {
  onError: (msg: string | null) => void
  onComplete: () => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  const openSignup = () => {
    void ipc.openExternal(
      'https://massive.com/dashboard/signup?redirect=%2Fdashboard%2Fkeys',
    )
  }

  const handleSave = async () => {
    if (saving || !isPlausibleApiKey(value)) return
    onError(null)
    setSaving(true)
    try {
      await ipc.settingsSave({ polygon_api_key: value.trim() })
      await onComplete()
      // Modal unmounts on success — no setSaving(false) here.
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
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
