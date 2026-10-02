import { describe, expect, it } from 'vitest'
import { pageCount, pageLines, paginate, sheetFrame, BETWEEN } from './pages'

describe('pages layout', () => {
  it('fits whole lines on a sheet, inside its top and bottom margins', () => {
    expect(pageLines('a4', 28)).toBe(36)
    expect(pageLines('letter', 28)).toBe(33)
    expect(pageLines('a4', 24)).toBe(42)
  })

  it('moves the block that would cross a page break onto the next sheet', () => {
    const { before, pages } = paginate([10, 10, 10, 10], 36)
    expect(before).toEqual({ 3: 6 + BETWEEN })
    expect(pages).toBe(2)
  })

  it('needs no break when everything fits, and an empty page is one sheet', () => {
    expect(paginate([12, 24], 36)).toEqual({ before: {}, pages: 1 })
    expect(paginate([], 36)).toEqual({ before: {}, pages: 1 })
  })

  it('starts a block taller than a page on a fresh sheet and lets it run on', () => {
    const { before, pages } = paginate([5, 50, 3], 36)
    expect(before).toEqual({ 1: 31 + BETWEEN })
    expect(pages).toBe(3)
  })

  it('counts sheets from the column height, spacers included', () => {
    expect(pageCount(36, 36)).toBe(1)
    expect(pageCount(36 + BETWEEN + 1, 36)).toBe(2)
    expect(pageCount(0, 36)).toBe(1)
  })

  it('centres the sheets on the main column', () => {
    const f = sheetFrame({ x: 3, y: 2, w: 24 }, 'a4', 28)
    expect(f.width).toBe(794)
    expect(f.left).toBe(3 * 28 + (24 * 28) / 2 - 794 / 2)
    expect(f.top).toBe(0) // two lines of margin above the first line
    expect(f.pitch).toBe((36 + BETWEEN) * 28)
  })
})
