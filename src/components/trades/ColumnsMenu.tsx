import { useMemo } from 'react'
import { Columns3 } from 'lucide-react'
import ToggleMenu from '@/components/ui/ToggleMenu'
import {
  ALL_COLUMN_IDS,
  COLUMN_LABELS,
  isLockedColumn,
  resetColumnVisibility,
} from '@/lib/prefs/columns'

// The column-visibility control, lifted out of the table.
//
// It never needed the table instance: the ids, their order, their labels and which
// of them are locked all live in src/lib/prefs/columns.ts, and the visibility state
// is owned by whoever renders the table. So it renders wherever the state lives —
// beside the view switcher on the Trades page, which is where a control that
// governs the table belongs, rather than in a band of its own above it.
//
// A standalone table (tests, and any future embed) keeps its own copy of the state,
// so it still mounts this itself. One component, two mount points, decided by
// ownership — not two implementations.
//
// THE MARKUP NOW LIVES IN ui/ToggleMenu, because RANGES needs the same chooser
// over a different list and a copied chooser is how two of them drift until one
// forgets its locked rule. What stays HERE is everything that is specific to
// columns and must not leak into a shared component: which ids exist and in what
// order, what they are called, which may never be hidden, what "default" means,
// and — the load-bearing one — the prefs key. resetColumnVisibility() writes to
// localStorage (columns.ts:210), and that write happens in this file's callback
// rather than inside the generic, so the day ranges are scoped per-account and
// columns stay global, nothing shared has to be torn apart.

export interface ColumnsMenuProps {
  visibility: Record<string, boolean>
  onChange: (next: Record<string, boolean>) => void
}

/** Ids and their labels, in render order — the registry's order, not a sort. */
const ITEMS = ALL_COLUMN_IDS.map((id) => ({ id, label: COLUMN_LABELS[id] ?? id }))

// The testids are passed rather than derived because they never shared a base:
// the trigger has always been columns-button while its rows are col-toggle-<id>.
// Nine test files hold these handles, and TradesTable.chrome.test.tsx:236 reads
// THIS FILE's source for the two literals below, checking one component serves
// both mount points.
const TEST_IDS = {
  button: 'columns-button',
  menu: 'columns-menu',
  reset: 'columns-reset',
  item: (id: string) => `col-toggle-${id}`,
}

export default function ColumnsMenu({ visibility, onChange }: ColumnsMenuProps) {
  const locked = useMemo(() => new Set(ALL_COLUMN_IDS.filter(isLockedColumn)), [])

  return (
    <ToggleMenu
      items={ITEMS}
      value={visibility}
      onChange={onChange}
      onReset={() => onChange(resetColumnVisibility())}
      label="Columns"
      locked={locked}
      icon={<Columns3 size={13} strokeWidth={2} />}
      testIds={TEST_IDS}
    />
  )
}
