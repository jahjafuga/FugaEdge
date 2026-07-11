// The "050" append fix, proven through the two SELF-CONTAINED Settings sections that
// carry their own number inputs (the third, Settings' private NumberField, is covered in
// src/pages/__tests__/Settings.numberfield.test.tsx).
//
// Both sections show a literal "0" today and append to it. After the fix a zero-valued
// field renders EMPTY with a "0" placeholder, so there is nothing to append to, and the
// draft is deletable. type="number" (and therefore the spinbutton role) is preserved, and
// the value is committed on CHANGE — both are load-bearing for the existing trap tests.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSettingsPayload } from '@/test/fixtures/settings'

vi.mock('@/lib/ipc', () => ({
  ipc: { settingsGet: vi.fn(), settingsSave: vi.fn() },
}))

import DailyTargetSection from '../DailyTargetSection'
import DnaSettingsSection from '../DnaSettingsSection'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)
const savedArg = () => m.settingsSave.mock.calls[0][0] as Record<string, unknown>

beforeEach(() => {
  vi.clearAllMocks()
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
})

describe('DailyTargetSection — number input append fix', () => {
  it('a zero target renders EMPTY with a "0" placeholder (no literal "0" to append to)', async () => {
    m.settingsGet.mockResolvedValue(makeSettingsPayload({ daily_profit_target: 0 }))
    render(<DailyTargetSection />)

    const input = (await screen.findByRole('spinbutton')) as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('0')
    expect(input.type).toBe('number') // spinbutton preserved
  })

  it('the loaded value is present on the input FIRST commit (no empty flash on settings load)', async () => {
    m.settingsGet.mockResolvedValue(makeSettingsPayload({ daily_profit_target: 300 }))
    render(<DailyTargetSection />)

    // This section calls the hook BEFORE its load resolves, so the hook is first asked for
    // 0 (empty draft) and only later handed 300. If the draft were re-synced in a useEffect,
    // the input would commit EMPTY and only fill in on the later passive-effect flush — a
    // visible flash on every settings load, and an intermittent failure right here.
    // useNumberDraft adjusts DURING RENDER, so the very first committed frame holds "300".
    const input = (await screen.findByRole('spinbutton')) as HTMLInputElement
    expect(input.value).toBe('300')
  })

  it('typing 5 then 0 shows "50", never "050", and saves 50', async () => {
    m.settingsGet.mockResolvedValue(makeSettingsPayload({ daily_profit_target: 0 }))
    render(<DailyTargetSection />)
    const input = (await screen.findByRole('spinbutton')) as HTMLInputElement

    fireEvent.change(input, { target: { value: '5' } })
    expect(input.value).toBe('5')
    fireEvent.change(input, { target: { value: '50' } })
    expect(input.value).toBe('50')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(m.settingsSave).toHaveBeenCalledTimes(1))
    expect(savedArg()).toEqual({ daily_profit_target: 50 })
  })

  it('the "0" is deletable: clearing reaches empty and still commits 0', async () => {
    m.settingsGet.mockResolvedValue(makeSettingsPayload({ daily_profit_target: 300 }))
    render(<DailyTargetSection />)
    const input = (await screen.findByRole('spinbutton')) as HTMLInputElement
    expect(input.value).toBe('300')

    fireEvent.change(input, { target: { value: '' } })
    expect(input.value).toBe('') // React used to force "0" straight back

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(m.settingsSave).toHaveBeenCalledTimes(1))
    expect(savedArg()).toEqual({ daily_profit_target: 0 })
  })
})

describe('DnaSettingsSection — number input append fix + the 1e6 float divisor', () => {
  it('a zero pillar renders EMPTY; a stored float DISPLAYS scaled (stored / 1e6)', async () => {
    m.settingsGet.mockResolvedValue(
      makeSettingsPayload({ dna_float_min: 0, dna_float_max: 20_000_000 }),
    )
    render(<DnaSettingsSection />)

    // stored -> displayed: 20_000_000 / 1_000_000 = 20
    const floatMax = (await screen.findByLabelText('Float max')) as HTMLInputElement
    expect(floatMax.value).toBe('20')

    // 0 -> empty draft + "0" placeholder
    const floatMin = screen.getByLabelText('Float min') as HTMLInputElement
    expect(floatMin.value).toBe('')
    expect(floatMin.placeholder).toBe('0')
    expect(floatMin.type).toBe('number')
  })

  it('typing 5 then 0 into a zero pillar shows "50", never "050"', async () => {
    m.settingsGet.mockResolvedValue(makeSettingsPayload({ dna_float_min: 0 }))
    render(<DnaSettingsSection />)
    const floatMin = (await screen.findByLabelText('Float min')) as HTMLInputElement

    fireEvent.change(floatMin, { target: { value: '5' } })
    expect(floatMin.value).toBe('5')
    fireEvent.change(floatMin, { target: { value: '50' } })
    expect(floatMin.value).toBe('50')
  })

  it('displayed -> stored: the draft holds the SCALED value, the save carries the UN-scaled one', async () => {
    m.settingsGet.mockResolvedValue(makeSettingsPayload({ dna_float_min: 0 }))
    render(<DnaSettingsSection />)
    const floatMin = (await screen.findByLabelText('Float min')) as HTMLInputElement

    fireEvent.change(floatMin, { target: { value: '12' } })
    expect(floatMin.value).toBe('12') // display space (millions)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(m.settingsSave).toHaveBeenCalledTimes(1))
    expect(savedArg().dna_float_min).toBe(12_000_000) // stored space (raw shares)
  })

  it('an UNSCALED pillar (Price min, scale 1) is untouched by the divisor path', async () => {
    m.settingsGet.mockResolvedValue(makeSettingsPayload({ dna_price_min: 2 }))
    render(<DnaSettingsSection />)
    const priceMin = (await screen.findByLabelText('Price min')) as HTMLInputElement
    expect(priceMin.value).toBe('2')

    fireEvent.change(priceMin, { target: { value: '7.5' } })
    expect(priceMin.value).toBe('7.5')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(m.settingsSave).toHaveBeenCalledTimes(1))
    expect(savedArg().dna_price_min).toBe(7.5)
  })
})
