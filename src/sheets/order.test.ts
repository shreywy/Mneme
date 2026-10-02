import { describe, expect, it } from 'vitest'
import { readingOrder, titleFrom } from './order'
import type { SheetBlock } from './types'

const blk = (id: string, x: number, y: number, role?: 'main'): SheetBlock => ({ id, sheetId: 's', x, y, w: 10, h: 2, kind: 'text', role, data: { doc: null }, z: 0, createdAt: 0, updatedAt: 0 })

describe('reading order', () => {
  it('top to bottom, then left to right, including blocks above or left of the start', () => {
    const out = readingOrder([blk('side', 30, 2), blk('main', 3, 2, 'main'), blk('above', -8, -6), blk('below', 3, 20)])
    expect(out.map((b) => b.id)).toEqual(['above', 'main', 'side', 'below'])
  })
})

describe('title from content', () => {
  it('uses the first heading, trimmed', () => {
    expect(titleFrom({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'intro' }] }, { type: 'heading', content: [{ type: 'text', text: '  Circular ' }, { type: 'text', text: 'motion ' }] }] })).toBe('Circular motion')
  })
  it('nothing usable gives null', () => {
    expect(titleFrom({ type: 'doc', content: [{ type: 'heading' }] })).toBeNull()
    expect(titleFrom(null)).toBeNull()
  })
})
