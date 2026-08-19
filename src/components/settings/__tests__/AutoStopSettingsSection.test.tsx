// v0.2.7 Feature 3 Commit 3 — T17. The settings card is the ONLY way a user
// reaches the engine, so this file asserts that each control actually fires its
// operation. The previous feature shipped a fully tested filter nothing could
// reach; the point of these tests is that this one cannot.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AutoStopSettingsSection from '../AutoStopSettingsSection'
import { ipc } from '@/lib/ipc'
import { makeSettingsPayload } from '@/test/fixtures/settings'

vi.mock('@/lib/ipc', () => ({
  ipc: { settingsGet: vi.fn(), settingsSave: vi.fn(), autoStopRun: vi.fn() },
}))
const m = vi.mocked(ipc)

function payload(over: Record<string, unknown> = {}) {
  return makeSettingsPayload({
    autofill_stop_enabled: false,
    autofill_stop_pct: 3,
    ...over,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  m.settingsGet.mockResolvedValue(payload())
  m.autoStopRun.mockResolvedValue({ ran: true, changed: 0 })
})

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }))

describe('T17 every control reaches the engine', () => {
  it('turning the toggle ON and saving triggers APPLY', async () => {
    m.settingsSave.mockResolvedValue(payload({ autofill_stop_enabled: true }))
    render(<AutoStopSettingsSection />)

    const toggle = await screen.findByLabelText(/fill a stop/i)
    fireEvent.click(toggle)
    save()

    await waitFor(() => expect(m.settingsSave).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(m.autoStopRun).toHaveBeenCalledWith('apply'))
  })

  it('changing the percentage while it is ON triggers RE-DERIVE, not APPLY', async () => {
    m.settingsGet.mockResolvedValue(payload({ autofill_stop_enabled: true }))
    m.settingsSave.mockResolvedValue(
      payload({ autofill_stop_enabled: true, autofill_stop_pct: 5 }),
    )
    render(<AutoStopSettingsSection />)

    const pct = await screen.findByDisplayValue('3')
    fireEvent.change(pct, { target: { value: '5' } })
    save()

    await waitFor(() => expect(m.autoStopRun).toHaveBeenCalledWith('rederive'))
    expect(m.autoStopRun).not.toHaveBeenCalledWith('apply')
  })

  it('the clear button triggers CLEAR', async () => {
    m.settingsGet.mockResolvedValue(payload({ autofill_stop_enabled: true }))
    render(<AutoStopSettingsSection />)

    const clear = await screen.findByRole('button', { name: /clear/i })
    fireEvent.click(clear)

    await waitFor(() => expect(m.autoStopRun).toHaveBeenCalledWith('clear'))
    expect(m.settingsSave).not.toHaveBeenCalled() // clearing is not a settings change
  })

  it('saving with the toggle still OFF runs nothing', async () => {
    m.settingsSave.mockResolvedValue(payload({ autofill_stop_pct: 4 }))
    render(<AutoStopSettingsSection />)

    const pct = await screen.findByDisplayValue('3')
    fireEvent.change(pct, { target: { value: '4' } })
    save()

    await waitFor(() => expect(m.settingsSave).toHaveBeenCalledTimes(1))
    expect(m.autoStopRun).not.toHaveBeenCalled()
  })

  it('the clear button is unavailable while the feature is off, and says why', async () => {
    render(<AutoStopSettingsSection />)
    const clear = await screen.findByRole('button', { name: /clear/i })
    expect((clear as HTMLButtonElement).disabled).toBe(true)
    expect(clear.getAttribute('title')).toMatch(/turn/i)
  })
})
