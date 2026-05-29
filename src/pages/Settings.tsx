import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ArrowUpRight, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import PageShell from '@/components/layout/PageShell'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import RuleList from '@/components/settings/RuleList'
import SettingsAccordion from '@/components/settings/SettingsAccordion'
import DataBackfillCard from '@/components/settings/DataBackfillCard'
import ResetJournalModal from '@/components/settings/ResetJournalModal'
import { ipc } from '@/lib/ipc'
import { useAppVersion } from '@/lib/useAppVersion'
import { ONBOARDING_FLAG_KEY, ONBOARDING_FORCE_KEY } from '@/core/onboarding'
import { TOUR_FLAG_KEY, TOUR_FORCE_KEY } from '@/core/tour'
import { money } from '@/lib/format'
import { useThemeMode, type ThemeMode } from '@/lib/theme'
import type {
  ExportResult,
  SettingsPayload,
  SettingsValues,
} from '@shared/settings-types'
import type { MarketRefreshProgress } from '@shared/market-types'
import {
  startIntradayRefresh,
  startMarketRefresh,
  useRefreshState,
} from '@/lib/refreshStore'
import type { MassiveKeyStatus } from '@shared/massive-types'

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function isDirty(saved: SettingsValues, current: SettingsValues): boolean {
  if (saved.max_daily_loss !== current.max_daily_loss) return true
  if (saved.account_size !== current.account_size) return true
  if (saved.polygon_api_key !== current.polygon_api_key) return true
  if (!arraysEqual(saved.journal_rules, current.journal_rules)) return true
  if (!arraysEqual(saved.mistake_list, current.mistake_list)) return true
  if (!arraysEqual(saved.day_tag_list, current.day_tag_list)) return true
  return false
}

type ExportKind = 'trades' | 'journal' | 'database'

interface ExportStatus {
  kind: ExportKind
  result: ExportResult
}

