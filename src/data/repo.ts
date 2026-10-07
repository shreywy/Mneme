import type { Grade } from 'ts-fsrs'
import type { Item, NormalizedDeck } from '../deck-format/types'
import { mergeParts } from '../deck-format/parse'
import { applyAnswer, type CardState } from '../engine/memory'
import { db, type DeckRecord, type DeckRow, type Folder, type ItemRow, type StudyMode, type NoteRow } from './db'
import type { SheetRow } from '../sheets/types'
import { tops } from './trash'

// Guest-mode repository backed by IndexedDB. The Supabase repository (M1) will implement the same functions.

const uid = () => crypto.randomUUID()
const stripRow = ({ deckId: _d, position: _p, ...item }: ItemRow): Item => item as Item

export async function folderForCourse(course: string | undefined): Promise<string | null> {
  if (!course) return null
  const all = await db.folders.toArray()
  const hit = all.find((f) => f.name.toLowerCase() === course.toLowerCase())
  if (hit) return hit.id
  return createFolder(course)
}

export async function createFolder(name: string, parentId: string | null = null): Promise<string> {
  const id = uid()
  const position = await db.folders.count()
  await db.folders.add({ id, name: name.trim() || 'Untitled', parentId, position, createdAt: Date.now() })
  return id
}

export async function renameFolder(id: string, name: string) { await db.folders.update(id, { name: name.trim() || 'Untitled' }) }

/** Delete a folder; its decks, notes, pages and subfolders move up to the folder's parent. */
export async function deleteFolder(id: string) {
  await db.transaction('rw', [db.folders, db.decks, db.notes, db.sheets], async () => {
    const f = await db.folders.get(id)
    const parent = f?.parentId ?? null
    await db.decks.where('folderId').equals(id).modify({ folderId: parent })
    await db.folders.where('parentId').equals(id).modify({ parentId: parent })
    const notes = await db.notes.where('folderId').equals(id).toArray()
    for (const n of notes) await db.notes.put({ ...n, folderId: parent })
    await db.sheets.where('folderId').equals(id).modify({ folderId: parent })
    await db.folders.delete(id)
  })
}

/** Move a folder under another (or to the top level). Refuses to create a cycle. */
export async function moveFolder(id: string, parentId: string | null) {
  const all = await db.folders.toArray()
  for (let p = parentId; p; p = all.find((f) => f.id === p)?.parentId ?? null) {
    if (p === id) throw new Error("A folder can't go inside itself.")
  }
  await db.folders.update(id, { parentId })
}

/** Ids of a folder and everything nested under it. */
export function descendants(folders: Folder[], id: string): Set<string> {
  const out = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) if (f.parentId && out.has(f.parentId) && !out.has(f.id)) { out.add(f.id); grew = true }
  }
  return out
}

export async function setArchived(kind: 'deck' | 'folder', id: string, archived: boolean) {
  const patch = archived ? { archived: true, archivedAt: Date.now() } : { archived: false }
  if (kind === 'deck') await db.decks.update(id, patch)
  else await db.folders.update(id, patch)
}

/** Archived decks and folders, newest first. */
export async function listArchive(): Promise<{ folders: Folder[]; decks: DeckRow[]; notes: NoteRow[]; sheets: SheetRow[]; sheetKids: Record<string, number> }> {
  const [folders, decks, notes, sheets] = await Promise.all([db.folders.toArray(), db.decks.toArray(), db.notes.toArray(), db.sheets.toArray()])
  const by = (a: { archivedAt?: number }, b: { archivedAt?: number }) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0)
  const kept = (x: { archived?: boolean; deletedAt?: number; hidden?: boolean }) => x.archived && !x.deletedAt && !x.hidden
  return { folders: folders.filter((f) => f.archived).sort(by), decks: decks.filter(kept).sort(by), notes: notes.filter(kept).sort(by), ...tops(sheets.filter(kept).sort(by), sheets, 'archivedAt') }
}

/** Folders hidden because they, or a parent, are archived. */
export function hiddenFolderIds(folders: Folder[]): Set<string> {
  const hidden = new Set<string>()
  for (const f of folders) if (f.archived) for (const d of descendants(folders, f.id)) hidden.add(d)
  return hidden
}

