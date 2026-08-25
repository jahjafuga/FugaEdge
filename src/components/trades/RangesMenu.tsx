import { SlidersHorizontal } from 'lucide-react'
import ToggleMenu from '@/components/ui/ToggleMenu'
import { NUMERIC_COLUMN_IDS, COLUMN_LABELS } from '@/lib/prefs/columns'
import {
  choicesFromMenu,
  menuBooleans,
  resetRangeChoices,
  type RangeChoices,
} from '@/lib/prefs/rangeChoices'

// WHICH ranges get an input pair on the Trades tab. The second caller of
// ToggleMenu, and the reason it was extracted: same trigger, same popover, same
// locked-and-reset shape, a different list.
//
// ALL TWENTY-FOUR are offered, market_cap, vwap_dist_pct and ema9_dist_pct
// included, even though those three are absent from ALL_COLUMN_IDS and so can
// never be shown as table columns. Filtering on something you do not display is
// legitimate — the range asks a question about the trade, not about the row.
//
// NOTHING IS LOCKED. Columns lock the pinned pair because rows cannot be told
// apart without them; a range is never load-bearing that way, and R3 makes zero
// chosen the default, so a locked range would be a contradiction.
//
// TOGGLEMENU IS NOT MODIFIED for provenance. It speaks a boolean map and knows
// nothing about who ticked what; the conversion happens here, at the wrapper,
// which is the same seam that kept the prefs key out of it.
//
// PERSISTENCE IS THE PAGE'S, as it is for ColumnsMenu. This file names the ids,
// the labels and the reset target; the page owns the key and does the write.
// That split is what let ranges land on a global key while the filters they
// belong to stay per-account.

export interface RangesMenuProps {
  choices: RangeChoices
  onChange: (next: RangeChoices) => void
}

const ITEMS = (NUMERIC_COLUMN_IDS as readonly string[]).map((id) => ({
  id,
  label: COLUMN_LABELS[id] ?? id,
}))

const TEST_IDS = {
  button: 'ranges-button',
  menu: 'ranges-menu',
  reset: 'ranges-reset',
  item: (id: string) => `choose-range-${id}`,
}

export default function RangesMenu({ choices, onChange }: RangesMenuProps) {
  return (
    <ToggleMenu
      items={ITEMS}
      value={menuBooleans(choices)}
      onChange={(next) => onChange(choicesFromMenu(choices, next))}
      onReset={() => onChange(resetRangeChoices())}
      label="Ranges"
      icon={<SlidersHorizontal size={13} strokeWidth={2} />}
      testIds={TEST_IDS}
    />
  )
}
