import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { FillLadderOverlay } from '../FillLadderOverlay'
import type { LadderDot, LadderLeader, LadderPill } from '@/lib/assembleLadderFrame'

const dots: LadderDot[] = [
  { x: 100, y: 200, r: 4, color: '#3fb389' },
  { x: 150, y: 250, r: 5, color: '#e06b6b' },
]
const leaders: LadderLeader[] = [
  { x1: 100, y1: 200, x2: 130, y2: 200 },
  { x1: 150, y1: 250, x2: 180, y2: 250 },
]
const pills: LadderPill[] = [
  { cx: 159, cy: 200, w: 58, h: 16, label: '100 @ 5.00', color: '#3fb389' },
  { cx: 209, cy: 250, w: 58, h: 16, label: '200 @ 5.05', color: '#e06b6b' },
]

describe('FillLadderOverlay', () => {
  it('renders one SVG element per geometry item (2 dots, 2 leaders, 2 pills)', () => {
    const { container } = render(
      <FillLadderOverlay dots={dots} leaders={leaders} pills={pills} />,
    )
    expect(container.querySelectorAll('line')).toHaveLength(2) // leaders
    expect(container.querySelectorAll('rect')).toHaveLength(2) // pills
    expect(container.querySelectorAll('text')).toHaveLength(2) // pill labels
    expect(container.querySelectorAll('circle')).toHaveLength(2) // dots
  })
})
