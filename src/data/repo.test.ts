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

  it('computes the median response time from recent correct answers', async () => {
    const { deckId } = await repo.importDeck(deck())
    for (const ms of [1000, 3000, 2000]) await repo.recordAnswer({ deckId, key: 'q1', correct: true, ms, mode: 'learn', rating: Rating.Good })
    expect(await repo.medianResponseMs()).toBe(2000)
  })
})
