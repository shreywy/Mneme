import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { NormalizedDeck } from '../deck-format/types'
import type { NormalizedNotes } from '../notes-format/types'
import { db } from './db'
import * as notes from './notes'
import * as repo from './repo'

const page = (over: Partial<NormalizedNotes> = {}): NormalizedNotes => ({
  title: 'Chapter 2', course: 'ACC100', unit: 'Chapter 2', topics: [], blocks: [{ type: 'paragraph', text: 'x' }], ...over,
})
const deck: NormalizedDeck = { title: 'Chapter 2', course: 'ACC100', sources: [], topics: [{ id: 'a', name: 'A' }], items: [{ kind: 'term', key: 't', topic: 'a', term: 'T', definition: 'D', aliases: [] }] }

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

describe('notes repo', () => {
  it('imports a page into the course folder with its unit label', async () => {
    const { noteId } = await notes.importNotes(page())
    const n = await notes.getNote(noteId)
    expect(n?.unit).toBe('Chapter 2')
    const f = await db.folders.get(n!.folderId!)
    expect(f?.name).toBe('ACC100')
  })

  it('imports a companion deck and links it', async () => {
    const { noteId, deckId } = await notes.importNotes(page(), deck)
    expect(deckId).toBeTruthy()
    expect((await notes.decksForNote(noteId)).map((d) => d.id)).toEqual([deckId])
    expect((await notes.notesForDeck(deckId!)).map((n) => n.id)).toEqual([noteId])
  })

  it('links one deck to many pages and one page to many decks', async () => {
    const a = (await notes.importNotes(page({ title: 'Ch 1' }))).noteId
    const b = (await notes.importNotes(page({ title: 'Ch 2' }))).noteId
    const d1 = (await repo.importDeck({ ...deck, title: 'Review 1-3' })).deckId
    const d2 = (await repo.importDeck({ ...deck, title: 'Ch 2 drill' })).deckId
    await notes.link(a, d1); await notes.link(b, d1); await notes.link(b, d2)
    await notes.link(b, d2) // duplicate is a no-op
    expect((await notes.notesForDeck(d1)).length).toBe(2)
    expect((await notes.decksForNote(b)).length).toBe(2)
    await notes.unlink(b, d1)
    expect((await notes.notesForDeck(d1)).map((n) => n.id)).toEqual([a])
  })

  it('re-importing a page with the same title replaces its content', async () => {
    const { noteId } = await notes.importNotes(page())
    const again = await notes.importNotes(page({ blocks: [{ type: 'paragraph', text: 'new' }] }))
    expect(again.noteId).toBe(noteId)
    const n = await notes.getNote(noteId)
    expect(n?.blocks[0].type === 'paragraph' && n.blocks[0].text).toBe('new')
  })

  it('deleting a page removes its links but not the deck', async () => {
    const { noteId, deckId } = await notes.importNotes(page(), deck)
    await notes.deleteNote(noteId)
    expect(await notes.getNote(noteId)).toBeUndefined()
    expect(await repo.getDeck(deckId!)).toBeTruthy()
    expect(await db.links.count()).toBe(0)
  })

  it('deleting a deck removes its links', async () => {
    const { deckId } = await notes.importNotes(page(), deck)
    await repo.deleteDeck(deckId!)
    expect(await db.links.count()).toBe(0)
  })
})
