// Contributed capital — the ONE denominator in the app for "P&L as a
// percentage".
//
// MOVED here verbatim from CompareView (v0.2.7 Feature 5): the calendar's share
// card needs the same percentage the Compare growth row shows, and the only way
// two surfaces cannot disagree is for there to be one hook. Nothing below is new
// behaviour — the body, the comment and the three outcomes are the shipped ones.
//
import { useEffect, useState } from 'react'
import { useAccountScope } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'

// Beat 4 build B — THE UN-PARK: the growth row's denominator is
// CONTRIBUTED CAPITAL (starting + deposits - withdrawals) from the shipped
// cash ledger, never the current balance (P&L would shrink its own
// percentage) and never the app-wide account size (the c42c2d6 em-dash
// era). Derived renderer-side over the existing channels: single scope
// reads the scoped account; 'all' composes the walled sum over anchored
// non-sim accounts with coverage honesty. No anchor / non-positive
// contributed -> null (the em-dash) with an honest subLabel — never
// Infinity, never NaN.
export interface ContributedCapital {
  /** The denominator, or null when it must not compute. */
  contributed: number | null
  reason: 'ok' | 'no-anchor' | 'non-positive'
  /** Coverage for the 'all' subLabel: anchored / total non-sim. */
  anchored: number
  total: number
}

export function useContributedCapital(scope: ReturnType<typeof useAccountScope>['scope']): ContributedCapital | null {
  const [state, setState] = useState<ContributedCapital | null>(null)
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (scope === 'all') {
        const accounts = await ipc.accountsList()
        const nonSim = accounts.filter((a) => a.account_type !== 'sim')
        const balances = await Promise.all(nonSim.map((a) => ipc.cashBalanceGet(a.id)))
        const anchored = balances.filter((b): b is NonNullable<typeof b> => b !== null)
        const sum = anchored.reduce((s, b) => s + b.starting + b.deposits - b.withdrawals, 0)
        const next: ContributedCapital =
          anchored.length === 0
            ? { contributed: null, reason: 'no-anchor', anchored: 0, total: nonSim.length }
            : sum <= 0
              ? { contributed: null, reason: 'non-positive', anchored: anchored.length, total: nonSim.length }
              : { contributed: sum, reason: 'ok', anchored: anchored.length, total: nonSim.length }
        if (!cancelled) setState(next)
      } else {
        const b = await ipc.cashBalanceGet(scope.accountId)
        const c = b === null ? null : b.starting + b.deposits - b.withdrawals
        const next: ContributedCapital =
          b === null
            ? { contributed: null, reason: 'no-anchor', anchored: 0, total: 1 }
            : c !== null && c > 0
              ? { contributed: c, reason: 'ok', anchored: 1, total: 1 }
              : { contributed: null, reason: 'non-positive', anchored: 1, total: 1 }
        if (!cancelled) setState(next)
      }
    }
    setState(null) // stale guard — the row shows the em-dash while loading
    void load().catch(() => {
      if (!cancelled) setState(null) // fail-honest: never a fabricated %
    })
    return () => {
      cancelled = true
    }
  }, [scope])
  return state
}
