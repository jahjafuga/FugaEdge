import type { TradeWithTechnicalsRow } from '@shared/technicals-types'

/**
 * Pure renderer-side filter for the trades returned by
 * ipc.listTradesWithTechnicals. Date range is server-side (passed in the
 * IPC options); ticker + playbook are client-side per the locked design.
 *
 * - ticker: case-insensitive contains-match on row.symbol. Empty string =
 *   no filter.
 * - playbookName: exact match on row.playbook_name. null = no filter. A row
 *   with null playbook_name is excluded when a non-null playbookName is
 *   passed.
 *
 * Pure per ARCHITECTURE rule 1: no electron / fs / db / React imports — the
 * same module runs on the future Next.js + Postgres port.
 */
export function filterRows(
  rows: TradeWithTechnicalsRow[],
  ticker: string,
  playbookName: string | null,
): TradeWithTechnicalsRow[] {
  const needle = ticker.toLowerCase()
  return rows.filter((row) => {
    if (needle !== '' && !row.symbol.toLowerCase().includes(needle)) return false
    if (playbookName !== null && row.playbook_name !== playbookName) return false
    return true
  })
}
