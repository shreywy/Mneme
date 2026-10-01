import type { NormalizedDeck } from '../deck-format/types'
import type { NormalizedNotes } from '../notes-format/types'
import { db, type DeckRow, type NoteMark, type NoteRow } from './db'
import { folderForCourse, hiddenFolderIds, importDeck } from './repo'

export type ImportOptions = {
  /** Put the page (and its deck) here instead of the course's folder. */
  folderId?: string | null
  /** Unit label for the page and its deck; defaults to the file's. */
  unit?: string
  /** Link the bundled deck to the page (default true). */
  link?: boolean
}

/** Import a notes page (and its companion deck, linked unless asked not to). Same title in the same folder replaces the page. */
export async function importNotes(n: NormalizedNotes, deck?: NormalizedDeck, opts: ImportOptions = {}): Promise<{ noteId: string; deckId?: string; replaced: boolean }> {
  const folderId = opts.folderId !== undefined ? opts.folderId : await folderForCourse(n.course)
  const unit = (opts.unit ?? n.unit)?.trim() || undefined
  const existing = (await db.notes.toArray()).find((x) => x.title.toLowerCase() === n.title.toLowerCase() && x.folderId === folderId)
  const now = Date.now()
  const id = existing?.id ?? crypto.randomUUID()
  const row: NoteRow = {
    id, folderId, title: n.title,
    ...(n.course ? { course: n.course } : {}), ...(unit ? { unit } : {}), ...(n.summary ? { summary: n.summary } : {}),
    topics: n.topics, blocks: n.blocks,
    position: existing?.position ?? (await db.notes.count()),
    createdAt: existing?.createdAt ?? now, updatedAt: now,
    ...(existing?.lastOpenedAt ? { lastOpenedAt: existing.lastOpenedAt } : {}),
    ...(existing?.read ? { read: existing.read.filter((i) => i < n.blocks.length) } : {}),
  }
  await db.notes.put(row)
  let deckId: string | undefined
  if (deck) {
    deckId = (await importDeck({ ...deck, course: deck.course ?? n.course })).deckId
    const d = await db.decks.get(deckId)
    if (d) await db.decks.put({ ...d, folderId, ...(unit ? { unit } : {}) })
    if (opts.link !== false) await link(id, deckId)
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
  await db.transaction('rw', db.notes, db.links, db.marks, async () => {
    await db.links.where('noteId').equals(noteId).delete()
    await db.marks.where('noteId').equals(noteId).delete()
    await db.notes.delete(noteId)
  })
}

export async function updateNote(noteId: string, patch: Partial<Pick<NoteRow, 'title' | 'unit' | 'folderId' | 'position' | 'lastOpenedAt' | 'read' | 'archived' | 'archivedAt'>>) {
  // get+put rather than update(): Dexie's update typing recurses on the nested Block type.
  const n = await db.notes.get(noteId)
  if (n) await db.notes.put({ ...n, ...patch })
}

/** Natural order for unit labels ("Chapter 2" before "Chapter 10"), ignoring case; pages with no unit go last. */
export function compareUnits(a: string | undefined, b: string | undefined): number {
  if (!a) return b ? 1 : 0
  if (!b) return -1
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/** Remember that a section (its index in `blocks`) has been read. */
export async function markRead(noteId: string, index: number) {
  const n = await db.notes.get(noteId)
  if (!n || n.read?.includes(index)) return
  await db.notes.put({ ...n, read: [...(n.read ?? []), index].sort((x, y) => x - y) })
}

/** Sections read out of sections in the page. A page with no sections counts as one. */
export function readingProgress(n: Pick<NoteRow, 'blocks' | 'read'>): { read: number; total: number } {
  const sections = n.blocks.flatMap((b, i) => (b.type === 'section' ? [i] : []))
  if (!sections.length) return { read: n.read?.includes(0) ? 1 : 0, total: 1 }
  return { read: sections.filter((i) => n.read?.includes(i)).length, total: sections.length }
}

export async function setNoteArchived(noteId: string, archived: boolean) {
  await updateNote(noteId, archived ? { archived: true, archivedAt: Date.now() } : { archived: false })
}

/** Every page not archived (an archived folder hides the pages inside it), most recently opened first. */
export async function listNotes(): Promise<NoteRow[]> {
  const [folders, all] = await Promise.all([db.folders.toArray(), db.notes.toArray()])
  const hidden = hiddenFolderIds(folders)
  return all
    .filter((n) => !n.archived && !(n.folderId && hidden.has(n.folderId)))
    .sort((a, b) => (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt))
}

/** The linked deck that holds this question, so answering it on the page counts there. */
export async function deckForQuestion(noteId: string, key: string): Promise<string | null> {
  for (const l of await db.links.where('noteId').equals(noteId).toArray()) {
    const item = await db.items.get([l.deckId, key])
    if (item?.kind === 'question') return l.deckId
  }
  return null
}

// ---------- highlights, annotations, bookmarks ----------

export async function addMark(m: Omit<NoteMark, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const now = Date.now()
  const id = crypto.randomUUID()
  await db.marks.put({ ...m, id, createdAt: now, updatedAt: now })
  return id
}
export async function updateMark(id: string, patch: Partial<Pick<NoteMark, 'color' | 'text' | 'anchor' | 'block'>>) {
  const m = await db.marks.get(id)
  if (m) await db.marks.put({ ...m, ...patch, updatedAt: Date.now() })
}
export const deleteMark = (id: string) => db.marks.delete(id)
export const marksFor = (noteId: string) => db.marks.where('noteId').equals(noteId).toArray()

const NOT_TEXT = new Set(['type', 'tone', 'kind', 'qtype', 'key', 'id', 'topic', 'html', 'height', 'open', 'ordered', 'correct'])
/** All the words on a page, for search. */
export function plainText(blocks: unknown): string {
  const out: string[] = []
  const walk = (v: unknown, key?: string) => {
    if (typeof v === 'string') { if (!key || !NOT_TEXT.has(key)) out.push(v); return }
    if (Array.isArray(v)) { v.forEach((x) => walk(x, key)); return }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!NOT_TEXT.has(k)) walk(x, k)
  }
  walk(blocks)
  return out.join(' ')
}
