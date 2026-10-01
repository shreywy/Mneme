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

describe('units', () => {
  it('sorts unit labels in natural order, unlabelled last', () => {
    const labels = ['Chapter 10', undefined, 'Chapter 2', 'Week 1', 'chapter 3']
    expect([...labels].sort(notes.compareUnits)).toEqual(['Chapter 2', 'chapter 3', 'Chapter 10', 'Week 1', undefined])
  })

  it('import can choose the folder and unit, and the bundled deck gets the same', async () => {
    const folder = await repo.createFolder('My course')
    const { noteId, deckId } = await notes.importNotes(page({ unit: 'Ch 2' }), deck, { folderId: folder, unit: 'Chapter 4' })
    const n = await notes.getNote(noteId)
    const d = await repo.getDeck(deckId!)
    expect([n?.folderId, n?.unit]).toEqual([folder, 'Chapter 4'])
    expect([d?.folderId, d?.unit]).toEqual([folder, 'Chapter 4'])
  })

  it('import can skip linking the bundled deck', async () => {
    const { deckId } = await notes.importNotes(page(), deck, { link: false })
    expect(deckId).toBeTruthy()
    expect(await db.links.count()).toBe(0)
  })
})

describe('reading progress', () => {
  it('counts sections read, once each', async () => {
    const blocks = [
      { type: 'quickref', blocks: [] },
      { type: 'section', title: 'A', open: true, blocks: [] },
      { type: 'section', title: 'B', open: false, blocks: [] },
      { type: 'section', title: 'C', open: false, blocks: [] },
    ] as NormalizedNotes['blocks']
    const { noteId } = await notes.importNotes(page({ blocks }))
    await notes.markRead(noteId, 1)
    await notes.markRead(noteId, 1)
    await notes.markRead(noteId, 3)
    const n = (await notes.getNote(noteId))!
    expect(notes.readingProgress(n)).toEqual({ read: 2, total: 3 })
  })

  it('a page with no sections counts as one', async () => {
    const { noteId } = await notes.importNotes(page())
    const n = (await notes.getNote(noteId))!
    expect(notes.readingProgress(n)).toEqual({ read: 0, total: 1 })
    await notes.markRead(noteId, 0)
    expect(notes.readingProgress((await notes.getNote(noteId))!)).toEqual({ read: 1, total: 1 })
  })
})

describe('library listing', () => {
  it('lists pages, hiding archived ones and those in archived folders', async () => {
    const f = await repo.createFolder('Old')
    const a = (await notes.importNotes(page({ title: 'Keep' }))).noteId
    const b = (await notes.importNotes(page({ title: 'Archived' }))).noteId
    const c = (await notes.importNotes(page({ title: 'In old folder' }))).noteId
    await notes.updateNote(c, { folderId: f })
    await notes.setNoteArchived(b, true)
    await repo.setArchived('folder', f, true)
    expect((await notes.listNotes()).map((n) => n.id)).toEqual([a])
    await notes.setNoteArchived(b, false)
    expect((await notes.listNotes()).map((n) => n.id).sort()).toEqual([a, b].sort())
  })
})

describe('questions on a page', () => {
  it('finds the linked deck that holds the same question', async () => {
    const q = { kind: 'question', key: 'q1', topic: 'a', qtype: 'true_false', prompt: 'P?', answer: true, explanation: '', difficulty: 1 } as unknown as NormalizedDeck['items'][number]
    const { noteId } = await notes.importNotes(page())
    expect(await notes.deckForQuestion(noteId, 'q1')).toBeNull()
    const other = (await repo.importDeck({ ...deck, title: 'Other' })).deckId
    await notes.link(noteId, other)
    expect(await notes.deckForQuestion(noteId, 'q1')).toBeNull()
    const withQ = (await repo.importDeck({ ...deck, title: 'Has it', items: [...deck.items, q] })).deckId
    await notes.link(noteId, withQ)
    expect(await notes.deckForQuestion(noteId, 'q1')).toBe(withQ)
  })
})

