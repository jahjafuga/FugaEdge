import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import { ipc } from '@/lib/ipc'
import { longDate } from '@/lib/format'

interface DataBackfillCardProps {
  lastRun: string | null
  onLastRunChange: (iso: string) => void
}

export default function DataBackfillCard({ lastRun, onLastRunChange }: DataBackfillCardProps) {
  const [running, setRunning] = useState(false)
  const [force, setForce] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number; symbol: string } | null>(null)
  const [result, setResult] = useState<{ updated: number; skipped: number; failed: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const off = ipc.countryOnBackfillProgress((p) => setProgress(p))
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
        setErr('Set your Polygon / Massive API key in the Market data card first.')
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

  const pct = progress && progress.total > 0 ? Math.floor((progress.current / progress.total) * 100) : 0

  return (
    <Card
      title="Data backfill"
      subtitle="Backfill missing country data from Polygon for trades you imported before this feature existed."
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={run}
            disabled={running}
            className="rounded-md border border-border-strong bg-bg-1 px-4 py-2 text-sm text-fg-primary transition-colors duration-150 hover:bg-bg-0 hover:border-gold/60 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? 'Backfilling…' : 'Backfill countries'}
          </button>
          <span className="font-mono text-xs text-fg-tertiary">
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
          Force re-fetch (overwrites Polygon-sourced values, keeps manual edits)
        </label>
        {progress && (
          <div>
            <div className="h-2 w-full overflow-hidden rounded-sm bg-bg-1">
              <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 font-mono text-[10px] text-fg-tertiary">
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
          <div className="font-mono text-xs text-loss">{err}</div>
        )}
      </div>
    </Card>
  )
}
