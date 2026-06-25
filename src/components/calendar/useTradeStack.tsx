import { useCallback, useState, type ReactNode } from 'react'
import type { TradeListRow } from '@shared/trades-types'
import { ipc } from '@/lib/ipc'
import TradeDetailModal from '@/components/trades/TradeDetailModal'

interface UseTradeStackOptions {
  /** Current trades to resolve the selected row from (day's or week's). */
  trades: TradeListRow[] | undefined
  /** Re-fetch the parent detail after a successful trade save, so its metrics
   *  stay consistent (playbook → mostUsedPlaybook, planned_risk → avgRMultiple…). */
  reload: () => Promise<void> | void
}

interface UseTradeStackResult {
  selectedTradeId: number | null
  /** Pass to a trades table's onSelectTrade. */
  selectTrade: (id: number | null) => void
  /** Clear the selection (call on date/week change). */
  reset: () => void
  /** True while a trade is stacked — feed to DetailModalShell.escapeBlocked. */
  escapeBlocked: boolean
  /** The stacked TradeDetailModal element (z-210); self-hides when none selected. */
  stackedModal: ReactNode
}

// v0.2.2 Day 4.5a — shared trade-detail stacking, extracted from
// DayDetailModal behavior-preserving. Owns selectedTradeId, the
// persist-then-reload save path for the 10 editable trade fields, and the
// stacked TradeDetailModal (stacked → z-210). One implementation shared by the
// Day and Week modals, so the Escape/z-order discipline lives in exactly one
// place — never re-debugged per modal.
export function useTradeStack({ trades, reload }: UseTradeStackOptions): UseTradeStackResult {
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null)

  // Persist a trade edit, then reload the parent detail if it actually changed
  // something. T is inferred per call from the specific save fn + input.
  async function persist<T>(
    save: (input: T) => Promise<TradeListRow | null>,
    input: T,
  ): Promise<void> {
    const updated = await save(input)
    if (updated) await reload()
  }

  const selectedTrade =
    trades && selectedTradeId !== null
      ? trades.find((t) => t.id === selectedTradeId) ?? null
      : null

  const stackedModal = (
    <TradeDetailModal
      trade={selectedTrade}
      stacked
      onClose={() => setSelectedTradeId(null)}
      onSaveNote={(i) => persist(ipc.tradeNoteSave, i)}
      onSaveTimeframe={(i) => persist(ipc.tradeTimeframeSave, i)}
      onSavePlaybook={(i) => persist(ipc.tradePlaybookSave, i)}
      onSaveConfidence={(i) => persist(ipc.tradeConfidenceSave, i)}
      onSavePlannedRisk={(i) => persist(ipc.tradePlannedRiskSave, i)}
      onSavePlannedStopLoss={(i) => persist(ipc.tradePlannedStopLossSave, i)}
      onSaveFloat={(i) => persist(ipc.tradeFloatSave, i)}
      onSaveCatalyst={(i) => persist(ipc.tradeCatalystSave, i)}
      onSaveCountry={(i) => persist(ipc.tradeCountrySave, i)}
      onSaveCountrySymbol={async (i) => {
        const changed = await ipc.tradeCountrySaveSymbol(i)
        if (changed > 0) await reload()
      }}
    />
  )

  return {
    selectedTradeId,
    selectTrade: setSelectedTradeId,
    reset: useCallback(() => setSelectedTradeId(null), []),
    escapeBlocked: selectedTradeId !== null,
    stackedModal,
  }
}
