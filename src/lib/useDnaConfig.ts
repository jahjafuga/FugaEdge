import { useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'
import type { DnaConfig } from '@/core/dna/adherence'

// useDnaConfig — the ONE place the renderer reads the 7 Trader-DNA scan-profile
// settings, so the settings fetch stays OUT of useInsights (no Dashboard impact).
// Thin platform I/O glue (the architecture-rule split: pure compute lives in
// /src/core/dna; this hook just feeds it the config). Mirrors ChartTab's
// settingsGet read + useInsights's cancelled-flag fetch.

export interface UseDnaConfigResult {
  /** The 7 scan-profile settings, or null until the first fetch resolves. */
  config: DnaConfig | null
  loading: boolean
}

export function useDnaConfig(): UseDnaConfigResult {
  const [config, setConfig] = useState<DnaConfig | null>(null)

  useEffect(() => {
    let cancelled = false
    void ipc.settingsGet().then((s) => {
      if (cancelled) return
      const v = s.values
      setConfig({
        dna_price_min: v.dna_price_min,
        dna_price_max: v.dna_price_max,
        dna_change_min: v.dna_change_min,
        dna_rvol_min: v.dna_rvol_min,
        dna_float_min: v.dna_float_min,
        dna_float_max: v.dna_float_max,
        dna_require_catalyst: v.dna_require_catalyst,
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { config, loading: config === null }
}
