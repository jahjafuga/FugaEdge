// v0.2.5 Phase B Session 6 — maps the catalog's lucide icon NAMES (strings,
// kept pure in src/core/badges/catalog.ts) to lucide components. The
// iteration-4 goals/icons.ts precedent: core stays UI-free; this UI module
// owns the name → component binding.
import {
  Archive,
  Award,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  Coins,
  Crosshair,
  Crown,
  DollarSign,
  Flame,
  Gem,
  Landmark,
  Lock,
  Medal,
  PenLine,
  ShieldCheck,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Readonly<Record<string, LucideIcon>> = {
  Archive,
  Award,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  // Arc 3 — the money milestone rungs.
  Coins,
  Crosshair,
  Crown,
  DollarSign,
  Flame,
  Gem,
  Landmark,
  Lock,
  Medal,
  PenLine,
  ShieldCheck,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Zap,
}

/** Resolve a catalog icon name to a lucide component (Award is the fallback). */
export function badgeIcon(name: string): LucideIcon {
  return ICONS[name] ?? Award
}
