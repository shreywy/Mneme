import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { Rating } from 'ts-fsrs'
import { db } from '../data/db'
import * as repo from '../data/repo'
import * as sheets from '../data/sheets'
import * as ink from '../data/ink'
import { installHooks, markAll, pendingCount, pull, push, resetSyncState, type Remote, type RemoteRow } from './engine'

/** In-memory stand-in for Supabase: one map per table, with server-assigned timestamps. */
function fakeRemote() {
  const tables = new Map<string, Map<string, RemoteRow>>()
  let clock = 1_000
  const t = (name: string) => { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name)! }
  const remote: Remote = {
    async upsert(table, rows) {
      for (const r of rows) t(table).set(r.id, { ...r, doc: JSON.parse(JSON.stringify(r.doc)), updated_at: new Date(++clock).toISOString() })
    },
    async pullSince(table, since, limit) {
      return [...t(table).values()].filter((r) => r.updated_at > since).sort((a, b) => a.updated_at.localeCompare(b.updated_at)).slice(0, limit)
    },
  }
  return { remote, t, write: (table: string, id: string, doc: unknown, deleted = false) => t(table).set(id, { id, doc, deleted, updated_at: new Date(++clock).toISOString() }) }
}

installHooks()
beforeEach(async () => {
  await Promise.all(db.tables.map((tb) => tb.clear()))
  resetSyncState()
})

const deck = { title: 'D', course: 'C', sources: [], topics: [{ id: 'a', name: 'A' }], items: [{ kind: 'term' as const, key: 't', topic: 'a', term: 'T', definition: 'X', aliases: [] }] }

