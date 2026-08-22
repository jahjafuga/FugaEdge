// v0.2.7 — THE SELF-PHOTOGRAPHY HARNESS. Dev-only, env-gated, a NO-OP without
// FUGAEDGE_CAPTURE_DIR.
//
// Twice this rig was hand-inserted into the main entry, driven, and reverted
// byte-identical — once to photograph the query bubble, once more when its
// re-home needed proof. A hook needed twice is a module, not a ritual.
//
// WHAT IT IS: with FUGAEDGE_CAPTURE_DIR set, after the window loads, the app
// drives ITSELF through the sequence below using REAL input events —
// rawKeyDown/char/keyUp triplets and mouse events at DOM-discovered
// coordinates, never element.click() — because only the real pipeline proves
// the UI (the K-battery lesson). Every settled step is photographed with
// webContents.capturePage into numbered PNGs plus a manifest, then the app
// quits itself.
//
// WHAT IT IS NOT: reachable in production. The gate is the env var; a
// packaged build never sets it, an ordinary dev run never sets it, and the
// no-op contract (zero listeners wired when absent) is pinned by test.
//
// HARD-LEARNED, recorded here because all three cost a re-run:
//   - rawKeyDown, not keyDown: on Windows only the raw form reaches the
//     renderer's key listeners through this pipeline.
//   - detect by STRUCTURE, not text: innerText assertions lie across JSX
//     whitespace seams; presence checks query elements.
//   - escape nothing twice: regex strings pass through enough layers that a
//     doubled backslash becomes a literal and the probe silently goes blind.

import type { App, BrowserWindow } from 'electron'
import { join } from 'path'

// ── THE SEQUENCE, AS DATA ────────────────────────────────────────────────────
// One entry per frame: what to do, then what to photograph. `act` runs before
// the shot; captions land in manifest.txt beside the PNGs.

type Act =
  | { op: 'clickNav' }
  | { op: 'openEdge' }
  | { op: 'key'; keyCode: string; modifiers?: string[] }
  | { op: 'type'; text: string }
  | { op: 'waitTrades' }
  | { op: 'setMark'; mark: 'swoosh' | 'monogram' | 'loop' }

export interface CaptureStep {
  frame: string
  caption: string
  act: Act[]
  /** Crop the shot to an element's neighbourhood instead of the full page —
   *  frame 10 zooms the resting FAB so a still can carry the glow. */
  zoomSel?: string
}

export const CAPTURE_SEQUENCE: CaptureStep[] = [
  { frame: '01', caption: 'full page at rest - Edge disc bottom-right, last table row clear of it (clearance padding live)', act: [{ op: 'clickNav' }, { op: 'waitTrades' }] },
  { frame: '02', caption: 'the disc zoomed - SWOOSH mark (the default; breathe 3200ms, one instant)', act: [], zoomSel: 'button[title*="Edge"]' },
  { frame: '03', caption: 'the disc zoomed - MONOGRAM candidate (harness override, one line to ship)', act: [{ op: 'setMark', mark: 'monogram' }], zoomSel: 'button[title*="Edge"]' },
  { frame: '04', caption: 'the disc zoomed - LOOP candidate (open ring, the aperture)', act: [{ op: 'setMark', mark: 'loop' }], zoomSel: 'button[title*="Edge"]' },
  { frame: '05', caption: 'panel open - card-premium surface, gold hairline, the greeting (open 150ms out-soft; stagger 0/80ms)', act: [{ op: 'setMark', mark: 'swoosh' }, { op: 'openEdge' }] },
  { frame: '06', caption: 'china losers resolved - chips + live count on the new surface (chip land 150ms + 180ms shine)', act: [{ op: 'type', text: 'china losers' }] },
  { frame: '07', caption: 'committed - the exchange logged on the premium surface (pulse 280ms, done)', act: [{ op: 'key', keyCode: 'Enter' }, { op: 'openEdge' }] },
]

/** Wire the capture run onto a freshly created window. Returns true when the
 *  harness armed (env var present), false for the guaranteed no-op. */
