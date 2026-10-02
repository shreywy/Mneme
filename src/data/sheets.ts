import { db } from './db'
import { hiddenFolderIds } from './repo'
import { DEFAULT_PAPER, MAIN_BLOCK, type Paper, type SheetBlock, type SheetRow } from '../sheets/types'

// The user's own pages (Text notes). A page is a row in `sheets`; everything on it is a row in
// `sheetBlocks`, so two devices editing different blocks never overwrite each other.

const uid = () => crypto.randomUUID()
const EMPTY_DOC = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }] }

export async function createSheet(opts: { folderId?: string | null; paper?: Paper } = {}): Promise<string> {
  const now = Date.now()
  const id = uid()
  await db.transaction('rw', db.sheets, db.sheetBlocks, async () => {
    await db.sheets.add({ id, folderId: opts.folderId ?? null, title: 'Untitled page', titleAuto: true, paper: opts.paper ?? DEFAULT_PAPER, createdAt: now, updatedAt: now, lastOpenedAt: now })
    await db.sheetBlocks.add({ id: uid(), sheetId: id, ...MAIN_BLOCK, kind: 'text', role: 'main', data: { doc: EMPTY_DOC }, z: 0, createdAt: now, updatedAt: now })
  })
  return id
}

export const getSheet = (id: string) => db.sheets.get(id)

export async function listSheets(): Promise<SheetRow[]> {
  const [folders, all] = await Promise.all([db.folders.toArray(), db.sheets.toArray()])
  const hidden = hiddenFolderIds(folders)
  return all.filter((s) => !s.archived && !(s.folderId && hidden.has(s.folderId)))
}

export async function updateSheet(id: string, patch: Partial<Omit<SheetRow, 'id' | 'createdAt'>>) {
  await db.sheets.update(id, { ...patch, updatedAt: Date.now() })
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

/** Removes a block left empty, unless it's the main column. Returns whether it was removed. */
export async function pruneEmpty(b: SheetBlock): Promise<boolean> {
  if (b.role === 'main' || !isEmptyDoc(b.data.doc)) return false
  await deleteBlock(b.id)
  return true
}
