// src/components/trades/CountryEditor.tsx
import { useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Flag from '@/components/ui/Flag'
import {
  COUNTRY_NAMES,
  REGIONS,
  getRegionForCountry,
} from '@/core/country/regions'

interface CountryEditorProps {
  country: string | null
  countryName: string
  region: string
  source: 'polygon' | 'manual' | 'unknown'
  /** Always called with uppercase ISO alpha-2 or null to clear. */
  onChange: (next: string | null) => void
}

// Precomputed grouping: every COUNTRY_NAMES entry placed under its region
// in REGIONS display order. Built once at module load — the country list
// is static.
interface PickerRow { iso: string; name: string; region: string }
const ALL_ROWS: PickerRow[] = Object.entries(COUNTRY_NAMES)
  .map(([iso, name]) => ({ iso, name, region: getRegionForCountry(iso) }))
const ROWS_BY_REGION: Record<string, PickerRow[]> = (() => {
  const out: Record<string, PickerRow[]> = {}
  for (const r of REGIONS) out[r] = []
  for (const row of ALL_ROWS) {
    if (!out[row.region]) out[row.region] = []
    out[row.region].push(row)
  }
  for (const r of REGIONS) {
    out[r].sort((a, b) => a.name.localeCompare(b.name))
  }
  return out
})()

export default function CountryEditor({
  country,
  countryName,
  region,
  source,
  onChange,
}: CountryEditorProps) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return ROWS_BY_REGION
    const out: Record<string, PickerRow[]> = {}
    for (const r of REGIONS) {
      const rows = (ROWS_BY_REGION[r] ?? []).filter(
        (row) =>
          row.iso.toLowerCase().includes(needle) ||
          row.name.toLowerCase().includes(needle),
      )
      if (rows.length) out[r] = rows
    }
    return out
  }, [q])

  // Inline display: flag + name + region badge for set countries;
  // muted-gold "Set country" link for unknown.
  return (
    <>
      {country ? (
        <div className="flex items-center gap-2 font-mono text-sm">
          <Flag iso={country} size={20} title={countryName} />
          <span className="text-fg-primary">{countryName}</span>
          <span className="rounded-sm bg-gold/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gold">
            {region}
          </span>
          {source === 'manual' && (
            <span className="text-[10px] uppercase tracking-wider text-fg-muted" title="Manually set">
              · manual
            </span>
          )}
          <button
            type="button"
            onClick={() => { setQ(''); setOpen(true) }}
            aria-label="Edit country"
            className="ml-1 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-border-subtle text-fg-tertiary transition-colors duration-150 hover:border-gold/60 hover:text-gold"
          >
            <Pencil size={11} strokeWidth={2} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setQ(''); setOpen(true) }}
          className="cursor-pointer font-mono text-sm text-gold/60 underline-offset-2 transition-colors duration-150 hover:text-gold hover:underline"
        >
          Set country
        </button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Country"
        subtitle="Choose the company's country of operations."
        width={520}
      >
        <div className="space-y-3">
          <input
            type="text"
            autoFocus
            aria-label="Search country"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search country or ISO code…"
            className="w-full rounded-md border border-border-strong bg-bg-1 px-3 py-2 font-mono text-sm text-fg-primary placeholder:text-fg-tertiary outline-none transition-colors duration-150 focus:border-gold"
          />
          <div className="max-h-[60vh] space-y-3 overflow-auto">
            {REGIONS.filter((r) => (filtered[r] ?? []).length > 0).map((r) => (
              <div key={r}>
                <div className="mb-1 px-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-fg-tertiary">
                  {r}
                </div>
                <div className="grid grid-cols-1 gap-px">
                  {(filtered[r] ?? []).map((row) => {
                    const active = country === row.iso
                    return (
                      <button
                        key={row.iso}
                        type="button"
                        onClick={() => { onChange(row.iso); setOpen(false) }}
                        className={`flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-150 ${
                          active
                            ? 'bg-gold/15 text-gold'
                            : 'text-fg-primary hover:bg-bg-3'
                        }`}
                      >
                        <Flag iso={row.iso} size={16} title={row.name} />
                        <span className="font-mono">{row.name}</span>
                        <span className="ml-auto font-mono text-[10px] text-fg-tertiary">{row.iso}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-border-subtle pt-3">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false) }}
              className="cursor-pointer font-mono text-xs text-fg-tertiary transition-colors duration-150 hover:text-loss"
            >
              Clear country (mark Unknown)
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