describe('sync engine', () => {
  it('pushes local changes and clears them from the queue', async () => {
    const f = fakeRemote()
    const { deckId } = await repo.importDeck(deck)
    expect(pendingCount()).toBeGreaterThan(0)
    await push(f.remote)
    expect(pendingCount()).toBe(0)
    expect(f.t('decks').get(deckId)?.doc).toMatchObject({ title: 'D' })
    expect(f.t('items').get(`${deckId}|t`)?.deleted).toBe(false)
    expect(f.t('folders').size).toBe(1)
  })

  it('sends a tombstone when something is deleted locally', async () => {
    const f = fakeRemote()
    const { deckId } = await repo.importDeck(deck)
    await push(f.remote)
    await repo.deleteDeck(deckId)
    await push(f.remote)
    expect(f.t('decks').get(deckId)?.deleted).toBe(true)
    expect(f.t('items').get(`${deckId}|t`)?.deleted).toBe(true)
  })

  it('applies remote rows locally without echoing them back', async () => {
    const f = fakeRemote()
    f.write('decks', 'remote-deck', { id: 'remote-deck', folderId: null, title: 'From phone', sources: [], topics: [], termCount: 0, questionCount: 0, createdAt: 1, updatedAt: 1 })
    await pull(f.remote)
    expect((await repo.getDeck('remote-deck'))?.title).toBe('From phone')
    expect(pendingCount()).toBe(0)
  })

  it('applies remote deletions', async () => {
    const f = fakeRemote()
    const { deckId } = await repo.importDeck(deck)
    await push(f.remote)
    f.write('decks', deckId, {}, true)
    await pull(f.remote)
    expect(await repo.getDeck(deckId)).toBeUndefined()
  })

  it('does not overwrite a local change that has not been pushed yet', async () => {
    const f = fakeRemote()
    const { deckId } = await repo.importDeck(deck)
    await push(f.remote)
    await repo.renameDeck(deckId, 'Local edit')
    f.write('decks', deckId, { ...(await repo.getDeck(deckId)), title: 'Older remote' })
    await pull(f.remote)
    expect((await repo.getDeck(deckId))?.title).toBe('Local edit')
  })

  it('syncs reviews by a global id, so two devices never duplicate them', async () => {
    const f = fakeRemote()
    const { deckId } = await repo.importDeck(deck)
    await repo.recordAnswer({ deckId, key: 't', correct: true, ms: 800, mode: 'learn', rating: Rating.Good })
    await push(f.remote)
    const [remoteReview] = [...f.t('reviews').values()]
    expect(remoteReview.id).toMatch(/[0-9a-f-]{36}/)
    // Another device wrote a review too.
    f.write('reviews', 'other-device-review', { deckId, key: 't', correct: false, rating: 1, ms: 900, mode: 'learn', at: 5, syncId: 'other-device-review', id: 99 })
    await pull(f.remote)
    await pull(f.remote)
    expect(await db.reviews.count()).toBe(2)
    expect(pendingCount()).toBe(0)
  })

  it('progress dates survive the round trip as real Dates', async () => {
    const f = fakeRemote()
    const { deckId } = await repo.importDeck(deck)
    await repo.recordAnswer({ deckId, key: 't', correct: true, ms: 800, mode: 'learn', rating: Rating.Good })
    await push(f.remote)
    await db.cards.clear()
    resetSyncState()
    await pull(f.remote)
    const st = (await repo.getCardStates(deckId)).get('t')
    expect(st?.card.due instanceof Date).toBe(true)
  })

  it('sends deletions first, so a full account can still free space', async () => {
    const f = fakeRemote()
    const { deckId } = await repo.importDeck(deck)
    await push(f.remote)
    // The server is full: it takes tombstones but refuses anything that adds data.
    const full: Remote = {
      ...f.remote,
      async upsert(table, rows) {
        if (rows.some((r) => !r.deleted)) throw new Error('storage_full')
        return f.remote.upsert(table, rows)
      },
    }
    await repo.importDeck({ ...deck, title: 'New' })
    await repo.deleteDeck(deckId)
    await expect(push(full)).rejects.toThrow('storage_full')
    expect(f.t('decks').get(deckId)?.deleted).toBe(true)
    expect(f.t('items').get(`${deckId}|t`)?.deleted).toBe(true)
    expect(pendingCount()).toBeGreaterThan(0)
  })

  it('syncs pages and each of their blocks as separate rows', async () => {
    const f = fakeRemote()
    const id = await sheets.createSheet()
    const side = await sheets.addBlock({ sheetId: id, x: 30, y: 2, w: 10, h: 1, kind: 'text', data: { doc: { type: 'doc' } }, z: 0 })
    await push(f.remote)
    expect(f.t('sheets').get(id)?.doc).toMatchObject({ title: 'Untitled page' })
    expect(f.t('sheet_blocks').size).toBe(2)
    // Another device moves the side block; this one edits the main block. Both survive.
    f.write('sheet_blocks', side.id, { ...side, x: 40 })
    const [main] = (await sheets.blocksFor(id)).filter((b) => b.role === 'main')
    await sheets.updateBlock(main.id, { h: 3 })
    await pull(f.remote)
    await push(f.remote)
    const local = await sheets.blocksFor(id)
    expect(local.find((b) => b.id === side.id)?.x).toBe(40)
    expect((f.t('sheet_blocks').get(main.id)?.doc as { h: number }).h).toBe(3)
    await sheets.deleteSheet(id)
    await push(f.remote)
    expect(f.t('sheets').get(id)?.deleted).toBe(true)
    expect([...f.t('sheet_blocks').values()].every((r) => r.deleted)).toBe(true)
  })

  it('markAll queues every local row for the first upload', async () => {
    const f = fakeRemote()
    await repo.importDeck(deck)
    resetSyncState()
    expect(pendingCount()).toBe(0)
    await markAll()
    await push(f.remote)
    expect(f.t('decks').size).toBe(1)
    expect(f.t('items').size).toBe(1)
  })

  it('syncs ink one stroke at a time', async () => {
    const f = fakeRemote()
    const id = await sheets.createSheet()
    const s = await ink.addStroke({ sheetId: id, tool: 'pen', color: 'ink', size: 3, pts: [4, 4, 32, 1, 0, 0] })
    await push(f.remote)
    expect(f.t('sheet_ink').get(s.id)?.doc).toMatchObject({ sheetId: id, tool: 'pen' })
    await sheets.deleteSheet(id)
    await push(f.remote)
    expect(f.t('sheet_ink').get(s.id)?.deleted).toBe(true)
  })

  it('keeps syncing everything else when the server has no table for something yet', async () => {
    const f = fakeRemote()
    const missing = Object.assign(new Error('relation does not exist'), { code: 'PGRST205' })
    const remote: Remote = {
      upsert: async (table, rows) => { if (table === 'sheet_ink') throw missing; return f.remote.upsert(table, rows) },
      pullSince: async (table, since, limit) => { if (table === 'sheet_ink') throw missing; return f.remote.pullSince(table, since, limit) },
    }
    const id = await sheets.createSheet()
    await ink.addStroke({ sheetId: id, tool: 'pen', color: 'ink', size: 3, pts: [4, 4, 32] })
    await push(remote)
    await pull(remote)
    expect(f.t('sheets').size).toBe(1)
    expect(pendingCount()).toBe(1) // the stroke waits for the table
  })
})
