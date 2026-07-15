import { useEffect, useRef, useState } from 'react'

// MULTI-open sibling of useBucketBand. Same close-lag contract, no exclusivity.
//
// useBucketBand holds ONE open key and ONE displayed key (useBucketBand.ts:40-41), which is the
// v0.2.4 locked rule: "only one expansion open per section at a time." That rule stands, and
// this hook does NOT change it — the five Technicals sections keep using useBucketBand and are
// untouched. This exists for the ONE surface where the rule is the bug: Tier Performance, where
// djsevans87 needs A+ and B open together to compare setups across tiers.
//
// TWO DIFFERENCES, and they are the whole hook:
//
//   1. Sets, not slots. openBuckets / displayedBuckets are Sets, so any number of panels can be
//      open at once.
//
//   2. ONE TIMER PER KEY. This is the part that actually needs care. useBucketBand can hold a
//      single timer ref because only one panel can ever be closing. Here, A+ may be collapsing
//      while B sits open — and A+'s 210ms unmount must remove ONLY A+ from displayedBuckets. A
//      shared timer would fire once and take the wrong key (or every key) with it. Hence the
//      Map<key, timer>: each collapse owns its own deadline and clears its own entry.
//
// The SWITCH branch (useBucketBand.ts:67-75) is gone entirely. It existed only to sequence a
// collapse before an open so two panels never animated at once. With no exclusivity there is
// nothing to close first, so opening is immediate — the machine gets simpler, not harder.
//
// Lives next to useBucketBand because TierPerformanceCard already imports AccordionPanel and
// useBucketBand from this directory; if these ever move to a shared hooks location, they move
// together.

// ~200ms grid-rows transition + a 10ms buffer, so content unmounts only after the collapse has
// finished. Same value as useBucketBand — they animate with the same AccordionPanel.
const DEFAULT_CLOSE_MS = 210

export type UseMultiBucketBandResult<TBucketKey extends string> = {
  openBuckets: ReadonlySet<TBucketKey>
  displayedBuckets: ReadonlySet<TBucketKey>
  onToggle: (key: TBucketKey) => void
  isBucketOpen: (key: TBucketKey) => boolean
  isBucketDisplayed: (key: TBucketKey) => boolean
}

export function useMultiBucketBand<TBucketKey extends string>(opts?: {
  closeMs?: number
}): UseMultiBucketBandResult<TBucketKey> {
  const closeMs = opts?.closeMs ?? DEFAULT_CLOSE_MS

  // openBuckets: which panels are visually open (drives each AccordionPanel's grid-rows).
  // displayedBuckets: whose content is mounted — a closing key lags here by closeMs so the
  // panel animates out instead of vanishing.
  const [openBuckets, setOpenBuckets] = useState<ReadonlySet<TBucketKey>>(() => new Set())
  const [displayedBuckets, setDisplayedBuckets] = useState<ReadonlySet<TBucketKey>>(
    () => new Set(),
  )

  // One pending unmount per collapsing key. See note 2 above.
  const closeTimers = useRef(new Map<TBucketKey, ReturnType<typeof setTimeout>>())

  // Clear every pending timer if the band unmounts mid-close.
  useEffect(() => {
    const timers = closeTimers.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  const cancelPendingClose = (key: TBucketKey): void => {
    const pending = closeTimers.current.get(key)
    if (pending !== undefined) {
      clearTimeout(pending)
      closeTimers.current.delete(key)
    }
  }

  const onToggle = (key: TBucketKey): void => {
    // Whichever way we go, any close already pending for THIS key is now stale. Cancelling it
    // here is what makes a mid-collapse re-toggle reopen cleanly instead of unmounting 210ms
    // later, under the freshly-reopened panel.
    cancelPendingClose(key)

    if (openBuckets.has(key)) {
      // CLOSE — hide now, unmount after the collapse has played out.
      setOpenBuckets((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      const timer = setTimeout(() => {
        setDisplayedBuckets((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
        closeTimers.current.delete(key)
      }, closeMs)
      closeTimers.current.set(key, timer)
      return
    }

    // OPEN — mount and show immediately. Nothing has to close first.
    setDisplayedBuckets((prev) => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
    setOpenBuckets((prev) => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }

  return {
    openBuckets,
    displayedBuckets,
    onToggle,
    isBucketOpen: (key) => openBuckets.has(key),
    isBucketDisplayed: (key) => displayedBuckets.has(key),
  }
}
