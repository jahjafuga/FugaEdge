import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PERF_TAB = resolve(__dirname, '../analytics/tabs/PerformanceTab.tsx')

describe('PerformanceTab — Streaks card', () => {
  it('does not double-wrap StreaksCard in an outer Card titled "Streaks"', () => {
    const src = readFileSync(PERF_TAB, 'utf-8')
    // StreaksCard already renders its own <Card title="Streaks">. An outer
    // wrapper would render the header twice.
    expect(src).not.toMatch(/<Card\s+title="Streaks"\s*>/)
  })

  it('renders StreaksCard directly (no inline wrapper component)', () => {
    const src = readFileSync(PERF_TAB, 'utf-8')
    expect(src).not.toMatch(/StreaksCardInline/)
  })
})
