import type { NormalizedDeck } from '../deck-format/types'
import type { NormalizedNotes } from '../notes-format/types'
import { db, type DeckRow, type NoteRow } from './db'
import { folderForCourse, importDeck } from './repo'

/** Import a notes page (and its companion deck, linked automatically). Same title in the same folder replaces the page. */
export async function importNotes(n: NormalizedNotes, deck?: NormalizedDeck): Promise<{ noteId: string; deckId?: string; replaced: boolean }> {
  const folderId = await folderForCourse(n.course)
  const existing = (await db.notes.toArray()).find((x) => x.title.toLowerCase() === n.title.toLowerCase() && x.folderId === folderId)
  const now = Date.now()
  const id = existing?.id ?? crypto.randomUUID()
  const row: NoteRow = {
    id, folderId, title: n.title,
    ...(n.course ? { course: n.course } : {}), ...(n.unit ? { unit: n.unit } : {}), ...(n.summary ? { summary: n.summary } : {}),
    topics: n.topics, blocks: n.blocks,
    position: existing?.position ?? (await db.notes.count()),
    createdAt: existing?.createdAt ?? now, updatedAt: now,
    ...(existing?.lastOpenedAt ? { lastOpenedAt: existing.lastOpenedAt } : {}),
  }
  await db.notes.put(row)
  let deckId: string | undefined
  if (deck) {
    deckId = (await importDeck({ ...deck, course: deck.course ?? n.course })).deckId
    await link(id, deckId)
  }
  return { noteId: id, ...(deckId ? { deckId } : {}), replaced: !!existing }
}

export const getNote = (id: string) => db.notes.get(id)

export async function link(noteId: string, deckId: string) {
  await db.links.put({ noteId, deckId, createdAt: Date.now() })
}
export async function unlink(noteId: string, deckId: string) {
  await db.links.delete([noteId, deckId])
}

export async function decksForNote(noteId: string): Promise<DeckRow[]> {
  const ids = (await db.links.where('noteId').equals(noteId).toArray()).map((l) => l.deckId)
  return (await db.decks.bulkGet(ids)).filter((d): d is DeckRow => !!d)
}
export async function notesForDeck(deckId: string): Promise<NoteRow[]> {
  const ids = (await db.links.where('deckId').equals(deckId).toArray()).map((l) => l.noteId)
  return (await db.notes.bulkGet(ids)).filter((n): n is NoteRow => !!n)
}

export async function deleteNote(noteId: string) {
  await db.transaction('rw', db.notes, db.links, async () => {
    await db.links.where('noteId').equals(noteId).delete()
    await db.notes.delete(noteId)
  })
}

export async function updateNote(noteId: string, patch: Partial<Pick<NoteRow, 'title' | 'unit' | 'folderId' | 'position' | 'lastOpenedAt'>>) {
  // get+put rather than update(): Dexie's update typing recurses on the nested Block type.
  const n = await db.notes.get(noteId)
  if (n) await db.notes.put({ ...n, ...patch })
}
