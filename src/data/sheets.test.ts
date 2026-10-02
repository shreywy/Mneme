import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import * as sheets from './sheets'
import * as repo from './repo'
import { DEFAULT_PAPER } from '../sheets/types'

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

const para = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] })

describe('sheets', () => {
  it('a new page starts with one main text block at (3, 2), 24 wide, and default paper', async () => {
    const id = await sheets.createSheet({ folderId: null })
    const s = await sheets.getSheet(id)
    expect(s).toMatchObject({ title: 'Untitled page', titleAuto: true, paper: DEFAULT_PAPER, folderId: null })
    const blocks = await sheets.blocksFor(id)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ x: 3, y: 2, w: 24, h: 1, kind: 'text', role: 'main' })
  })

  it('a new page can start in a unit; with none it has no unit', async () => {
    expect((await sheets.getSheet(await sheets.createSheet({ unit: 'Week 3' })))?.unit).toBe('Week 3')
    expect((await sheets.getSheet(await sheets.createSheet()))?.unit).toBeUndefined()
  })

  it('deleting a page deletes its blocks', async () => {
    const id = await sheets.createSheet()
    await sheets.addBlock({ sheetId: id, x: 30, y: 2, w: 10, h: 1, kind: 'text', data: { doc: para('side') }, z: 0 })
    await sheets.deleteSheet(id)
    expect(await sheets.getSheet(id)).toBeUndefined()
    expect(await db.sheetBlocks.where('sheetId').equals(id).count()).toBe(0)
  })

  it('archived pages and pages in archived folders are not listed', async () => {
    const a = await sheets.createSheet()
    const b = await sheets.createSheet()
    await sheets.setSheetArchived(b, true)
    expect((await sheets.listSheets()).map((s) => s.id)).toEqual([a])
  })

  it('an emptied side block is removed, the main block never is', async () => {
    const id = await sheets.createSheet()
    const [main] = await sheets.blocksFor(id)
    const side = await sheets.addBlock({ sheetId: id, x: 30, y: 2, w: 10, h: 1, kind: 'text', data: { doc: para('') }, z: 0 })
    expect(await sheets.pruneEmpty(side)).toBe(true)
    expect(await sheets.pruneEmpty(main)).toBe(false)
    expect((await sheets.blocksFor(id)).map((b) => b.id)).toEqual([main.id])
  })

  it('saving the main block names the page from its first heading, until the user renames it', async () => {
    const id = await sheets.createSheet()
    const [main] = await sheets.blocksFor(id)
    const doc = { type: 'doc', content: [{ type: 'heading', content: [{ type: 'text', text: 'Circular motion' }] }] }
    await sheets.saveBlockDoc(main.id, doc)
    expect((await sheets.getSheet(id))?.title).toBe('Circular motion')
    await sheets.updateSheet(id, { title: 'My name', titleAuto: false })
    await sheets.saveBlockDoc(main.id, { type: 'doc', content: [{ type: 'heading', content: [{ type: 'text', text: 'Other' }] }] })
    expect((await sheets.getSheet(id))?.title).toBe('My name')
    expect(((await sheets.blocksFor(id))[0].data.doc as typeof doc).content[0].content[0].text).toBe('Other')
  })

  it('deleting a folder moves its pages up to the parent folder', async () => {
    const parent = await repo.createFolder('Physics')
    const child = await repo.createFolder('Week 1', parent)
    const id = await sheets.createSheet({ folderId: child })
    await repo.deleteFolder(child)
    expect((await sheets.getSheet(id))?.folderId).toBe(parent)
  })

  it('the cleanup on open leaves recent empty blocks alone (another device may be typing in one)', async () => {
    const id = await sheets.createSheet()
    const fresh = await sheets.addBlock({ sheetId: id, x: 30, y: 2, w: 10, h: 1, kind: 'text', data: { doc: para('') }, z: 1 })
    const old = await sheets.addBlock({ sheetId: id, x: 30, y: 6, w: 10, h: 1, kind: 'text', data: { doc: para('') }, z: 2 })
    await db.sheetBlocks.update(old.id, { updatedAt: Date.now() - 5 * 60_000 })
    await sheets.pruneLeftovers(id)
    const left = (await sheets.blocksFor(id)).map((b) => b.id)
    expect(left).toContain(fresh.id)
    expect(left).not.toContain(old.id)
  })

  it('knows an empty document from one with text, headings or list items', () => {
    expect(sheets.isEmptyDoc(para(''))).toBe(true)
    expect(sheets.isEmptyDoc({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }] })).toBe(true)
    expect(sheets.isEmptyDoc(para('x'))).toBe(false)
    expect(sheets.isEmptyDoc({ type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }] })).toBe(false)
  })

  it('a bookmark is never cleared as an empty block', async () => {
    const id = await sheets.createSheet()
    const mark = await sheets.addBlock({ sheetId: id, x: 40, y: 80, w: 1, h: 1, kind: 'bookmark', data: { doc: null, label: 'Exam stuff' }, z: 1 })
    expect(await sheets.pruneEmpty(mark)).toBe(false)
    await db.sheetBlocks.update(mark.id, { updatedAt: Date.now() - 5 * 60_000 })
    await sheets.pruneLeftovers(id)
    expect((await sheets.blocksFor(id)).map((b) => b.id)).toContain(mark.id)
  })

  it('duplicating blocks copies them with new ids, shifted down by their height', async () => {
    const id = await sheets.createSheet()
    const a = await sheets.addBlock({ sheetId: id, x: 30, y: 2, w: 10, h: 3, kind: 'text', data: { doc: para('a') }, z: 4 })
    const [copy] = await sheets.duplicateBlocks([a])
    expect(copy.id).not.toBe(a.id)
    expect(copy).toMatchObject({ sheetId: id, x: 30, y: 6, w: 10, h: 3, data: { doc: para('a') } })
    expect(copy.z).toBeGreaterThan(a.z)
  })

  it('opening a page is not an edit', async () => {
    const id = await sheets.createSheet()
    await db.sheets.update(id, { updatedAt: 1000 })
    await sheets.markOpened(id)
    const s = await sheets.getSheet(id)
    expect(s?.updatedAt).toBe(1000)
    expect(s?.lastOpenedAt).toBeGreaterThan(1000)
  })

  it('moves many blocks in one write', async () => {
    const id = await sheets.createSheet()
    const a = await sheets.addBlock({ sheetId: id, x: 30, y: 2, w: 10, h: 1, kind: 'text', data: { doc: para('a') }, z: 1 })
    const b = await sheets.addBlock({ sheetId: id, x: 30, y: 6, w: 10, h: 1, kind: 'text', data: { doc: para('b') }, z: 2 })
    await sheets.updateBlocks([{ id: a.id, patch: { x: 31, y: 4 } }, { id: b.id, patch: { x: 31, y: 8 } }])
    const got = Object.fromEntries((await sheets.blocksFor(id)).map((x) => [x.id, [x.x, x.y]]))
    expect(got[a.id]).toEqual([31, 4])
    expect(got[b.id]).toEqual([31, 8])
  })
})