export default function Settings() {
  const [payload, setPayload] = useState<SettingsPayload | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [editor, setEditor] = useState<SettingsValues | null>(null)
  const [snapshot, setSnapshot] = useState<SettingsValues | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [keyStatus, setKeyStatus] = useState<MassiveKeyStatus | null>(null)
  const [resetOpen, setResetOpen] = useState(false)

  const [exporting, setExporting] = useState<ExportKind | null>(null)
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  // Force checkbox is a local pre-press input. The rest of the refresh state
  // (running / progress / result / error) lives in the module-level
  // refreshStore so it survives a tab switch — Settings can unmount and remount
  // mid-run and still read the live running flag + latest progress (and the
  // store owns the await, so completion clears even while away).
  const [force, setForce] = useState(false)
  const { market, intraday } = useRefreshState()
  // Aliases keep the render + result/error JSX below unchanged.
  const refreshing = market.running
  const refreshResult = market.result
  const refreshError = market.error
  const refreshProgress = market.progress
  const intradayRefreshing = intraday.running
  const intradayResult = intraday.result
  const intradayError = intraday.error
  const intradayProgress = intraday.progress

  useEffect(() => {
    let cancelled = false
    ipc
      .settingsGet()
      .then((p) => {
        if (cancelled) return
        setPayload(p)
        setEditor(p.values)
        setSnapshot(p.values)
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (saving || !editor || !snapshot) return
    setSaving(true)
    setKeyStatus(null) // clear any prior validity result before this save
    try {
      const updated = await ipc.settingsSave(editor)
      setPayload(updated)
      setEditor(updated.values)
      setSnapshot(updated.values)
      setSavedAt(Date.now())

      // Save-then-verify: the key is already persisted by this point, so
      // every keyStatus outcome below describes a key that IS saved. Ping
      // Massive only when the key field actually changed in this save and
      // is non-empty — don't hit the network on unrelated settings saves.
      const keyChanged = editor.polygon_api_key !== snapshot.polygon_api_key
      const keyPresent = editor.polygon_api_key.trim().length > 0
      if (keyChanged && keyPresent) {
        const status = await ipc.testMassiveKey(editor.polygon_api_key.trim())
        setKeyStatus(status)
      }
    } finally {
      setSaving(false)
    }
  }, [editor, saving, snapshot])

  // The store owns the running flag + await + progress subscription (so state
  // survives a tab switch). It guards against double-runs internally; reset the
  // local Force checkbox only when the run actually succeeded.
  const runRefresh = useCallback(() => {
    void startMarketRefresh(force).then((ok) => {
      if (ok) setForce(false)
    })
  }, [force])

  const runIntradayRefresh = useCallback(() => {
    void startIntradayRefresh(force).then((ok) => {
      if (ok) setForce(false)
    })
  }, [force])

  const runExport = useCallback(async (kind: ExportKind) => {
    if (exporting) return
    setExporting(kind)
    setExportError(null)
    setExportStatus(null)
    try {
      const result =
        kind === 'trades'
          ? await ipc.exportTrades()
          : kind === 'journal'
            ? await ipc.exportJournal()
            : await ipc.exportDatabase()
      if (!result.canceled) {
        setExportStatus({ kind, result })
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(null)
    }
  }, [exporting])

  if (err) {
    return (
      <PageShell title="Settings" subtitle="Account size, max daily loss, playbooks, data export.">
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-loss/40 bg-loss-soft p-4 text-sm text-fg-secondary">
          <AlertCircle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-loss" />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-loss">
              Failed to load settings
            </div>
            <div className="mt-1">{err}</div>
          </div>
        </div>
      </PageShell>
    )
  }

  if (!editor || !snapshot || !payload) {
    return (
      <PageShell title="Settings" subtitle="Account size, max daily loss, playbooks, data export.">
        <div className="space-y-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[160px] border border-border" />
          ))}
        </div>
      </PageShell>
    )
  }

  const dirty = isDirty(snapshot, editor)

  return (
    <PageShell title="Settings" subtitle="Account size, max daily loss, playbooks, data export.">
      <div className="space-y-5">
        <Card
          title="Appearance"
          subtitle="Light mode keeps the gold/green/red accents identical — only surfaces and text invert."
        >
          <ThemePicker />
        </Card>

        <Card title="Risk management" subtitle="Drives the dashboard's max-loss banner and sizing references.">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <NumberField
              label="Max daily loss alert"
              suffix={money(editor.max_daily_loss).replace('$', '$ ')}
              hint="Dashboard banner fires when today's net P&L falls below the negative of this value."
              value={editor.max_daily_loss}
              onChange={(v) =>
                setEditor((prev) =>
                  prev ? { ...prev, max_daily_loss: v } : prev,
                )
              }
            />
            <NumberField
              label="Account size"
              suffix={money(editor.account_size).replace('$', '$ ')}
              hint="Used as the reference equity for percentage-based stats."
              value={editor.account_size}
              onChange={(v) =>
                setEditor((prev) =>
                  prev ? { ...prev, account_size: v } : prev,
                )
              }
            />
          </div>
        </Card>

        <SettingsAccordion
          storageKey="journalRules"
          title="Journal rules"
          subtitle="Shown on the Journal page as a checklist. Order is preserved."
          count={editor.journal_rules.length}
        >
          <RuleList
            rules={editor.journal_rules}
            onChange={(next) =>
              setEditor((prev) =>
                prev ? { ...prev, journal_rules: next } : prev,
              )
            }
          />
        </SettingsAccordion>

        <SettingsAccordion
          storageKey="mistakeList"
          title="Mistake list"
          subtitle="Tag any of these on a trade in the expand row. Used by the Mistakes card on Analytics."
          count={editor.mistake_list.length}
        >
          <RuleList
            rules={editor.mistake_list}
            onChange={(next) =>
              setEditor((prev) =>
                prev ? { ...prev, mistake_list: next } : prev,
              )
            }
          />
        </SettingsAccordion>

        <SettingsAccordion
          storageKey="dayTags"
          title="Day note tags"
          subtitle="Per-day labels shown on the Calendar (FOMC, Earnings, Choppy, etc.). Click a calendar day to toggle which ones apply."
          count={editor.day_tag_list.length}
        >
          <RuleList
            rules={editor.day_tag_list}
            onChange={(next) =>
              setEditor((prev) =>
                prev ? { ...prev, day_tag_list: next } : prev,
              )
            }
          />
        </SettingsAccordion>

        <Card
          title="Market data"
          subtitle="Massive.com REST API. Powers the Reports volume analysis and the Momentum EMA9 distance."
        >
          <div className="space-y-4">
            <button
              type="button"
              onClick={() =>
                void ipc.openExternal(
                  'https://massive.com/dashboard/signup?redirect=%2Fdashboard%2Fkeys',
                )
              }
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 self-start rounded-md border border-border-strong bg-bg-1 px-3 text-xs font-semibold text-fg-primary transition-colors duration-150 hover:bg-bg-0 hover:border-gold/60 hover:text-gold"
            >
              Get a free Massive API key
              <ArrowUpRight size={12} strokeWidth={2.25} />
            </button>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
                API key
              </div>
              <input
                type="password"
                value={editor.polygon_api_key}
                onChange={(e) =>
                  setEditor((prev) =>
                    prev ? { ...prev, polygon_api_key: e.target.value } : prev,
                  )
                }
                placeholder="paste your massive.com API key"
                className="mt-1 w-full rounded-md border border-border-strong bg-bg-1 px-3 py-2 font-mono text-sm text-fg-primary placeholder:text-fg-tertiary outline-none transition-colors duration-150 focus:border-gold"
              />
              <div className="mt-1.5 text-xs text-fg-tertiary">
                Cached locally. Never logged. Save before refreshing.
              </div>
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
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
              <button
                type="button"
                onClick={runRefresh}
                disabled={refreshing || dirty || !editor.polygon_api_key}
                className="rounded-md border border-border-strong bg-bg-1 px-4 py-2 text-sm text-fg-primary transition-colors duration-150 hover:bg-bg-0 hover:border-gold/60 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
                title={
                  !editor.polygon_api_key
                    ? 'Set an API key first.'
                    : dirty
                      ? 'Save settings first so the refresh uses the new key.'
                      : 'Fetches symbols missing or stale (>7d) market data. Check Force re-fetch to re-download every symbol.'
                }
              >
                {refreshing ? 'Refreshing…' : 'Refresh market data'}
              </button>

              <button
                type="button"
                onClick={runIntradayRefresh}
                disabled={intradayRefreshing || dirty || !editor.polygon_api_key}
                className="rounded-md border border-border-strong bg-bg-1 px-4 py-2 text-sm text-fg-primary transition-colors duration-150 hover:bg-bg-0 hover:border-gold/60 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
                title="Fetches 1-minute bars for (symbol, date) pairs missing data. Check Force re-fetch to re-download all pairs. Used for EMA9 distance + MAE/MFE."
              >
                {intradayRefreshing
                  ? 'Fetching intraday…'
                  : 'Refresh intraday (1-min)'}
              </button>

              {refreshResult && !refreshResult.apiKeyMissing && (
                <span className="text-xs">
                  <span className="font-mono text-win">
                    {refreshResult.fetched}
                  </span>{' '}
                  <span className="text-muted">fetched · </span>
                  <span className="font-mono text-red">{refreshResult.failed}</span>{' '}
                  <span className="text-muted">failed · </span>
                  <span className="font-mono text-text">
                    {(refreshResult.durationMs / 1000).toFixed(1)}s
                  </span>
                </span>
              )}
              {refreshResult && refreshResult.apiKeyMissing && (
                <span className="text-xs text-red">
                  API key missing — save the key first.
                </span>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs text-fg-secondary">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="accent-gold"
              />
              Force re-fetch (re-download everything; overwrites Massive-sourced values, keeps manual edits)
            </label>

            {/* Live progress while a refresh runs. Gated by the running flag
                from refreshStore (cleared in the store's finally) so the bar can
                never stick — incl. the all-403 case that ends with fetched=0 —
                and it rehydrates at the current progress after a tab switch. */}
            {refreshing && <RefreshProgressBar progress={refreshProgress} />}
            {intradayRefreshing && <RefreshProgressBar progress={intradayProgress} />}

            {refreshResult && refreshResult.errors.length > 0 && (
              <div className="rounded-md border border-red/40 bg-red/[0.06] p-3 text-xs">
                <div className="mb-1 uppercase tracking-wider text-red">
                  Refresh errors
                </div>
                <ul className="space-y-0.5">
                  {refreshResult.errors.slice(0, 10).map((e) => (
                    <li key={e.symbol} className="text-subtle">
                      <span className="font-mono text-text">{e.symbol}</span>{' '}
                      <span className="text-muted">— {e.message}</span>
                    </li>
                  ))}
                  {refreshResult.errors.length > 10 && (
                    <li className="text-muted">
                      …and {refreshResult.errors.length - 10} more.
                    </li>
                  )}
                </ul>
              </div>
            )}

            {refreshError && (
              <div className="rounded-md border border-red/40 bg-red/[0.08] p-3 text-xs text-red">
                Refresh failed: {refreshError}
              </div>
            )}

            {intradayResult && !intradayResult.apiKeyMissing && (
              <div className="rounded-md border border-border/40 bg-bg/30 p-3 text-xs">
                <div className="uppercase tracking-wider text-gold">
                  Intraday refresh
                </div>
                <div className="mt-1 text-subtle">
                  <span className="font-mono text-win">{intradayResult.fetched}</span>{' '}
                  <span className="text-muted">pairs fetched · </span>
                  <span className="font-mono text-red">{intradayResult.failed}</span>{' '}
                  <span className="text-muted">failed · </span>
                  <span className="font-mono text-gold">
                    {intradayResult.emaBackfilled}
                  </span>{' '}
                  <span className="text-muted">EMA9 · </span>
                  <span className="font-mono text-gold">
                    {intradayResult.maeMfeBackfilled}
                  </span>{' '}
                  <span className="text-muted">MAE/MFE · </span>
                  <span className="font-mono text-text">
                    {(intradayResult.durationMs / 1000).toFixed(1)}s
                  </span>
                </div>
              </div>
            )}

            {intradayError && (
              <div className="rounded-md border border-red/40 bg-red/[0.08] p-3 text-xs text-red">
                Intraday refresh failed: {intradayError}
              </div>
            )}
          </div>
        </Card>

        <DataBackfillCard
          lastRun={editor.last_country_backfill}
          onLastRunChange={(iso) =>
            setEditor((prev) =>
              prev ? { ...prev, last_country_backfill: iso } : prev,
            )
          }
          onApiKeySaved={() => {
            // The backfill modal saved a key straight to the DB, bypassing
            // this page's editor state. Re-read and patch ONLY
            // polygon_api_key into both editor and snapshot — editor so the
            // Market data input reflects it, snapshot so isDirty stays false
            // (no spurious "Save settings" prompt).
            void ipc.settingsGet().then((p) => {
              // Guard `prev` so the spread keeps every field required —
              // spreading `SettingsValues | null` would mark them optional.
              // (prev is non-null in practice: this card only renders once
              // Settings is past its loading gate.)
              setEditor((prev) =>
                prev
                  ? { ...prev, polygon_api_key: p.values.polygon_api_key }
                  : prev,
              )
              setSnapshot((prev) =>
                prev
                  ? { ...prev, polygon_api_key: p.values.polygon_api_key }
                  : prev,
              )
            })
          }}
        />

        <Card title="Data" subtitle="Export and back up your local database.">
          <div className="space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">
                Database location
              </div>
              <div
                className="mt-1 break-all font-mono text-xs text-fg-secondary"
                title={payload.db_path}
              >
                {payload.db_path}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <ExportButton
                label="Export trades CSV"
                busyLabel="Exporting trades…"
                busy={exporting === 'trades'}
                disabled={exporting !== null}
                onClick={() => runExport('trades')}
              />
              <ExportButton
                label="Export journal JSON"
                busyLabel="Exporting journal…"
                busy={exporting === 'journal'}
                disabled={exporting !== null}
                onClick={() => runExport('journal')}
              />
              <ExportButton
                label="Back up database"
                busyLabel="Writing backup…"
                busy={exporting === 'database'}
                disabled={exporting !== null}
                onClick={() => runExport('database')}
              />
            </div>

            {exportStatus && (
              <div className="rounded-md border border-win/40 bg-win/[0.06] p-3 text-xs">
                <span className="uppercase tracking-wider text-win">
                  {labelFor(exportStatus.kind)} saved
                </span>{' '}
                <span className="text-subtle">
                  {exportStatus.result.rowCount != null && (
                    <>· {exportStatus.result.rowCount} rows </>
                  )}
                  ·{' '}
                </span>
                <span className="font-mono text-text">{exportStatus.result.path}</span>
              </div>
            )}

            {exportError && (
              <div className="rounded-md border border-red/40 bg-red/[0.08] p-3 text-xs text-red">
                Export failed: {exportError}
              </div>
            )}

            <div className="border-t border-border-subtle pt-4">
              <button
                type="button"
                onClick={() => setResetOpen(true)}
                className="rounded-md border border-loss/50 bg-bg-1 px-4 py-2 text-sm text-loss transition-colors duration-150 hover:border-loss hover:bg-loss/[0.06]"
              >
                Reset journal
              </button>
              <p className="mt-1.5 text-xs text-fg-tertiary">
                Saves the current journal aside as a dated file and starts
                fresh. FugaEdge restarts. Recovery is manual.
              </p>
            </div>
          </div>
          <ResetJournalModal open={resetOpen} onClose={() => setResetOpen(false)} />
        </Card>

        <Card
          title="Walkthrough"
          subtitle="Replay the first-time setup or the in-app product tour. Useful if you want to revisit either or test the flow."
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                window.localStorage.removeItem(ONBOARDING_FLAG_KEY)
                window.localStorage.setItem(ONBOARDING_FORCE_KEY, 'true')
                // Land on /dashboard so the modal can sit over the
                // expected first-launch route, not Settings.
                window.location.hash = '#/dashboard'
                window.location.reload()
              }}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border-strong bg-bg-1 px-3 text-sm text-fg-primary transition-colors duration-150 hover:bg-bg-0 hover:border-gold/60 hover:text-gold"
            >
              <RotateCcw size={14} strokeWidth={2} />
              Restart onboarding
            </button>
            <button
              type="button"
              onClick={() => {
                window.localStorage.removeItem(TOUR_FLAG_KEY)
                window.localStorage.setItem(TOUR_FORCE_KEY, 'true')
                // Tour steps 2-4 anchor on Dashboard-only widgets — force
                // the route so the tour doesn't auto-skip half its
                // steps when launched from Settings.
                window.location.hash = '#/dashboard'
                window.location.reload()
              }}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border-strong bg-bg-1 px-3 text-sm text-fg-primary transition-colors duration-150 hover:bg-bg-0 hover:border-gold/60 hover:text-gold"
            >
              <RotateCcw size={14} strokeWidth={2} />
              Restart tour
            </button>
          </div>
          <p className="mt-2 text-xs text-fg-tertiary">
            Clears the local <span className="font-mono">{ONBOARDING_FLAG_KEY}</span> /{' '}
            <span className="font-mono">{TOUR_FLAG_KEY}</span> flag and reloads the app.
            Your account size, max-loss alert, and any seeded playbooks stay — only the
            overlay triggers reset.
          </p>
        </Card>

        <Card title="About" subtitle="FugaEdge build information.">
          <AboutPanel />
        </Card>

        <div className="sticky bottom-0 -mx-6 mt-2 flex items-center justify-end gap-3 border-t border-white/[0.06] bg-bg/85 px-6 py-3 backdrop-blur">
          {savedAt && !dirty && (
            <span className="text-[10px] uppercase tracking-wider text-win">
              saved
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="inline-flex h-9 cursor-pointer items-center rounded-md bg-gold px-4 text-sm font-semibold text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-gold-hover active:bg-gold-dim disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : dirty ? 'Save settings' : 'No changes'}
          </button>
        </div>
      </div>
    </PageShell>
  )
}

function AboutPanel() {
  const version = useAppVersion()
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        Version
      </div>
      <div className="font-mono text-sm text-fg-primary">v{version}</div>
    </div>
  )
}

function NumberField({
  label,
  hint,
  suffix,
  value,
  onChange,
}: {
  label: string
  hint?: string
  suffix?: string
  value: number
  onChange: (next: number) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">{label}</div>
        {suffix && (
          <div className="font-mono text-[11px] text-fg-secondary">{suffix}</div>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="font-mono text-sm text-fg-tertiary">$</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={1}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const v = Number.parseFloat(e.target.value)
            onChange(Number.isFinite(v) && v >= 0 ? v : 0)
          }}
          className="w-full rounded-md border border-border-strong bg-bg-1 px-3 py-2 font-mono text-sm text-fg-primary outline-none transition-colors duration-150 focus:border-gold"
        />
      </div>
      {hint && <div className="mt-1.5 text-xs text-fg-tertiary">{hint}</div>}
    </div>
  )
}

function ExportButton({
  label,
  busyLabel,
  busy,
  disabled,
  onClick,
}: {
  label: string
  busyLabel: string
  busy: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-border-strong bg-bg-1 px-4 py-2 text-sm text-fg-primary transition-colors duration-150 hover:bg-bg-0 hover:border-gold/60 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
    >
      {busy ? busyLabel : label}
    </button>
  )
}

// Loading bar for an in-flight refresh. Mirrors DataBackfillCard's progress
// markup. Before the first progress event arrives, shows an indeterminate
// "Starting…" line (no width) so the user gets immediate feedback.
function RefreshProgressBar({ progress }: { progress: MarketRefreshProgress | null }) {
  const pct =
    progress && progress.total > 0
      ? Math.floor((progress.current / progress.total) * 100)
      : 0
  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-sm bg-bg-1">
        <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-[10px] text-fg-tertiary tnum">
        {progress
          ? `Fetching ${progress.symbol} (${progress.current}/${progress.total})`
          : 'Starting…'}
      </div>
    </div>
  )
}

