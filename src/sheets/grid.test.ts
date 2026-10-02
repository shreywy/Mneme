import { describe, expect, it } from 'vitest'
import { DEFAULT_PAPER } from './types'
import { baselineOf, blocksInRect, boundsOf, cellAt, clampZoom, linesFor, paperStyle, snapUnits, toScreen, toWorld, zoomAt } from './grid'

const v = { x: -100, y: 50, zoom: 2 }

describe('grid', () => {
  it('converts between screen and world both ways', () => {
    const w = toWorld(v, 40, 60)
    expect(w).toEqual({ x: -80, y: 80 })
    expect(toScreen(v, w.x, w.y)).toEqual({ x: 40, y: 60 })
  })

  it('a click lands in the cell under it, including left of and above the start', () => {
    expect(cellAt({ x: 0, y: 0, zoom: 1 }, 30, 57, 28)).toEqual({ gx: 1, gy: 2 })
    expect(cellAt({ x: -280, y: -56, zoom: 1 }, 10, 10, 28)).toEqual({ gx: -10, gy: -2 })
  })

  it('snaps to the nearest line and rounds heights up to whole lines', () => {
    expect(snapUnits(41, 28)).toBe(1)
    expect(snapUnits(43, 28)).toBe(2)
    expect(snapUnits(-43, 28)).toBe(-2)
    expect(linesFor(0, 28)).toBe(1)
    expect(linesFor(28, 28)).toBe(1)
    expect(linesFor(29, 28)).toBe(2)
  })

  it('keeps zoom between 25% and 400%', () => {
    expect(clampZoom(0.1)).toBe(0.25)
    expect(clampZoom(9)).toBe(4)
  })

  it('zooming keeps the point under the cursor still', () => {
    const before = toWorld(v, 300, 200)
    const after = zoomAt(v, 300, 200, 1.5)
    expect(after.zoom).toBe(3)
    const w = toWorld(after, 300, 200)
    expect(w.x).toBeCloseTo(before.x)
    expect(w.y).toBeCloseTo(before.y)
  })

  it('bounds cover blocks on both sides of the start', () => {
    expect(boundsOf([])).toBeNull()
    expect(boundsOf([{ x: 3, y: 2, w: 24, h: 5 }, { x: -10, y: -4, w: 6, h: 2 }])).toEqual({ x: -10, y: -4, w: 37, h: 11 })
  })

  it('ruled paper puts a line under each row of text and moves with the view', () => {
    expect(baselineOf(28)).toBe(21)
    const s = paperStyle(DEFAULT_PAPER, { x: 0, y: 0, zoom: 1 })
    expect(s.backgroundSize).toBe('100% 28px')
    expect(s.backgroundPosition).toBe('0px 21px')
    const moved = paperStyle(DEFAULT_PAPER, { x: 10, y: 14, zoom: 2 })
    expect(moved.backgroundSize).toBe('100% 56px')
    expect(moved.backgroundPosition).toBe('0px 14px')
  })

  it('a selection box picks the blocks it touches, whichever way it was dragged', () => {
    const bs = [{ id: 'a', x: 0, y: 0, w: 4, h: 2 }, { id: 'b', x: 10, y: 0, w: 4, h: 2 }, { id: 'c', x: -6, y: -4, w: 2, h: 1 }]
    expect(blocksInRect(bs, { x: -1, y: -1 }, { x: 5, y: 3 })).toEqual(['a'])
    expect(blocksInRect(bs, { x: 5, y: 3 }, { x: -7, y: -5 })).toEqual(['a', 'c'])
    expect(blocksInRect(bs, { x: 4.5, y: 0 }, { x: 9.5, y: 2 })).toEqual([])
  })

  it('no lines means no line image, and a margin line is drawn left of the main column', () => {
    expect(paperStyle({ ...DEFAULT_PAPER, lines: 'none' }, { x: 0, y: 0, zoom: 1 }).backgroundImage).toBe('none')
    const m = paperStyle({ ...DEFAULT_PAPER, lines: 'none', margin: true }, { x: 0, y: 0, zoom: 1 })
    expect(m.backgroundImage).toContain('linear-gradient')
    expect(m.backgroundPosition).toBe('70px 0px')
  })
})