export async function importDeck(nd: NormalizedDeck): Promise<{ deckId: string; merged: boolean }> {
  const now = Date.now()
  const existing = (await db.decks.toArray()).find((d) => d.title.toLowerCase() === nd.title.toLowerCase())
  let deckId: string
  let merged = false
  let full: NormalizedDeck = nd
  if (existing) {
    deckId = existing.id
    merged = true
    const prevItems = (await db.items.where('deckId').equals(deckId).sortBy('position')).map(stripRow)
    const prev: NormalizedDeck = { title: existing.title, course: existing.course, description: existing.description, sources: existing.sources, topics: existing.topics, items: prevItems }
    full = mergeParts(prev, nd)
  } else {
    deckId = uid()
  }
  const folderId = existing ? existing.folderId : await folderForCourse(nd.course)
  const row: DeckRow = {
    id: deckId,
    folderId,
    title: existing?.title ?? nd.title,
    ...(full.course ? { course: full.course } : {}),
    ...(full.description ? { description: full.description } : {}),
    sources: full.sources,
    topics: full.topics,
    termCount: full.items.filter((i) => i.kind === 'term').length,
    questionCount: full.items.filter((i) => i.kind === 'question').length,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(existing?.lastStudiedAt ? { lastStudiedAt: existing.lastStudiedAt } : {}),
  }
  await db.transaction('rw', db.decks, db.items, async () => {
    await db.decks.put(row)
    await db.items.where('deckId').equals(deckId).delete()
    await db.items.bulkPut(full.items.map((it, position) => ({ ...it, deckId, position }) as ItemRow))
  })
  return { deckId, merged }
}

/** Everything not archived (an archived folder hides what's inside it). */
export async function listLibrary(): Promise<{ folders: Folder[]; decks: DeckRow[] }> {
  const [folders, decks] = await Promise.all([db.folders.orderBy('position').toArray(), db.decks.toArray()])
  const hidden = hiddenFolderIds(folders)
  const live = decks.filter((d) => !d.archived && !(d.folderId && hidden.has(d.folderId)))
  live.sort((a, b) => (b.lastStudiedAt ?? b.updatedAt) - (a.lastStudiedAt ?? a.updatedAt))
  return { folders: folders.filter((f) => !hidden.has(f.id)), decks: live }
}

export const getDeck = (id: string) => db.decks.get(id)

export async function getItems(deckId: string): Promise<Item[]> {
  return (await db.items.where('deckId').equals(deckId).sortBy('position')).map(stripRow)
}

export async function getCardStates(deckId: string): Promise<Map<string, CardState>> {
  const rows = await db.cards.where('deckId').equals(deckId).toArray()
  return new Map(rows.map((r) => [r.key, r]))
}

export async function recordAnswer(a: { deckId: string; key: string; correct: boolean; ms: number; mode: StudyMode; rating: Grade; now?: Date }): Promise<CardState> {
  const now = a.now ?? new Date()
  return db.transaction('rw', db.cards, db.reviews, db.records, db.decks, async () => {
    const prev = await db.cards.get([a.deckId, a.key])
    const next = applyAnswer(prev, { deckId: a.deckId, key: a.key, correct: a.correct, rating: a.rating, now })
    await db.cards.put(next)
    await db.reviews.add({ deckId: a.deckId, key: a.key, correct: a.correct, rating: a.rating, ms: Math.round(a.ms), mode: a.mode, at: +now })
    const rec = await getDeckRecord(a.deckId)
    await db.records.put({ ...rec, answered: rec.answered + 1, correct: rec.correct + (a.correct ? 1 : 0) })
    await db.decks.update(a.deckId, { lastStudiedAt: +now })
    return next
  })
}

/** Log an answer that shouldn't move the memory model (e.g. Test mode). */
export async function logOnly(a: { deckId: string; key: string; correct: boolean; ms: number; mode: StudyMode }) {
  await db.reviews.add({ ...a, rating: 0, ms: Math.round(a.ms), at: Date.now() })
}

export async function getDeckRecord(deckId: string): Promise<DeckRecord> {
  return (await db.records.get(deckId)) ?? { deckId, bestStreak: 0, sessions: 0, secondsStudied: 0, answered: 0, correct: 0 }
}

