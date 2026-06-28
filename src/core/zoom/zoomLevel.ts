// Zoom-level math, pure (no Electron, no node imports — per /ARCHITECTURE.md
// core rules). Chromium's zoom factor is 1.2 ** level, so level 0 = 100%, each
// +1 step is ~+20% and each -1 step ~-17%. The main process owns the zoom keys
// (Ctrl+= / Ctrl+- / Ctrl+0) via a before-input-event handler and applies the
// result with webContents.setZoomLevel; this module is just the bounded math so
// it stays unit-testable without spinning up Electron.

// Bound the level so the UI can't zoom into an unreadable state.
export const ZOOM_MIN = -3 // ~58%
export const ZOOM_MAX = 3 // ~173%

export function clampZoomLevel(level: number): number {
  if (level < ZOOM_MIN) return ZOOM_MIN
  if (level > ZOOM_MAX) return ZOOM_MAX
  return level
}

/** Given the current level and a direction, the next clamped level.
 *  dir: +1 = zoom in, -1 = zoom out, 0 = reset to 100%. */
export function nextZoomLevel(current: number, dir: 1 | -1 | 0): number {
  if (dir === 0) return 0
  return clampZoomLevel(current + dir)
}
