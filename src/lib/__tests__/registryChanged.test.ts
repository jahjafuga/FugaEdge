// Stage 3 beat 2.5 — the sibling notify: a MINIMAL module-level
// subscribe/notify pair (no payload; 'the registry changed' is the whole
// message), mirroring the theme.ts / refreshStore.ts listener-Set idiom.
// One emitter family (the accounts registry), one listener this beat.

import { describe, it, expect, vi } from 'vitest'
import { notifyRegistryChanged, subscribeRegistryChanged } from '../registryChanged'

describe('registryChanged — the minimal notifier', () => {
  it('notify reaches every subscriber', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = subscribeRegistryChanged(a)
    const offB = subscribeRegistryChanged(b)
    notifyRegistryChanged()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    offA()
    offB()
  })

  it('unsubscribe stops delivery', () => {
    const cb = vi.fn()
    const off = subscribeRegistryChanged(cb)
    notifyRegistryChanged()
    off()
    notifyRegistryChanged()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('subscribers are independent — one unsubscribing leaves the other live', () => {
    const stays = vi.fn()
    const leaves = vi.fn()
    const offStays = subscribeRegistryChanged(stays)
    const offLeaves = subscribeRegistryChanged(leaves)
    offLeaves()
    notifyRegistryChanged()
    expect(stays).toHaveBeenCalledTimes(1)
    expect(leaves).not.toHaveBeenCalled()
    offStays()
  })

  it('a no-subscriber notify is a safe no-op', () => {
    expect(() => notifyRegistryChanged()).not.toThrow()
  })
})
