// v0.2.5 Phase B Session 5 (live-look iteration 4, 2026-06-13) — goal identity
// icons. Flat single-weight lucide, gold-tinted (the D26 grammar), replacing
// the OS-emoji glyphs: the emoji differentiated but broke the app's flat gold
// register. ONE source of truth — the preset chips (GoalCreateModal) and the
// goal cards (GoalCard) both resolve their icon here, so a "journaled days"
// chip and the card it creates always share BookOpen.
//
// This is a UI module, not strings.ts (icon COMPONENTS are not i18n copy) and
// not core/config.ts (core stays UI-free per ARCHITECTURE.md). lucide is
// already a dependency (the sidebar uses it) — no new dep, D17 stays closed.

import {
  BookOpen,
  PenLine,
  Repeat,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import type { GoalKind } from '@shared/identity-types'
import type { ProcessMetric } from '@/core/goals/config'

const METRIC_ICON: Record<ProcessMetric, LucideIcon> = {
  journaled_days: BookOpen,
  annotated_trades: PenLine,
  disciplined_entries: Target,
  weekly_reviews: Repeat,
}

const EQUITY_ICON: LucideIcon = TrendingUp

/** The icon for a goal kind + (process) metric. Equity ignores metric; a
 *  corrupt / unknown process metric falls back to Target, the generic process
 *  mark. */
export function goalIcon(kind: GoalKind, metric: ProcessMetric | null): LucideIcon {
  if (kind === 'equity') return EQUITY_ICON
  return metric ? METRIC_ICON[metric] : Target
}