describe('marks', () => {
  it('adds, edits and removes highlights, annotations and bookmarks', async () => {
    const { noteId } = await notes.importNotes(page())
    const anchor = { quote: 'x', prefix: '', suffix: '', offset: 0 }
    const h = await notes.addMark({ noteId, kind: 'highlight', block: 0, anchor, color: 'yellow' })
    const a = await notes.addMark({ noteId, kind: 'note', block: 0, anchor, text: 'Ask about this' })
    await notes.addMark({ noteId, kind: 'bookmark', block: 0 })
    expect((await notes.marksFor(noteId)).map((m) => m.kind).sort()).toEqual(['bookmark', 'highlight', 'note'])
    await notes.updateMark(a, { text: 'Asked, it was on the exam' })
    expect((await notes.marksFor(noteId)).find((m) => m.id === a)?.text).toBe('Asked, it was on the exam')
    await notes.deleteMark(h)
    expect((await notes.marksFor(noteId)).length).toBe(2)
  })
  it('deleting a page removes its marks', async () => {
    const { noteId } = await notes.importNotes(page())
    await notes.addMark({ noteId, kind: 'bookmark', block: 0 })
    await notes.deleteNote(noteId)
    expect(await db.marks.count()).toBe(0)
  })
})

describe('plain text of a page', () => {
  it('collects the words from every block, but not block types', () => {
    const blocks = [
      { type: 'section', title: 'Demand', open: true, blocks: [{ type: 'paragraph', text: 'Buyers want less at higher prices.' }, { type: 'callout', tone: 'exam', text: 'Shifts vs movements' }] },
      { type: 'keyterms', items: [{ term: 'Elasticity', definition: 'How much quantity responds' }] },
    ] as NormalizedNotes['blocks']
    const t = notes.plainText(blocks)
    for (const w of ['Demand', 'higher prices', 'Shifts vs movements', 'Elasticity', 'quantity responds']) expect(t).toContain(w)
    expect(t).not.toMatch(/\bsection\b|\bcallout\b|\bexam\b/)
  })
})

describe('notes in parts (one file per chapter)', () => {
  const part = (index: number, of: number, text: string): NormalizedNotes => ({
    title: 'Chapters 1 to 3', course: 'ACC100', topics: [], part: { index, of },
    blocks: [{ type: 'part', title: `Chapter ${index}` }, { type: 'section', title: `S${index}`, open: true, blocks: [{ type: 'paragraph', text }] }],
  })
  const titles = (n: { blocks: NormalizedNotes['blocks'] }) => n.blocks.map((b) => (b.type === 'part' ? `#${b.title}` : b.type === 'section' ? b.title : b.type))

  it('later parts are added to the same page, in order', async () => {
    const { noteId } = await notes.importNotes(part(1, 3, 'one'))
    await notes.importNotes(part(3, 3, 'three'))
    const again = await notes.importNotes(part(2, 3, 'two'))
    expect(again.noteId).toBe(noteId)
    expect(titles((await notes.getNote(noteId))!)).toEqual(['#Chapter 1', 'S1', '#Chapter 2', 'S2', '#Chapter 3', 'S3'])
  })

  it('re-importing a part replaces only that part, and keeps reading ticks on the right sections', async () => {
    const { noteId } = await notes.importNotes(part(1, 2, 'one'))
    await notes.importNotes(part(2, 2, 'two'))
    await notes.markRead(noteId, 3) // S2
    await notes.importNotes(part(1, 2, 'one, fixed'))
    const n = (await notes.getNote(noteId))!
    expect(titles(n)).toEqual(['#Chapter 1', 'S1', '#Chapter 2', 'S2'])
    const s1 = n.blocks[1]
    expect(s1.type === 'section' && s1.blocks[0].type === 'paragraph' && s1.blocks[0].text).toBe('one, fixed')
    expect(n.read).toEqual([3])
  })
})

describe('chapter summaries in parts', () => {
  it('each part keeps its own summary on its divider; the page summary is not overwritten', async () => {
    const p = (index: number, summary: string): NormalizedNotes => ({ title: 'Review', topics: [], summary, part: { index, of: 2 }, blocks: [{ type: 'part', title: `Chapter ${index}` }, { type: 'paragraph', text: 'x' }] })
    const { noteId } = await notes.importNotes(p(1, 'About chapter one'))
    await notes.importNotes(p(2, 'About chapter two'))
    const n = (await notes.getNote(noteId))!
    const parts = n.blocks.filter((b) => b.type === 'part')
    expect(parts.map((b) => b.type === 'part' && b.summary)).toEqual(['About chapter one', 'About chapter two'])
    expect(n.summary).toBeUndefined()
  })
})
