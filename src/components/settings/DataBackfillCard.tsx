import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import BackfillKeyModal from '@/components/settings/BackfillKeyModal'
import { ipc } from '@/lib/ipc'
import { longDate } from '@/lib/format'
import type {
  FloatBackfillProgress,
  ProfileBackfillProgress,
  WarmupBackfillProgress,
} from '@shared/market-types'

interface DataBackfillCardProps {
  lastRun: string | null
  onLastRunChange: (iso: string) => void
  /** Fired after the no-key modal persists a key — lets Settings re-sync its
   *  Market data input. Optional so non-Settings callers can omit it. */
  onApiKeySaved?: () => void
}

export default function DataBackfillCard({
  lastRun,
  onLastRunChange,
  onApiKeySaved,
}: DataBackfillCardProps) {
  const [running, setRunning] = useState(false)
  const [force, setForce] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number; symbol: string } | null>(null)
  const [result, setResult] = useState<{ updated: number; skipped: number; failed: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // ── Float backfill — fully independent of the country action above.
  // Different API (FMP vs Massive/Polygon), different rate limits; separate
  // trigger, progress, and result so a hang in one never blocks the other.
  const [floatRunning, setFloatRunning] = useState(false)
  const [floatProgress, setFloatProgress] = useState<FloatBackfillProgress | null>(null)
  const [floatResult, setFloatResult] = useState<{
    filled: number
    unavailable: number
    unavailableSymbols: string[]
  } | null>(null)
  const [floatErr, setFloatErr] = useState<string | null>(null)

  // ── Sector & industry backfill — independent FMP /stable/profile action.
  // Separate trigger/progress/result so a hang here never blocks Country/Float.
  const [profileRunning, setProfileRunning] = useState(false)
  const [profileForce, setProfileForce] = useState(false)
  const [profileProgress, setProfileProgress] = useState<ProfileBackfillProgress | null>(null)
  const [profileResult, setProfileResult] = useState<{
    filled: number
    unavailable: number
    unavailableSymbols: string[]
  } | null>(null)
  const [profileErr, setProfileErr] = useState<string | null>(null)

  // ── Indicators (warmup) — passive: warmup is auto-armed at launch + chained on
  // refresh, so there's no button here, only a live "Computing N trades…" status.
  const [warmupProgress, setWarmupProgress] = useState<WarmupBackfillProgress | null>(null)

  useEffect(() => {
    const off = ipc.countryOnBackfillProgress((p) => setProgress(p))
    return off
  }, [])

  useEffect(() => {
    const off = ipc.floatOnBackfillProgress((p) => setFloatProgress(p))
    return off
  }, [])

  useEffect(() => {
    const off = ipc.profileOnBackfillProgress((p) => setProfileProgress(p))
    return off
  }, [])

  useEffect(() => {
    const off = ipc.warmupOnBackfillProgress((p) => setWarmupProgress(p))
    return off
  }, [])

  const run = async () => {
    if (running) return
    setRunning(true)
    setResult(null)
    setErr(null)
    setProgress(null)
    try {
      const r = await ipc.countryBackfill(force)
      if (r.apiKeyMissing) {
        setModalOpen(true)
      } else {
        setResult({ updated: r.updated, skipped: r.skipped, failed: r.failed })
        const iso = new Date().toISOString()
        await ipc.settingsSave({ last_country_backfill: iso })
        onLastRunChange(iso)
        setForce(false)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const runFloat = async () => {
    if (floatRunning) return
    setFloatRunning(true)
    setFloatResult(null)
    setFloatErr(null)
    setFloatProgress(null)
    try {
      const r = await ipc.floatBackfill()
      if (r.apiKeyMissing) {
        setFloatErr(
          'No FMP key set — add your Financial Modeling Prep key under Market data above, then retry.',
        )
      } else {
        setFloatResult({
          filled: r.filled,
          unavailable: r.unavailable,
          unavailableSymbols: r.unavailableSymbols,
        })
      }
    } catch (e) {
      setFloatErr(e instanceof Error ? e.message : String(e))
    } finally {
      setFloatRunning(false)
      setFloatProgress(null)
    }
  }

  const runProfile = async () => {
    if (profileRunning) return
    setProfileRunning(true)
    setProfileResult(null)
    setProfileErr(null)
    setProfileProgress(null)
    try {
      const r = await ipc.profileBackfill(profileForce)
      if (r.apiKeyMissing) {
        setProfileErr(
          'No FMP key set — add your Financial Modeling Prep key under Market data above, then retry.',
        )
      } else {
        setProfileResult({
          filled: r.filled,
          unavailable: r.unavailable,
          unavailableSymbols: r.unavailableSymbols,
        })
        setProfileForce(false)
      }
    } catch (e) {
      setProfileErr(e instanceof Error ? e.message : String(e))
    } finally {
      setProfileRunning(false)
      setProfileProgress(null)
    }
  }

  const pct = progress && progress.total > 0 ? Math.floor((progress.current / progress.total) * 100) : 0
  const floatPct =
    floatProgress && floatProgress.total > 0
      ? Math.floor((floatProgress.current / floatProgress.total) * 100)
      : 0
  const profilePct =
    profileProgress && profileProgress.total > 0
      ? Math.floor((profileProgress.current / profileProgress.total) * 100)
      : 0

  return (
    <Card
      title="Data backfill"
      subtitle="Backfill market data for trades you imported before these features existed. Each action runs independently."
    >
      <div className="space-y-3">
        <div className="text-xs font-medium text-fg-secondary">Country (Massive)</div>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={run}
            disabled={running}
            className="rounded-md border border-border-strong bg-bg-1 px-4 py-2 text-sm text-fg-primary transition-colors duration-150 hover:bg-bg-0 hover:border-gold/60 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? 'Backfilling…' : 'Backfill countries'}
          </button>
          <span className="text-xs text-fg-tertiary">
            Last run: {lastRun ? longDate(lastRun.slice(0, 10)) : 'never'}
          </span>
        </div>
        <label className="flex items-center gap-2 text-xs text-fg-secondary">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="accent-gold"
          />
          Force re-fetch (overwrites Massive-sourced values, keeps manual edits)
        </label>
        {progress && (
          <div>
            <div className="h-2 w-full overflow-hidden rounded-sm bg-bg-1">
              <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 text-[10px] text-fg-tertiary tnum">
              Processing {progress.symbol} ({progress.current}/{progress.total})
            </div>
          </div>
        )}
        {result && (
          <div className="font-mono text-xs">
            <span className="text-win">{result.updated}</span> updated &middot;{' '}
            <span className="text-fg-tertiary">{result.skipped}</span> skipped &middot;{' '}
            <span className="text-loss">{result.failed}</span> failed
          </div>
        )}
        {err && (
          <div className="text-xs text-loss">{err}</div>
        )}

        {/* ── Float backfill — independent FMP action ───────────────────── */}
        <div className="border-t border-border-strong pt-3">
          <div className="mb-2 text-xs font-medium text-fg-secondary">Float (FMP)</div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={runFloat}
              disabled={floatRunning}
              className="rounded-md border border-border-strong bg-bg-1 px-4 py-2 text-sm text-fg-primary transition-colors duration-150 hover:bg-bg-0 hover:border-gold/60 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {floatRunning ? 'Backfilling…' : 'Backfill float'}
            </button>
            <p className="text-xs text-fg-tertiary">
              Fetches real tradable float from FMP for trades with no float yet.
              Never overwrites a float you already have.
            </p>
            {floatProgress && (
              <div>
                <div className="h-2 w-full overflow-hidden rounded-sm bg-bg-1">
                  <div className="h-full bg-gold transition-all" style={{ width: `${floatPct}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-fg-tertiary tnum">
                  Fetching {floatProgress.current} of {floatProgress.total}… ({floatProgress.symbol})
                </div>
              </div>
            )}
            {floatResult && (
              <div className="space-y-1 text-xs">
                <div className="font-mono">
                  Filled float on <span className="text-win">{floatResult.filled}</span>{' '}
                  symbol{floatResult.filled === 1 ? '' : 's'},{' '}
                  <span className="text-fg-tertiary">{floatResult.unavailable}</span> unavailable
                </div>
                {floatResult.unavailableSymbols.length > 0 && (
                  <div className="text-fg-tertiary">
                    No FMP float (fill manually):{' '}
                    <span className="font-mono text-fg-secondary">
                      {floatResult.unavailableSymbols.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            )}
            {floatErr && <div className="text-xs text-loss">{floatErr}</div>}
          </div>
        </div>

        {/* ── Sector & industry backfill — independent FMP profile action ── */}
        <div className="border-t border-border-strong pt-3">
          <div className="mb-2 text-xs font-medium text-fg-secondary">Sector &amp; industry (FMP)</div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={runProfile}
              disabled={profileRunning}
              className="rounded-md border border-border-strong bg-bg-1 px-4 py-2 text-sm text-fg-primary transition-colors duration-150 hover:bg-bg-0 hover:border-gold/60 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {profileRunning ? 'Backfilling…' : 'Backfill sector & industry'}
            </button>
            <p className="text-xs text-fg-tertiary">
              Fetches sector &amp; industry from FMP for symbols with no
              industry yet. Leaves symbols FMP has no data for untouched.
            </p>
            <label className="flex items-center gap-2 text-xs text-fg-secondary">
              <input
                type="checkbox"
                checked={profileForce}
                onChange={(e) => setProfileForce(e.target.checked)}
                className="accent-gold"
              />
              Force re-fetch (overwrites FMP sector/industry on a hit; misses keep existing values)
            </label>
            {profileProgress && (
              <div>
                <div className="h-2 w-full overflow-hidden rounded-sm bg-bg-1">
                  <div className="h-full bg-gold transition-all" style={{ width: `${profilePct}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-fg-tertiary tnum">
                  Fetching {profileProgress.current} of {profileProgress.total}… ({profileProgress.symbol})
                </div>
              </div>
            )}
            {profileResult && (
              <div className="space-y-1 text-xs">
                <div className="font-mono">
                  Filled sector &amp; industry on <span className="text-win">{profileResult.filled}</span>{' '}
                  symbol{profileResult.filled === 1 ? '' : 's'},{' '}
                  <span className="text-fg-tertiary">{profileResult.unavailable}</span> unavailable
                </div>
                {profileResult.unavailableSymbols.length > 0 && (
                  <div className="text-fg-tertiary">
                    No FMP profile data:{' '}
                    <span className="font-mono text-fg-secondary">
                      {profileResult.unavailableSymbols.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            )}
            {profileErr && <div className="text-xs text-loss">{profileErr}</div>}
          </div>
        </div>

        {/* ── Indicators — passive status for the §K bulk warmup pass. No button:
            warmup is auto-armed at launch + chained on refresh. Shows only while
            running; "N trades" = tradesTotal − tradesDone, decrementing to 0. ── */}
        {warmupProgress &&
          warmupProgress.tradesTotal > 0 &&
          warmupProgress.tradesDone < warmupProgress.tradesTotal && (
            <div className="border-t border-border-strong pt-3">
              <div className="mb-2 text-xs font-medium text-fg-secondary">Indicators</div>
              <div className="h-2 w-full overflow-hidden rounded-sm bg-bg-1">
                <div
                  className="h-full bg-gold transition-all"
                  style={{
                    width: `${Math.floor((warmupProgress.tradesDone / warmupProgress.tradesTotal) * 100)}%`,
                  }}
                />
              </div>
              <div className="mt-1 text-[10px] text-fg-tertiary tnum">
                Computing {warmupProgress.tradesTotal - warmupProgress.tradesDone} trade
                {warmupProgress.tradesTotal - warmupProgress.tradesDone === 1 ? '' : 's'}…
              </div>
            </div>
          )}
      </div>
      <BackfillKeyModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onKeySaved={(status) => {
          // The key is persisted to the DB before verification runs, so
          // every outcome — including a Massive rejection — means a key
          // was saved. Notify Settings to re-sync its Market data input.
          onApiKeySaved?.()
          if (status?.kind === 'valid') {
            setModalOpen(false)
            void run() // auto-retry the backfill with the preserved `force`
          }
          // invalid / rate-limited / network-error: modal stays open;
          // ApiKeyEntry's inline 4-state message explains what happened.
        }}
      />
    </Card>
  )
}
