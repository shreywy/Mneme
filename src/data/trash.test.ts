import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import * as sheets from './sheets'
import * as repo from './repo'
import * as trash from './trash'
import * as sub from './subpages'

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

const DAY = 86_400_000

describe('recently deleted', () => {
  it('a deleted page leaves the library and the archive, and shows under Recently deleted', async () => {
    const id = await sheets.createSheet()
    await trash.trashPage('sheet', id)
    expect(await sheets.listSheets()).toEqual([])
    expect((await repo.listArchive()).sheets).toEqual([])
    expect((await trash.listTrash()).sheets.map((s) => s.id)).toEqual([id])
  })

  it('restoring puts it back where it was, with its blocks', async () => {
    const id = await sheets.createSheet()
    await trash.trashPage('sheet', id)
    await trash.restorePage('sheet', id)
    expect((await sheets.listSheets()).map((s) => s.id)).toEqual([id])
    expect((await trash.listTrash()).sheets).toEqual([])
    expect(await sheets.blocksFor(id)).toHaveLength(1)
  })

  it('anything deleted more than 5 days ago is removed for good; newer ones stay', async () => {
    const old = await sheets.createSheet()
    const recent = await sheets.createSheet()
    await trash.trashPage('sheet', old)
    await trash.trashPage('sheet', recent)
    await db.sheets.update(old, { deletedAt: Date.now() - 6 * DAY })
    expect(await trash.purgeTrash()).toBe(1)
    expect(await sheets.getSheet(old)).toBeUndefined()
    expect(await sheets.blocksFor(old)).toEqual([])
    expect(await sheets.getSheet(recent)).toBeDefined()
  })

  it('works for decks too', async () => {
    const deckId = await db.decks.add({ id: 'd1', title: 'Deck', folderId: null, termCount: 0, questionCount: 0, createdAt: 1, updatedAt: 1 } as never)
    await trash.trashPage('deck', String(deckId))
    expect((await repo.listLibrary()).decks).toEqual([])
    expect((await trash.listTrash()).decks.map((d) => d.id)).toEqual(['d1'])
  })
})

describe('recently deleted with sub-pages', () => {
  const tree = async () => {
    const cps = await sheets.createSheet()
    const ch3 = await sub.createSubPage(cps, await sub.ensureBox(cps))
    const ps3 = await sub.createSubPage(ch3, await sub.ensureBox(ch3))
    return { cps, ch3, ps3 }
  }

  it('deleting a page takes its sub-pages; the bin shows only the top with a count', async () => {
    const { cps } = await tree()
    await trash.trashPage('sheet', cps)
    expect(await sheets.listSheets()).toEqual([])
    const t = await trash.listTrash()
    expect(t.sheets.map((s) => s.id)).toEqual([cps])
    expect(t.sheetKids[cps]).toBe(2)
  })

  it('restoring brings the whole tree back in place', async () => {
    const { cps, ch3, ps3 } = await tree()
    await trash.trashPage('sheet', cps)
    await trash.restorePage('sheet', cps)
    expect((await sheets.listSheets()).map((s) => s.id).sort()).toEqual([cps, ch3, ps3].sort())
    expect((await db.sheets.get(ps3))!.parentId).toBe(ch3)
  })

  it('a sub-page deleted earlier on its own stays deleted when its parent is restored', async () => {
    const { cps, ps3 } = await tree()
    await trash.trashPage('sheet', ps3, true, Date.now() - 1000)
    await trash.trashPage('sheet', cps)
    await trash.restorePage('sheet', cps)
    expect((await db.sheets.get(ps3))!.deletedAt).toBeTypeOf('number')
  })

  it('keeping the sub-pages moves them up before the page goes', async () => {
    const { cps, ch3, ps3 } = await tree()
    await trash.trashPage('sheet', ch3, false)
    expect((await db.sheets.get(ps3))!.parentId).toBe(cps)
    expect((await db.sheets.get(ps3))!.deletedAt).toBeUndefined()
  })

  it('purging removes the sub-pages too', async () => {
    const { cps, ch3, ps3 } = await tree()
    await trash.trashPage('sheet', cps, true, Date.now() - 6 * DAY)
    await trash.purgeTrash()
    expect(await db.sheets.bulkGet([cps, ch3, ps3])).toEqual([undefined, undefined, undefined])
  })
})
