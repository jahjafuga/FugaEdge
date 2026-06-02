import { afterEach } from 'vitest'

// Shared setup for the jsdom (.test.tsx) lane: unmount any React Testing
// Library trees after each test so DOM state never leaks between cases.
//
// setupFiles is global, so this also loads in the node (.test.ts) lane — the
// `document === undefined` guard short-circuits there and never imports RTL,
// keeping node-lane behavior byte-for-byte unchanged.
afterEach(async () => {
  if (typeof document === 'undefined') return
  const { cleanup } = await import('@testing-library/react')
  cleanup()
})
