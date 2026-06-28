import { describe, it, expect } from 'vitest'
import { clampZoomLevel, nextZoomLevel, ZOOM_MIN, ZOOM_MAX } from '../zoomLevel'

describe('clampZoomLevel', () => {
  it('passes in-range levels through unchanged', () => {
    expect(clampZoomLevel(0)).toBe(0)
    expect(clampZoomLevel(2)).toBe(2)
    expect(clampZoomLevel(-2)).toBe(-2)
  })

  it('clamps below the minimum up to ZOOM_MIN', () => {
    expect(clampZoomLevel(-5)).toBe(ZOOM_MIN)
  })

  it('clamps above the maximum down to ZOOM_MAX', () => {
    expect(clampZoomLevel(5)).toBe(ZOOM_MAX)
  })

  it('passes the exact bounds through', () => {
    expect(clampZoomLevel(ZOOM_MIN)).toBe(ZOOM_MIN)
    expect(clampZoomLevel(ZOOM_MAX)).toBe(ZOOM_MAX)
  })
})

describe('nextZoomLevel', () => {
  it('zoom in (+1) increments', () => {
    expect(nextZoomLevel(0, 1)).toBe(1)
  })

  it('zoom out (-1) decrements', () => {
    expect(nextZoomLevel(0, -1)).toBe(-1)
  })

  it('reset (0) returns 0 regardless of current level', () => {
    expect(nextZoomLevel(2, 0)).toBe(0)
    expect(nextZoomLevel(-3, 0)).toBe(0)
  })

  it('zoom in at the max is a no-op (stays at ZOOM_MAX)', () => {
    expect(nextZoomLevel(ZOOM_MAX, 1)).toBe(ZOOM_MAX)
  })

  it('zoom out at the min is a no-op (stays at ZOOM_MIN)', () => {
    expect(nextZoomLevel(ZOOM_MIN, -1)).toBe(ZOOM_MIN)
  })
})
