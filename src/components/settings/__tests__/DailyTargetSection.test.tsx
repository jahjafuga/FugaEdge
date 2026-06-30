import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DailyTargetSection from '../DailyTargetSection'
import { ipc } from '@/lib/ipc'
import { makeSettingsPayload } from '@/test/fixtures/settings'

vi.mock('@/lib/ipc', () => ({
  ipc: { settingsGet: vi.fn(), settingsSave: vi.fn() },
}))
const m = vi.mocked(ipc)

beforeEach(() => {
  vi.clearAllMocks()
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ daily_profit_target: 0 }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload({ daily_profit_target: 100 }))
})

describe('DailyTargetSection — own Save writes only daily_profit_target (RED-lock #3)', () => {
  it('settingsSave receives exactly { daily_profit_target }', async () => {
    render(<DailyTargetSection />)
    // The section has a single number input.
    const input = await screen.findByRole('spinbutton')
    fireEvent.change(input, { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(m.settingsSave).toHaveBeenCalledTimes(1))
    const arg = m.settingsSave.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(arg)).toEqual(['daily_profit_target'])
    expect(arg.daily_profit_target).toBe(100)
  })
})