function labelFor(kind: ExportKind): string {
  if (kind === 'trades') return 'Trades CSV'
  if (kind === 'journal') return 'Journal JSON'
  return 'Database backup'
}

// ── Theme picker ───────────────────────────────────────────────────────
// Tri-state radio: Dark / Light / System. 'System' tracks the OS-level
// prefers-color-scheme query live — see src/lib/theme.ts.

function ThemePicker() {
  const { mode, resolved, setMode } = useThemeMode()
  const options: { key: ThemeMode; label: string; Icon: typeof Sun; hint: string }[] = [
    { key: 'dark',   label: 'Dark',   Icon: Moon,    hint: 'Deep black + gold accents (default).' },
    { key: 'light',  label: 'Light',  Icon: Sun,     hint: 'Light surfaces; same gold/green/red accents.' },
    { key: 'system', label: 'System', Icon: Monitor, hint: 'Follow your OS preference automatically.' },
  ]
  return (
    <div>
      <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {options.map(({ key, label, Icon, hint }) => {
          const active = mode === key
          return (
            <button
              key={key}
              role="radio"
              aria-checked={active}
              type="button"
              onClick={() => setMode(key)}
              className={`flex cursor-pointer flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors duration-150 ease-out-soft ${
                active
                  ? 'border-gold bg-gold/[0.06]'
                  : 'border-border-subtle bg-bg-2 hover:border-border'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-fg-primary">
                  <Icon size={14} strokeWidth={2} className={active ? 'text-gold' : 'text-fg-tertiary'} />
                  {label}
                </span>
                {active && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gold">
                    Active
                  </span>
                )}
              </div>
              <div className="text-xs text-fg-tertiary">{hint}</div>
            </button>
          )
        })}
      </div>
      <div className="mt-3 text-[10px] text-fg-tertiary">
        Current rendered theme:{' '}
        <span className="font-semibold text-fg-secondary">{resolved}</span>
      </div>
    </div>
  )
}
