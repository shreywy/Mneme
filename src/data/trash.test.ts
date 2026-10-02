import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import * as sheets from './sheets'
import * as repo from './repo'
import * as trash from './trash'

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
