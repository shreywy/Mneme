import { db } from './db'
import { hiddenFolderIds } from './repo'
import { DEFAULT_PAPER, MAIN_BLOCK, type Paper, type SheetBlock, type SheetRow } from '../sheets/types'
import { titleFrom } from '../sheets/order'

// The user's own pages (Text notes). A page is a row in `sheets`; everything on it is a row in
// `sheetBlocks`, so two devices editing different blocks never overwrite each other.

const uid = () => crypto.randomUUID()
const EMPTY_DOC = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }] }

export async function createSheet(opts: { folderId?: string | null; unit?: string; paper?: Paper } = {}): Promise<string> {
  const now = Date.now()
  const id = uid()
  await db.transaction('rw', db.sheets, db.sheetBlocks, async () => {
    await db.sheets.add({ id, folderId: opts.folderId ?? null, title: 'Untitled page', titleAuto: true, paper: opts.paper ?? DEFAULT_PAPER, createdAt: now, updatedAt: now, lastOpenedAt: now, ...(opts.unit ? { unit: opts.unit } : {}) })
    await db.sheetBlocks.add({ id: uid(), sheetId: id, ...MAIN_BLOCK, kind: 'text', role: 'main', data: { doc: EMPTY_DOC }, z: 0, createdAt: now, updatedAt: now })
  })
  return id
}

export const getSheet = (id: string) => db.sheets.get(id)

export async function listSheets(): Promise<SheetRow[]> {
  const [folders, all] = await Promise.all([db.folders.toArray(), db.sheets.toArray()])
  const hidden = hiddenFolderIds(folders)
  return all.filter((s) => !s.archived && !s.hidden && !(s.folderId && hidden.has(s.folderId)))
}

export async function updateSheet(id: string, patch: Partial<Omit<SheetRow, 'id' | 'createdAt'>>) {
  await db.sheets.update(id, { ...patch, updatedAt: Date.now() })
}

/** Notes that the page was opened. Not an edit, so "last changed" stays put. */
export async function markOpened(id: string) {
  await db.sheets.update(id, { lastOpenedAt: Date.now() })
}

export async function setSheetArchived(id: string, archived: boolean) {
  await db.sheets.update(id, archived ? { archived: true, archivedAt: Date.now() } : { archived: false })
}

export async function deleteSheet(id: string) {
  await db.transaction('rw', db.sheets, db.sheetBlocks, async () => {
    // Collection.delete() goes through the sync hooks, so the server gets a tombstone for every block.
    await db.sheetBlocks.where('sheetId').equals(id).delete()
    await db.sheets.delete(id)
  })
}

export const blocksFor = (sheetId: string) => db.sheetBlocks.where('sheetId').equals(sheetId).toArray()

export async function addBlock(b: Omit<SheetBlock, 'id' | 'createdAt' | 'updatedAt'>): Promise<SheetBlock> {
  const now = Date.now()
  const row: SheetBlock = { ...b, id: uid(), createdAt: now, updatedAt: now }
  await db.sheetBlocks.add(row)
  return row
}
export const putBlock = (b: SheetBlock) => db.sheetBlocks.put(b)
export async function updateBlock(id: string, patch: Partial<Omit<SheetBlock, 'id' | 'sheetId' | 'createdAt'>>) {
  await db.sheetBlocks.update(id, { ...patch, updatedAt: Date.now() })
}
export const deleteBlock = (id: string) => db.sheetBlocks.delete(id)

/** Copies of these blocks just below the group, on top of everything else. */
export async function duplicateBlocks(blocks: SheetBlock[]): Promise<SheetBlock[]> {
  if (!blocks.length) return []
  const top = Math.min(...blocks.map((b) => b.y)), bottom = Math.max(...blocks.map((b) => b.y + b.h))
  const z = Math.max(...(await blocksFor(blocks[0].sheetId)).map((b) => b.z))
  const out: SheetBlock[] = []
  for (const [i, b] of blocks.entries()) {
    const { id: _id, createdAt: _c, updatedAt: _u, role: _role, ...rest } = b
    out.push(await addBlock({ ...rest, y: b.y + (bottom - top) + 1, z: z + 1 + i, data: structuredClone(b.data) }))
  }
  return out
}
export const getBlock = (id: string) => db.sheetBlocks.get(id)

/** Saves a block's text. The main block also names the page (its first heading) until the user renames it. */
export async function saveBlockDoc(id: string, doc: unknown) {
  await db.transaction('rw', db.sheets, db.sheetBlocks, async () => {
    const b = await db.sheetBlocks.get(id)
    if (!b) return // deleted meanwhile (here or on another device)
    await db.sheetBlocks.update(id, { data: { doc }, updatedAt: Date.now() })
    if (b.role !== 'main') return
    const s = await db.sheets.get(b.sheetId)
    const title = titleFrom(doc) ?? 'Untitled page'
    if (s?.titleAuto && s.title !== title) await db.sheets.update(s.id, { title, updatedAt: Date.now() })
  })
}

type Node = { type?: string; text?: string; content?: Node[] }
/** True when a TipTap document has no text and no structure beyond empty paragraphs and headings. */
export function isEmptyDoc(doc: unknown): boolean {
  const walk = (n: Node): boolean => {
    if (n.text) return false
    if (n.type && !['doc', 'paragraph', 'heading'].includes(n.type)) return false
    return (n.content ?? []).every(walk)
  }
  return walk((doc ?? {}) as Node)
}

/**
 * Clears empty side blocks left behind (a tab closed while one was open). Only blocks untouched for a
 * minute: a fresh one may be one another device has just made and is about to type in.
 */
export async function pruneLeftovers(sheetId: string) {
  const cutoff = Date.now() - 60_000
  for (const b of await blocksFor(sheetId)) if (b.updatedAt < cutoff) await pruneEmpty(b)
}

/** Removes a block left empty, unless it's the main column. Returns whether it was removed. */
export async function pruneEmpty(b: SheetBlock): Promise<boolean> {
  if (b.kind !== 'text' || b.role === 'main' || !isEmptyDoc(b.data.doc)) return false
  await deleteBlock(b.id)
  return true
}
