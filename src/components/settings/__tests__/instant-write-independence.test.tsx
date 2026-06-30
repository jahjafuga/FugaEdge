import { fireEvent, render, screen, waitFor, renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MistakesVocabularyEditor from '../MistakesVocabularyEditor'
import CatalystVocabularyEditor from '../CatalystVocabularyEditor'
import TrashSection from '../TrashSection'
import DataBackfillCard from '../DataBackfillCard'
import { useThemeMode } from '@/lib/theme'
import { ipc } from '@/lib/ipc'
import { makeSettingsPayload } from '@/test/fixtures/settings'
import { makeTrade } from '@/test/fixtures/trade'

// RED-lock #4 — the instant-write sections write through their OWN IPC and are
// independent of the page savebar (handleSave). None routes a savebar payload.
vi.mock('@/lib/ipc', () => ({
  ipc: {
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    mistakeDefsGet: vi.fn(),
    mistakeDefCreate: vi.fn(),
    catalystDefsGet: vi.fn(),
    catalystDefCreate: vi.fn(),
    tradesList: vi.fn(),
    tradeRestore: vi.fn(),
    countryBackfill: vi.fn(),
    countryOnBackfillProgress: vi.fn(() => () => {}),
    floatOnBackfillProgress: vi.fn(() => () => {}),
    profileOnBackfillProgress: vi.fn(() => () => {}),
    warmupOnBackfillProgress: vi.fn(() => () => {}),
    dailyChangeOnBackfillProgress: vi.fn(() => () => {}),
  },
}))
const m = vi.mocked(ipc)

// This vitest jsdom env ships no working localStorage (the components guard it
// with try/catch; the theme assertion below needs a real one). Install an
// in-memory mock so theme writes are observable.
function installMockLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  installMockLocalStorage()
  m.settingsSave.mockResolvedValue(makeSettingsPayload() as never)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Mistakes — instant write via mistakeDefCreate, never settingsSave', () => {
  it('adding a mistake calls mistakeDefCreate and not settingsSave', async () => {
    m.mistakeDefsGet.mockResolvedValue([] as never)
    m.mistakeDefCreate.mockResolvedValue({
      id: 1,
      axis: 'technical',
      name: 'Chasing',
      sort_position: 0,
      is_archived: false,
    } as never)
    render(<MistakesVocabularyEditor />)
    const inputs = await screen.findAllByPlaceholderText('Add a mistake (press Enter)')
    fireEvent.change(inputs[0], { target: { value: 'Chasing' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'add' })[0])

    await waitFor(() => expect(m.mistakeDefCreate).toHaveBeenCalled())
    expect(m.settingsSave).not.toHaveBeenCalled()
  })
})

describe('Catalysts — instant write via catalystDefCreate, never settingsSave', () => {
  it('adding a catalyst calls catalystDefCreate and not settingsSave', async () => {
    m.catalystDefsGet.mockResolvedValue([] as never)
    m.catalystDefCreate.mockResolvedValue({
      id: 1,
      name: 'Earnings',
      sort_position: 0,
      is_archived: false,
    } as never)
    render(<CatalystVocabularyEditor />)
    const input = await screen.findByPlaceholderText('Add a catalyst (press Enter)')
    fireEvent.change(input, { target: { value: 'Earnings' } })
    fireEvent.click(screen.getByRole('button', { name: 'add' }))

    await waitFor(() => expect(m.catalystDefCreate).toHaveBeenCalled())
    expect(m.settingsSave).not.toHaveBeenCalled()
  })
})

describe('Trash — instant restore via tradeRestore, never settingsSave', () => {
  it('restoring a trade calls tradeRestore and not settingsSave', async () => {
    m.tradesList.mockResolvedValue([
      makeTrade({ id: 7, symbol: 'AAA', deleted_at: '2026-06-01 10:00:00' }),
    ] as never)
    m.tradeRestore.mockResolvedValue(undefined as never)
    render(<TrashSection />)
    await screen.findByText('AAA') // text query sees through the collapsed body
    fireEvent.click(screen.getByRole('button', { name: /^Restore AAA/ }))

    await waitFor(() => expect(m.tradeRestore).toHaveBeenCalledWith(7))
    expect(m.settingsSave).not.toHaveBeenCalled()
  })
})

describe('DataBackfill — country backfill is independent of the savebar', () => {
  it('calls countryBackfill, and its ONLY settingsSave is its own last_country_backfill', async () => {
    m.countryBackfill.mockResolvedValue({
      apiKeyMissing: false,
      updated: 1,
      skipped: 0,
      failed: 0,
    } as never)
    render(<DataBackfillCard lastRun={null} onLastRunChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Backfill countries' }))

    await waitFor(() => expect(m.countryBackfill).toHaveBeenCalledWith(false))
    await waitFor(() => expect(m.settingsSave).toHaveBeenCalled())
    // The section self-persists ONLY last_country_backfill — never the savebar's keys.
    for (const call of m.settingsSave.mock.calls) {
      expect(Object.keys(call[0] as object)).toEqual(['last_country_backfill'])
    }
  })
})

describe('Theme — writes localStorage fugaedge-theme, never settingsSave', () => {
  it('setMode writes the theme key and does not touch settings', () => {
    const { result } = renderHook(() => useThemeMode())
    act(() => result.current.setMode('light'))
    expect(localStorage.getItem('fugaedge-theme')).toBe('light')
    expect(m.settingsSave).not.toHaveBeenCalled()
  })
})
