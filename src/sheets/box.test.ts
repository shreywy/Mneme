import { describe, expect, it } from 'vitest'
import { boxesAsText } from './box'
import { DEFAULT_PAPER, type SheetBlock, type SheetRow } from './types'
import { pagePayload, parsePagePayload } from './sharepage'

const block = (over: Partial<SheetBlock>): SheetBlock => ({ id: 'b', sheetId: 's', x: 3, y: 10, w: 24, h: 4, kind: 'text', data: { doc: null }, z: 0, createdAt: 0, updatedAt: 0, ...over })

describe('boxes as text', () => {
  it('a box becomes its title and its pages, in order, at the same spot', () => {
    const out = boxesAsText([block({ id: 'w1', kind: 'box', data: { doc: null, label: 'Week 1' } })], [
      { id: 'b', title: 'Ch 2', box: 'w1', rank: 1 }, { id: 'a', title: 'Ch 1', box: 'w1', rank: 0 }, { id: 'c', title: 'Other', box: 'w2' },
    ])
    expect(out[0]).toMatchObject({ id: 'w1', kind: 'text', x: 3, y: 10, w: 24 })
    expect(out[0].data.doc).toEqual({ type: 'doc', content: [
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Week 1' }] },
      { type: 'bulletList', content: ['Ch 1', 'Ch 2'].map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })) },
    ] })
  })

  it('an empty unnamed box says Pages and has no list; other blocks pass through', () => {
    const text = block({ id: 't' })
    const out = boxesAsText([text, block({ id: 'x', kind: 'box', data: { doc: null } })], [])
    expect(out[0]).toBe(text)
    expect(out[1].data.doc).toEqual({ type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Pages' }] }] })
  })

  it('a converted box goes through a share and comes back as its title and list', () => {
    const sheet: SheetRow = { id: 's', folderId: null, title: 'CPS721', titleAuto: false, paper: DEFAULT_PAPER, createdAt: 0, updatedAt: 0 }
    const blocks = boxesAsText([block({ id: 'm', role: 'main', y: 2, data: { doc: { type: 'doc', content: [{ type: 'paragraph' }] } } }), block({ id: 'w1', kind: 'box', data: { doc: null, label: 'Week 1' } })], [{ id: 'a', title: 'Ch 1', box: 'w1' }])
    const back = parsePagePayload(JSON.parse(JSON.stringify(pagePayload(sheet, blocks, [], false))))
    expect(back?.blocks.map((b) => b.kind)).toEqual(['text', 'text'])
    expect(JSON.stringify(back?.blocks[1].data.doc)).toContain('Ch 1')
  })
})