export async function bumpDeckRecord(deckId: string, p: { bestStreak?: number; sessions?: number; seconds?: number }) {
  const r = await getDeckRecord(deckId)
  await db.records.put({
    ...r,
    bestStreak: Math.max(r.bestStreak, p.bestStreak ?? 0),
    sessions: r.sessions + (p.sessions ?? 0),
    secondsStudied: r.secondsStudied + Math.round(p.seconds ?? 0),
  })
}

/** Median of the last 60 correct response times, across all decks. 0 when there's no history. */
export async function medianResponseMs(): Promise<number> {
  const recent = await db.reviews.orderBy('at').reverse().filter((r) => r.correct && r.ms > 0).limit(60).toArray()
  if (!recent.length) return 0
  const xs = recent.map((r) => r.ms).sort((a, b) => a - b)
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2)
}

/** Items missed most in a deck, for the Overview tab. */
export async function missedMost(deckId: string, n = 5): Promise<{ key: string; misses: number }[]> {
  const wrong = await db.reviews.where('deckId').equals(deckId).filter((r) => !r.correct && r.mode !== 'test').toArray()
  const counts = new Map<string, number>()
  for (const r of wrong) counts.set(r.key, (counts.get(r.key) ?? 0) + 1)
  return [...counts].map(([key, misses]) => ({ key, misses })).sort((a, b) => b.misses - a.misses).slice(0, n)
}

export async function resetDeckProgress(deckId: string) {
  await db.transaction('rw', db.cards, db.reviews, db.records, async () => {
    await db.cards.where('deckId').equals(deckId).delete()
    await db.reviews.where('deckId').equals(deckId).delete()
    await db.records.delete(deckId)
  })
}

export async function deleteDeck(deckId: string) {
  await db.transaction('rw', [db.decks, db.items, db.cards, db.reviews, db.records, db.links], async () => {
    await db.links.where('deckId').equals(deckId).delete()
    await db.items.where('deckId').equals(deckId).delete()
    await db.cards.where('deckId').equals(deckId).delete()
    await db.reviews.where('deckId').equals(deckId).delete()
    await db.records.delete(deckId)
    await db.decks.delete(deckId)
  })
}

async function recount(deckId: string) {
  const items = await db.items.where('deckId').equals(deckId).toArray()
  await db.decks.update(deckId, {
    termCount: items.filter((i) => i.kind === 'term').length,
    questionCount: items.filter((i) => i.kind === 'question').length,
    updatedAt: Date.now(),
  })
}

/** Add a card, or replace one with the same key (progress is kept). */
export async function saveItem(deckId: string, item: Item) {
  await db.transaction('rw', db.items, db.decks, async () => {
    const existing = await db.items.get([deckId, item.key])
    let position = existing?.position
    if (position === undefined) {
      const all = await db.items.where('deckId').equals(deckId).toArray()
      position = all.reduce((m, i) => Math.max(m, i.position), -1) + 1
    }
    await db.items.put({ ...item, deckId, position } as ItemRow)
    await recount(deckId)
  })
}

export async function deleteItem(deckId: string, key: string) {
  await db.transaction('rw', [db.items, db.cards, db.reviews, db.decks], async () => {
    await db.items.delete([deckId, key])
    await db.cards.delete([deckId, key])
    await db.reviews.where('deckId').equals(deckId).filter((r) => r.key === key).delete()
    await recount(deckId)
  })
}

export async function updateDeckInfo(deckId: string, p: { title?: string; course?: string; description?: string }) {
  const patch: Partial<DeckRow> = { updatedAt: Date.now() }
  if (p.title !== undefined) patch.title = p.title.trim() || 'Untitled deck'
  if (p.course !== undefined) patch.course = p.course.trim()
  if (p.description !== undefined) patch.description = p.description.trim()
  await db.decks.update(deckId, patch)
}

export async function setDeckUnit(deckId: string, unit: string) {
  const d = await db.decks.get(deckId)
  if (d) { const { unit: _old, ...rest } = d; await db.decks.put(unit ? { ...rest, unit } : rest) }
}
export async function moveDeck(deckId: string, folderId: string | null) { await db.decks.update(deckId, { folderId }) }
export async function renameDeck(deckId: string, title: string) { await db.decks.update(deckId, { title: title.trim() || 'Untitled deck' }) }
