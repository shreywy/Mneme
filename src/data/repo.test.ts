import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { Rating } from 'ts-fsrs'
import type { NormalizedDeck } from '../deck-format/types'
import { db } from './db'
import * as repo from './repo'

const deck = (over: Partial<NormalizedDeck> = {}): NormalizedDeck => ({
  title: 'Quiz 1', course: 'ACC100', sources: [], topics: [{ id: 'a', name: 'A' }],
  items: [
    { kind: 'term', key: 't1', topic: 'a', term: 'Asset', definition: 'Owned.', aliases: [] },
    { kind: 'question', key: 'q1', qtype: 'true_false', topic: 'a', prompt: 'P', explanation: 'E', difficulty: 1, answer: true },
  ],
  ...over,
})

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

describe('repo', () => {
  it('imports a deck into a folder named after its course', async () => {
    const { deckId, merged } = await repo.importDeck(deck())
    expect(merged).toBe(false)
    const lib = await repo.listLibrary()
    expect(lib.folders.map((f) => f.name)).toEqual(['ACC100'])
    const d = lib.decks.find((x) => x.id === deckId)!
    expect(d.folderId).toBe(lib.folders[0].id)
    expect(d.termCount).toBe(1)
    expect(d.questionCount).toBe(1)
  })

  it('merges a re-import with the same title and keeps progress for unchanged ids', async () => {
    const { deckId } = await repo.importDeck(deck())
    await repo.recordAnswer({ deckId, key: 't1', correct: true, ms: 2000, mode: 'learn', rating: Rating.Good })
    const again = await repo.importDeck(deck({
      items: [
        { kind: 'term', key: 't1', topic: 'a', term: 'Asset', definition: 'Owned, with future benefit.', aliases: [] },
        { kind: 'term', key: 't2', topic: 'a', term: 'Liability', definition: 'Owed.', aliases: [] },
      ],
    }))
    expect(again).toEqual({ deckId, merged: true })
    const items = await repo.getItems(deckId)
    expect(items.map((i) => i.key).sort()).toEqual(['q1', 't1', 't2'])
    const states = await repo.getCardStates(deckId)
    expect(states.get('t1')?.seen).toBe(1)
  })

  it('records an answer: updates memory state, logs a review, and bumps the deck record', async () => {
    const { deckId } = await repo.importDeck(deck())
    const s = await repo.recordAnswer({ deckId, key: 'q1', correct: false, ms: 5000, mode: 'learn', rating: Rating.Again })
    expect(s.seen).toBe(1)
    expect(s.lastCorrect).toBe(false)
    expect(await db.reviews.where('deckId').equals(deckId).count()).toBe(1)
    expect((await repo.getDeckRecord(deckId)).answered).toBe(1)
  })

  it('resets progress for one deck without touching its items', async () => {
    const { deckId } = await repo.importDeck(deck())
    await repo.recordAnswer({ deckId, key: 'q1', correct: true, ms: 1000, mode: 'learn', rating: Rating.Good })
    await repo.resetDeckProgress(deckId)
    expect((await repo.getCardStates(deckId)).size).toBe(0)
    expect((await repo.getItems(deckId)).length).toBe(2)
    expect((await repo.getDeckRecord(deckId)).answered).toBe(0)
  })

  it('deletes a deck and everything that belongs to it', async () => {
    const { deckId } = await repo.importDeck(deck())
    await repo.recordAnswer({ deckId, key: 'q1', correct: true, ms: 1000, mode: 'learn', rating: Rating.Good })
    await repo.deleteDeck(deckId)
    expect(await repo.getDeck(deckId)).toBeUndefined()
    expect(await db.items.where('deckId').equals(deckId).count()).toBe(0)
    expect(await db.cards.where('deckId').equals(deckId).count()).toBe(0)
  })

  it('edits a card in place and keeps its progress', async () => {
    const { deckId } = await repo.importDeck(deck())
    await repo.recordAnswer({ deckId, key: 't1', correct: true, ms: 1000, mode: 'learn', rating: Rating.Good })
    await repo.saveItem(deckId, { kind: 'term', key: 't1', topic: 'a', term: 'Asset', definition: 'Edited.', aliases: [] })
    const items = await repo.getItems(deckId)
    expect(items.find((i) => i.key === 't1')).toMatchObject({ definition: 'Edited.' })
    expect(items.map((i) => i.key)).toEqual(['t1', 'q1'])
    expect((await repo.getCardStates(deckId)).get('t1')?.seen).toBe(1)
  })

  it('adds a new card at the end and updates the counts', async () => {
    const { deckId } = await repo.importDeck(deck())
    await repo.saveItem(deckId, { kind: 'term', key: 't9', topic: 'a', term: 'Equity', definition: 'Owed to owners.', aliases: [] })
    expect((await repo.getItems(deckId)).map((i) => i.key)).toEqual(['t1', 'q1', 't9'])
    expect((await repo.getDeck(deckId))?.termCount).toBe(2)
  })

  it('deletes a card with its progress and updates the counts', async () => {
    const { deckId } = await repo.importDeck(deck())
    await repo.recordAnswer({ deckId, key: 'q1', correct: true, ms: 1000, mode: 'learn', rating: Rating.Good })
    await repo.deleteItem(deckId, 'q1')
    expect((await repo.getItems(deckId)).map((i) => i.key)).toEqual(['t1'])
    expect((await repo.getCardStates(deckId)).has('q1')).toBe(false)
    expect((await repo.getDeck(deckId))?.questionCount).toBe(0)
  })

  it('updates deck info', async () => {
    const { deckId } = await repo.importDeck(deck())
    await repo.updateDeckInfo(deckId, { title: 'Quiz 1 (final)', description: 'All of it' })
    expect(await repo.getDeck(deckId)).toMatchObject({ title: 'Quiz 1 (final)', description: 'All of it' })
  })

  it('archives and restores a deck, and leaves archived decks out of the library list', async () => {
    const { deckId } = await repo.importDeck(deck())
    await repo.setArchived('deck', deckId, true)
    expect((await repo.listLibrary()).decks.map((d) => d.id)).not.toContain(deckId)
    expect((await repo.listArchive()).decks.map((d) => d.id)).toContain(deckId)
    await repo.setArchived('deck', deckId, false)
    expect((await repo.listLibrary()).decks.map((d) => d.id)).toContain(deckId)
  })

  it('nests folders and refuses to move a folder inside itself', async () => {
    const parent = await repo.createFolder('ACC100')
    const child = await repo.createFolder('Chapter 1', parent)
    expect((await db.folders.get(child))?.parentId).toBe(parent)
    await expect(repo.moveFolder(parent, child)).rejects.toThrow()
    const other = await repo.createFolder('Other')
    await repo.moveFolder(child, other)
    expect((await db.folders.get(child))?.parentId).toBe(other)
  })

  it('deleting a folder moves its decks and subfolders up a level', async () => {
    const parent = await repo.createFolder('Course')
    const child = await repo.createFolder('Unit', parent)
    const { deckId } = await repo.importDeck(deck({ course: undefined }))
    await repo.moveDeck(deckId, child)
    await repo.deleteFolder(child)
    expect((await repo.getDeck(deckId))?.folderId).toBe(parent)
  })

  it('computes the median response time from recent correct answers', async () => {
    const { deckId } = await repo.importDeck(deck())
    for (const ms of [1000, 3000, 2000]) await repo.recordAnswer({ deckId, key: 'q1', correct: true, ms, mode: 'learn', rating: Rating.Good })
    expect(await repo.medianResponseMs()).toBe(2000)
  })
})
