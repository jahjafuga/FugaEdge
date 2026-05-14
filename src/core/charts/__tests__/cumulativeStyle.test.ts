import { describe, it, expect } from 'vitest'
import { CUMULATIVE_LINE_TYPE } from '../cumulativeStyle'

describe('CUMULATIVE_LINE_TYPE', () => {
  it('is stepAfter so cumulative/equity lines do not interpolate across no-trade days', () => {
    expect(CUMULATIVE_LINE_TYPE).toBe('stepAfter')
  })
})
