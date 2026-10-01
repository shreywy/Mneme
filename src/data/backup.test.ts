import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { Rating } from 'ts-fsrs'
import { db } from './db'
import * as repo from './repo'
import { exportBackup, restoreBackup } from './backup'

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

describe('backup', () => {
  it('restores decks, folders and progress exactly', async () => {
    const { deckId } = await repo.importDeck({ title: 'D', course: 'C', sources: [], topics: [{ id: 'a', name: 'A' }], items: [{ kind: 'term', key: 't', topic: 'a', term: 'T', definition: 'X', aliases: [] }] })
    await repo.recordAnswer({ deckId, key: 't', correct: true, ms: 900, mode: 'learn', rating: Rating.Good })
    const file = await exportBackup()
    const json = JSON.parse(JSON.stringify(file)) // what a downloaded file looks like
    await Promise.all(db.tables.map((t) => t.clear()))
    const r = await restoreBackup(json)
    expect(r.decks).toBe(1)
    expect((await repo.getItems(deckId)).length).toBe(1)
    const st = (await repo.getCardStates(deckId)).get('t')
    expect(st?.seen).toBe(1)
    expect(st?.card.due instanceof Date).toBe(true) // dates come back as Dates, so FSRS keeps working
    expect((await repo.listLibrary()).folders.map((f) => f.name)).toEqual(['C'])
  })

  it('rejects a file that is not a Mneme backup', async () => {
    await expect(restoreBackup({ format: 'mneme.deck' })).rejects.toThrow()
  })
})
