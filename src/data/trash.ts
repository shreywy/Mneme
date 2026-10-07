import { db, type DeckRow, type NoteRow } from './db'
import type { SheetRow } from '../sheets/types'
import { deleteDeck } from './repo'
import { deleteNote } from './notes'
import { deleteSheet } from './sheets'
import { forgetPageImages } from './images'
import { liftChildren } from './subpages'
import { subtree } from '../sheets/tree'

// Recently deleted. Deleting a deck, notes page or page hides it straight away (it's archived and marked
// deleted, so every list already leaves it out) and keeps it for a few days in case it was a mistake.
// After that it's removed for good, on whichever device opens the app first.

export const TRASH_DAYS = 5
export type TrashKind = 'deck' | 'note' | 'sheet'

type Mark = { archived: boolean; archivedAt?: number; deletedAt?: number }
type Marked = { archived?: boolean; archivedAt?: number; deletedAt?: number }
/** Sets (or, when left out, removes) the archive and deleted marks on one row. */
const apply = (m: Mark) => (row: Marked) => {
  row.archived = m.archived
  if (m.archivedAt === undefined) delete row.archivedAt; else row.archivedAt = m.archivedAt
  if (m.deletedAt === undefined) delete row.deletedAt; else row.deletedAt = m.deletedAt
}
async function mark(kind: TrashKind, id: string, m: Mark) {
  if (kind === 'deck') await db.decks.where('id').equals(id).modify(apply(m))
  else if (kind === 'note') await db.notes.where('id').equals(id).modify(apply(m))
  else await db.sheets.where('id').equals(id).modify(apply(m))
}

/** A sheet and the sub-pages deleted (or archived) with it: the same stamp, in the same tree. */
export async function sameStamp(id: string, key: 'deletedAt' | 'archivedAt'): Promise<string[]> {
  const all = await db.sheets.toArray()
  const stamp = all.find((s) => s.id === id)?.[key]
  if (stamp === undefined) return [id]
  return [id, ...subtree(id, all).filter((x) => all.find((s) => s.id === x)?.[key] === stamp)]
}

/** Tree tops among `rows` (their parent isn't in the same batch), with how many sub-pages went with each. */
export function tops(rows: SheetRow[], all: SheetRow[], key: 'deletedAt' | 'archivedAt'): { sheets: SheetRow[]; sheetKids: Record<string, number> } {
  const byId = new Map(all.map((s) => [s.id, s]))
  const inTree = (s: SheetRow) => { const p = s.parentId ? byId.get(s.parentId) : undefined; return !!p && p[key] !== undefined && p[key] === s[key] }
  const top = rows.filter((s) => !inTree(s))
  const sheetKids: Record<string, number> = {}
  for (const t of top) sheetKids[t.id] = subtree(t.id, all).filter((x) => byId.get(x)?.[key] === t[key]).length
  return { sheets: top, sheetKids }
}

/** Into Recently deleted. A page takes its sub-pages along, or (`withKids` false) moves them up first. */
export async function trashPage(kind: TrashKind, id: string, withKids = true, now = Date.now()) {
  if (kind !== 'sheet') return mark(kind, id, { archived: true, archivedAt: now, deletedAt: now })
  if (!withKids) await liftChildren(id)
  const all = await db.sheets.toArray()
  const ids = [id, ...(withKids ? subtree(id, all).filter((x) => !all.find((s) => s.id === x)?.deletedAt) : [])]
  for (const x of ids) await mark('sheet', x, { archived: true, archivedAt: now, deletedAt: now })
}

export async function restorePage(kind: TrashKind, id: string) {
  if (kind !== 'sheet') return mark(kind, id, { archived: false })
  for (const x of await sameStamp(id, 'deletedAt')) await mark('sheet', x, { archived: false })
}

export async function deleteForGood(kind: TrashKind, id: string) {
  if (kind === 'deck') await deleteDeck(id)
  else if (kind === 'note') await deleteNote(id)
  else {
    for (const x of await sameStamp(id, 'deletedAt')) {
      await forgetPageImages(x, (await db.sheetBlocks.where('sheetId').equals(x).toArray()).map((b) => b.data.doc))
      await deleteSheet(x)
    }
  }
}

/** What's waiting in Recently deleted, newest first. */
export async function listTrash(): Promise<{ decks: DeckRow[]; notes: NoteRow[]; sheets: SheetRow[]; sheetKids: Record<string, number> }> {
  const [decks, notes, sheets] = await Promise.all([db.decks.toArray(), db.notes.toArray(), db.sheets.toArray()])
  const by = (a: { deletedAt?: number }, b: { deletedAt?: number }) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)
  return { decks: decks.filter((d) => d.deletedAt).sort(by), notes: notes.filter((n) => n.deletedAt).sort(by), ...tops(sheets.filter((s) => s.deletedAt).sort(by), sheets, 'deletedAt') }
}

/** Removes everything deleted more than TRASH_DAYS ago. Returns how many went. */
export async function purgeTrash(now = Date.now()): Promise<number> {
  const cutoff = now - TRASH_DAYS * 86_400_000
  const t = await listTrash()
  const old = [
    ...t.decks.filter((d) => d.deletedAt! < cutoff).map((d) => ['deck', d.id] as const),
    ...t.notes.filter((n) => n.deletedAt! < cutoff).map((n) => ['note', n.id] as const),
    ...t.sheets.filter((s) => s.deletedAt! < cutoff).map((s) => ['sheet', s.id] as const),
  ]
  for (const [kind, id] of old) await deleteForGood(kind, id)
  return old.length
}

/** Days left before something deleted at `deletedAt` goes for good (at least 0). */
export const daysLeft = (deletedAt: number, now = Date.now()) => Math.max(0, Math.ceil((deletedAt + TRASH_DAYS * 86_400_000 - now) / 86_400_000))
