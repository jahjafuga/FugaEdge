import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DnaSettingsSection from '../DnaSettingsSection'
import { ipc } from '@/lib/ipc'
import { makeSettingsPayload } from '@/test/fixtures/settings'

vi.mock('@/lib/ipc', () => ({
  ipc: { settingsGet: vi.fn(), settingsSave: vi.fn() },
}))
const m = vi.mocked(ipc)

const DNA_KEYS = [
  'dna_price_min',
  'dna_price_max',
  'dna_change_min',
  'dna_rvol_min',
  'dna_float_min',
  'dna_float_max',
  'dna_require_catalyst',
].sort()

beforeEach(() => {
  vi.clearAllMocks()
  // dna_price_min = 3 is a unique display value among the pillar inputs.
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ dna_price_min: 3 }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload({ dna_price_min: 4 }))
})

describe('DnaSettingsSection — own Save writes only the 7 dna_* keys (RED-lock #2)', () => {
  it('settingsSave receives exactly the 7 dna_* keys, nothing else', async () => {
    render(<DnaSettingsSection />)
    const input = await screen.findByDisplayValue('3') // dna_price_min
    fireEvent.change(input, { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(m.settingsSave).toHaveBeenCalledTimes(1))
    const arg = m.settingsSave.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(arg).sort()).toEqual(DNA_KEYS)
    expect(arg.dna_price_min).toBe(4)
  })
})
