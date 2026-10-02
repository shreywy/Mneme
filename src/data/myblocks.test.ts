import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import * as sheets from './sheets'
import * as mine from './myblocks'
import * as ink from './ink'

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

const para = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

describe('my blocks', () => {
  it('saves blocks as one named group, kept relative to their top-left, on a page the library never lists', async () => {
    const id = await sheets.createSheet()
    const a = await sheets.addBlock({ sheetId: id, x: 10, y: 20, w: 8, h: 2, kind: 'text', data: { doc: para('axes') }, z: 1 })
    const b = await sheets.addBlock({ sheetId: id, x: 20, y: 22, w: 6, h: 1, kind: 'text', data: { doc: para('label') }, z: 2 })
    await mine.saveMyBlock('Free-body setup', [b, a])
    const [group] = await mine.listMyBlocks()
    expect(group.name).toBe('Free-body setup')
    expect(group.blocks.map((x) => [x.x, x.y, x.w])).toEqual([[0, 0, 8], [10, 2, 6]])
    expect((await sheets.listSheets()).map((s) => s.id)).toEqual([id])
  })

  it('placing a group copies its blocks onto a page at a point; deleting the group leaves the copies', async () => {
    const id = await sheets.createSheet()
    const a = await sheets.addBlock({ sheetId: id, x: 10, y: 20, w: 8, h: 2, kind: 'text', data: { doc: para('axes') }, z: 1 })
    await mine.saveMyBlock('Axes', [a])
    const [group] = await mine.listMyBlocks()
    const target = await sheets.createSheet()
    const { blocks: placed } = await mine.placeMyBlock(group, target, { x: 40, y: 5 })
    expect(placed).toHaveLength(1)
    expect(placed[0]).toMatchObject({ sheetId: target, x: 40, y: 5, w: 8, data: { doc: para('axes') } })
    await mine.deleteMyBlock(group.group)
    expect(await mine.listMyBlocks()).toEqual([])
    expect((await sheets.blocksFor(target)).some((x) => x.id === placed[0].id)).toBe(true)
  })

  it('keeps the drawing on saved blocks', async () => {
    const id = await sheets.createSheet()
    const a = await sheets.addBlock({ sheetId: id, x: 10, y: 20, w: 8, h: 2, kind: 'text', data: { doc: para('axes') }, z: 1 })
    await ink.addStroke({ sheetId: id, blockId: a.id, tool: 'pen', color: '#2D6CDF', size: 3, pts: [4, 4, 32, 8, 0, 0] })
    await mine.saveMyBlock('Axes', [a])
    const [group] = await mine.listMyBlocks()
    const target = await sheets.createSheet()
    const out = await mine.placeMyBlock(group, target, { x: 0, y: 0 })
    expect(out.ink).toHaveLength(1)
    expect(out.ink[0]).toMatchObject({ sheetId: target, blockId: out.blocks[0].id, color: '#2D6CDF' })
  })
})
