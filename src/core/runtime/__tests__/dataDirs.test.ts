import { describe, expect, it } from 'vitest'
import { resolveDataDirs } from '../dataDirs'

// D1 (v0.2.5 Session 0) — dev-DB isolation decision table. Pure module:
// packaged installs keep %APPDATA%\fugaedge; dev runs get fugaedge-dev;
// FUGAEDGE_DB_PATH points dev at a fixture DB and is IGNORED when packaged.

const WIN_APPDATA = 'C:\\Users\\test\\AppData\\Roaming'

describe('resolveDataDirs', () => {
  it('packaged → fugaedge userData and no db override', () => {
    const out = resolveDataDirs({
      isPackaged: true,
      appDataDir: WIN_APPDATA,
      envDbPath: null,
    })
    expect(out).toEqual({
      userDataDir: 'C:\\Users\\test\\AppData\\Roaming\\fugaedge',
      dbPathOverride: null,
    })
  })

  it('dev → fugaedge-dev userData and no db override', () => {
    const out = resolveDataDirs({
      isPackaged: false,
      appDataDir: WIN_APPDATA,
      envDbPath: null,
    })
    expect(out).toEqual({
      userDataDir: 'C:\\Users\\test\\AppData\\Roaming\\fugaedge-dev',
      dbPathOverride: null,
    })
  })

  it('dev + env path → override set, userData stays fugaedge-dev', () => {
    const out = resolveDataDirs({
      isPackaged: false,
      appDataDir: WIN_APPDATA,
      envDbPath: 'D:\\fixtures\\tester-b.db',
    })
    expect(out).toEqual({
      userDataDir: 'C:\\Users\\test\\AppData\\Roaming\\fugaedge-dev',
      dbPathOverride: 'D:\\fixtures\\tester-b.db',
    })
  })

  it('dev + padded env path → override is the trimmed path', () => {
    const out = resolveDataDirs({
      isPackaged: false,
      appDataDir: WIN_APPDATA,
      envDbPath: '  D:\\fixtures\\tester-b.db  ',
    })
    expect(out.dbPathOverride).toBe('D:\\fixtures\\tester-b.db')
  })

  it('packaged + env path → env is IGNORED (override always null)', () => {
    const out = resolveDataDirs({
      isPackaged: true,
      appDataDir: WIN_APPDATA,
      envDbPath: 'D:\\fixtures\\tester-b.db',
    })
    expect(out).toEqual({
      userDataDir: 'C:\\Users\\test\\AppData\\Roaming\\fugaedge',
      dbPathOverride: null,
    })
  })

  it('empty or whitespace-only env is treated as unset', () => {
    for (const envDbPath of ['', '   ', '\t']) {
      const out = resolveDataDirs({
        isPackaged: false,
        appDataDir: WIN_APPDATA,
        envDbPath,
      })
      expect(out.dbPathOverride).toBeNull()
    }
  })

  it('joins with the base dir separator style (posix base → posix join)', () => {
    const out = resolveDataDirs({
      isPackaged: false,
      appDataDir: '/home/test/.config',
      envDbPath: null,
    })
    expect(out.userDataDir).toBe('/home/test/.config/fugaedge-dev')
  })
})