export function installCaptureRun(win: BrowserWindow, app: App): boolean {
  const capDir = process.env.FUGAEDGE_CAPTURE_DIR
  if (!capDir) return false

  const fsCap = require('node:fs') as typeof import('node:fs')
  const wc = win.webContents
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const js = (code: string) => wc.executeJavaScript(code, true)
  const settle = () => js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,150))))')
  const manifest: string[] = []

  const shot = async (n: string, caption: string, zoomSel?: string) => {
    await settle()
    let rect: Electron.Rectangle | undefined
    if (zoomSel) {
      const r = (await js(
        '(()=>{const el=document.querySelector(' + JSON.stringify(zoomSel) + ');if(!el)return null;' +
        'const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height}})()',
      )) as { x: number; y: number; w: number; h: number } | null
      if (r) {
        const pad = 90
        rect = {
          x: Math.max(0, Math.round(r.x - pad)),
          y: Math.max(0, Math.round(r.y - pad)),
          width: Math.round(r.w + pad * 2),
          height: Math.round(r.h + pad * 2),
        }
      }
    }
    const img = rect ? await wc.capturePage(rect) : await wc.capturePage()
    fsCap.writeFileSync(join(capDir, n + '.png'), img.toPNG())
    manifest.push(n + '  ' + caption)
  }
  const key = async (keyCode: string, modifiers: Electron.InputEvent['modifiers'] = []) => {
    wc.sendInputEvent({ type: 'rawKeyDown', keyCode, modifiers })
    if (keyCode.length === 1) wc.sendInputEvent({ type: 'char', keyCode, modifiers })
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await sleep(40)
  }
  const typeText = async (text: string) => {
    for (const ch of text) await key(ch)
  }
  const clickSel = async (sel: string) => {
    const r = (await js(
      '(()=>{const el=document.querySelector(' + JSON.stringify(sel) + ');if(!el)return null;' +
      "el.scrollIntoView({block:'center'});const b=el.getBoundingClientRect();" +
      'return {x:b.x+b.width/2,y:b.y+b.height/2}})()',
    )) as { x: number; y: number } | null
    if (!r) throw new Error('selector not found: ' + sel)
    const x = Math.round(r.x)
    const y = Math.round(r.y)
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
    await sleep(100)
  }
  const present = (sel: string) =>
    js('!!document.querySelector(' + JSON.stringify(sel) + ')') as Promise<boolean>
  const waitSel = async (sel: string) => {
    for (let i = 0; i < 120; i++) {
      if (await present(sel)) return
      await sleep(200)
    }
    throw new Error('never appeared: ' + sel)
  }

  const EDGE_INPUT = 'input[aria-label="Ask Edge"]'
  const run = async (act: Act) => {
    switch (act.op) {
      case 'clickNav':
        return clickSel('a[href*="trades" i]')
      case 'waitTrades':
        return waitSel('[data-testid="range-filters"], table')
      case 'openEdge': {
        if (await present(EDGE_INPUT)) return
        await key('k', ['control'])
        await sleep(400)
        if (await present(EDGE_INPUT)) return
        manifest.push('NOTE: Ctrl+K did not register; opened via the Edge trigger (genuine click)')
        await clickSel('button[title*="Edge"]')
        await sleep(400)
        if (!(await present(EDGE_INPUT))) throw new Error('Edge never opened')
        return
      }
      case 'key':
        return key(act.keyCode, (act.modifiers ?? []) as Electron.InputEvent['modifiers'])
      case 'type':
        return typeText(act.text)
      case 'setMark': {
        // dev-only override + a re-render nudge (open/close cycles state)
        await js('window.__edgeMarkOverride = ' + JSON.stringify(act.mark))
        await clickSel('button[title*="Edge"]')
        await clickSel('button[title*="Edge"]')
        await sleep(250)
        return
      }
    }
  }

  wc.once('did-finish-load', () => {
    void (async () => {
      try {
        win.setSize(1600, 900)
        win.center()
        await sleep(1500)
        manifest.push('NOTE: stills cannot show motion - every animated moment is captured at its END state; timings ride the captions (open 150ms out-soft, chip land 150ms + 180ms shine, digits 150ms, pills 120ms staggered 40ms, commit pulse 280ms, breathe 3200ms)')
        for (const step of CAPTURE_SEQUENCE) {
          for (const a of step.act) await run(a)
          await shot(step.frame, step.caption, step.zoomSel)
        }
      } catch (e) {
        manifest.push('CAPTURE ERROR: ' + (e instanceof Error ? e.message : String(e)))
      } finally {
        fsCap.writeFileSync(join(capDir, 'manifest.txt'), manifest.join(String.fromCharCode(10)) + String.fromCharCode(10))
        app.quit()
      }
    })()
  })
  return true
}
