import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { placePage } from './arrange'
import * as repo from './repo'
import * as notes from './notes'

const deck = (title: string) => repo.importDeck({ title, sources: [], topics: [{ id: 'a', name: 'A' }], items: [{ kind: 'term', key: 't', topic: 'a', term: 'T', definition: 'D', aliases: [] }] }).then((r) => r.deckId)

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

describe('placePage', () => {
  it('moves a page into another folder and unit, and saves the order of that group', async () => {
    const f = await repo.createFolder('ACC')
    const a = await deck('A'), b = await deck('B')
    const n = (await notes.importNotes({ title: 'N', topics: [], blocks: [{ type: 'paragraph', text: 'x' }] })).noteId
    await placePage({ kind: 'note', id: n }, { folderId: f, unit: 'Chapter 1' }, [{ kind: 'deck', id: b }, { kind: 'note', id: n }, { kind: 'deck', id: a }])
    const note = await notes.getNote(n)
    expect([note?.folderId, note?.unit, note?.rank]).toEqual([f, 'Chapter 1', 1])
    expect((await repo.getDeck(b))?.rank).toBe(0)
    expect((await repo.getDeck(a))?.rank).toBe(2)
  })
  it('clears the unit when dropped among pages with no unit', async () => {
    const a = await deck('A')
    await repo.setDeckUnit(a, 'Week 1')
    await placePage({ kind: 'deck', id: a }, { folderId: null, unit: null }, [{ kind: 'deck', id: a }])
    expect((await repo.getDeck(a))?.unit).toBeUndefined()
  })
})
