import { useEffect, useRef, useState } from 'react'

// Layout-agnostic single-open accordion state machine, extracted from
// MacdStateGrid (F3). Drives a band of mutually-exclusive buckets where opening
// one closes any other, and a closing panel's content stays mounted through the
// collapse animation so it animates out instead of vanishing.
//
// Two pieces of state:
//   • openBucket    — which bucket is visually open (drives the panel animation).
//   • displayBucket — which bucket's content is mounted; lags openBucket on
//     close by closeMs so the content survives the collapse. A bare unmount
//     would collapse an empty box — no visible animation.
// A tracked timer performs the lag and is cleared on every toggle + on unmount,
// so rapid clicks can't fire a stale displayBucket reset.
//
// Generic over the bucket-key union so Section 2 (BucketKey) and future bands
// (e.g. Section 6 / F5 BucketRow) share one machine. Layout — which cards, which
// rows, where the panels sit — stays in the consumer.

// ~200ms grid-rows transition + a 10ms buffer, so content unmounts only after
// the collapse has finished.
const DEFAULT_CLOSE_MS = 210

export type UseBucketBandResult<TBucketKey extends string> = {
  openBucket: TBucketKey | null
  displayBucket: TBucketKey | null
  onToggle: (key: TBucketKey) => void
  isBucketOpen: (key: TBucketKey) => boolean
  isBucketDisplayed: (key: TBucketKey) => boolean
}

export function useBucketBand<TBucketKey extends string>(opts?: {
  closeMs?: number
}): UseBucketBandResult<TBucketKey> {
  const closeMs = opts?.closeMs ?? DEFAULT_CLOSE_MS

  // openBucket: which panel is visually open (drives the grid-rows animation).
  // displayBucket: which bucket's content is mounted — lags openBucket on close
  // so the panel animates out instead of vanishing.
  const [openBucket, setOpenBucket] = useState<TBucketKey | null>(null)
  const [displayBucket, setDisplayBucket] = useState<TBucketKey | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCloseTimer = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  // Clear any pending lag timer if the band unmounts mid-close.
  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    }
  }, [])

  const onToggle = (key: TBucketKey) => {
    clearCloseTimer()
    if (openBucket === key) {
      // (1) Close the open panel — keep its content mounted until the collapse ends.
      setOpenBucket(null)
      closeTimer.current = setTimeout(() => setDisplayBucket(null), closeMs)
    } else if (openBucket === null) {
      // (2) Open fresh.
      setDisplayBucket(key)
      setOpenBucket(key)
    } else {
      // (3) Switch — collapse the current panel, then open the new one once the
      // close animation has finished (sequential, never two animating at once).
      setOpenBucket(null)
      closeTimer.current = setTimeout(() => {
        setDisplayBucket(key)
        setOpenBucket(key)
      }, closeMs)
    }
  }

  return {
    openBucket,
    displayBucket,
    onToggle,
    isBucketOpen: (key) => openBucket === key,
    isBucketDisplayed: (key) => displayBucket === key,
  }
}
