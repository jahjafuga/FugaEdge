import {
  SlidersHorizontal,
  TrendingUp,
  NotebookPen,
  LineChart,
  Database,
  LifeBuoy,
  Info,
  type LucideIcon,
} from 'lucide-react'

// Pure data: the Settings rail's category list. No logic, no IPC/electron — just
// the {id,label,icon} entries, so a future Next.js settings page reuses this map
// unchanged. `id` doubles as the localStorage value for the active tab and the
// pane-visibility key in Settings.tsx.
export interface SettingsCategory {
  id: string
  label: string
  icon: LucideIcon
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'trading', label: 'Trading', icon: TrendingUp },
  { id: 'journal', label: 'Journal', icon: NotebookPen },
  { id: 'market', label: 'Market data', icon: LineChart },
  { id: 'data', label: 'Data & storage', icon: Database },
  { id: 'help', label: 'Help', icon: LifeBuoy },
  { id: 'about', label: 'About', icon: Info },
]
