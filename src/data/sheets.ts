import { db } from './db'
import { hiddenFolderIds } from './repo'
import { DEFAULT_PAPER, MAIN_BLOCK, type Paper, type SheetBlock, type SheetRow, type SheetStroke } from '../sheets/types'
import { decodePoints, shiftPoints, strokeBounds } from '../sheets/ink'
import { copyInk, deleteStrokes, inkFor, inkOnBlocks } from './ink'
import type { PagePayload } from '../sheets/sharepage'
import { titleFrom } from '../sheets/order'
import { subtree } from '../sheets/tree'

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

/** A shared page saved into this library: a new page with fresh ids, its drawing pinned to the copied blocks. */
export async function importPage(p: PagePayload, folderId: string | null = null): Promise<string> {
  const now = Date.now()
  const id = uid()
  const ids = p.blocks.map(() => uid())
  await db.transaction('rw', db.sheets, db.sheetBlocks, db.sheetInk, async () => {
    await db.sheets.add({ id, folderId, title: p.title, titleAuto: false, paper: p.paper, createdAt: now, updatedAt: now, lastOpenedAt: now })
    await db.sheetBlocks.bulkAdd(p.blocks.map((b, i) => ({ id: ids[i], sheetId: id, x: b.x, y: b.y, w: b.w, h: b.h, kind: b.kind, ...(b.role ? { role: b.role } : {}), data: b.data, z: i, createdAt: now, updatedAt: now })))
    // A page needs its main column.
    if (!p.blocks.some((b) => b.role === 'main')) await db.sheetBlocks.add({ id: uid(), sheetId: id, ...MAIN_BLOCK, kind: 'text', role: 'main', data: { doc: EMPTY_DOC }, z: 0, createdAt: now, updatedAt: now })
    await db.sheetInk.bulkAdd(p.ink.filter((s) => s.block === null || ids[s.block]).map((s) => ({
      id: uid(), sheetId: id, ...(s.block !== null ? { blockId: ids[s.block] } : {}), tool: s.tool, color: s.color, size: s.size, pts: s.pts,
      ...(s.shape ? { shape: true } : {}), ...(s.sim ? { sim: true } : {}), createdAt: now, updatedAt: now,
    })))
  })
  return id
}

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

/** Archives a page with its sub-pages (or, `withKids` false, after moving them up); un-archiving brings back the ones archived with it. */
export async function setSheetArchived(id: string, archived: boolean, withKids = true) {
  // Imported when used: subpages and trash both import this file.
  if (archived) {
    if (!withKids) await (await import('./subpages')).liftChildren(id)
    const now = Date.now()
    const all = await db.sheets.toArray()
    const ids = [id, ...(withKids ? subtree(id, all).filter((x) => !all.find((s) => s.id === x)?.archived) : [])]
    for (const x of ids) await db.sheets.update(x, { archived: true, archivedAt: now })
  } else {
    for (const x of await (await import('./trash')).sameStamp(id, 'archivedAt')) await db.sheets.update(x, { archived: false })
  }
}

export async function deleteSheet(id: string) {
  await db.transaction('rw', db.sheets, db.sheetBlocks, db.sheetInk, async () => {
    // Collection.delete() goes through the sync hooks, so the server gets a tombstone for every block.
    await db.sheetBlocks.where('sheetId').equals(id).delete()
    await db.sheetInk.where('sheetId').equals(id).delete()
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

/** Moves blocks down (or up) by `dy` lines, from wherever they are now. */
export async function shiftBlocks(ids: string[], dy: number) {
  const now = Date.now()
  await db.sheetBlocks.where('id').anyOf(ids).modify((b) => { b.y += dy; b.updatedAt = now })
}

/** Patches many blocks in one write (the end of a drag), so the page redraws once, not once per block. */
export async function updateBlocks(list: { id: string; patch: Partial<Omit<SheetBlock, 'id' | 'sheetId' | 'createdAt'>> }[]) {
  if (!list.length) return
  const now = Date.now()
  await db.sheetBlocks.bulkUpdate(list.map(({ id, patch }) => ({ key: id, changes: { ...patch, updatedAt: now } })))
}

/**
 * Copies of these blocks just below the group, on top of everything else. Drawing on them goes onto the
 * copies; `loose` strokes (on the paper, or on blocks left out) are copied the same distance down.
 */
export async function duplicateBlocks(blocks: SheetBlock[], loose: SheetStroke[] = [], unit = 28): Promise<{ blocks: SheetBlock[]; ink: SheetStroke[] }> {
  const sheetId = blocks[0]?.sheetId ?? loose[0]?.sheetId
  if (!sheetId) return { blocks: [], ink: [] }
  const looseBox = loose.length ? strokeBounds(loose.flatMap((s) => decodePoints(s.pts))) : null
  const top = blocks.length ? Math.min(...blocks.map((b) => b.y)) : 0, bottom = blocks.length ? Math.max(...blocks.map((b) => b.y + b.h)) : 0
  const lines = blocks.length ? bottom - top + 1 : Math.ceil((looseBox?.h ?? 0) / unit) + 1
  const z = Math.max(0, ...(await blocksFor(sheetId)).map((b) => b.z))
  const out: SheetBlock[] = []
  const map = new Map<string, string>()
  for (const [i, b] of blocks.entries()) {
    const { id: _id, createdAt: _c, updatedAt: _u, role: _role, ...rest } = b
    const copy = await addBlock({ ...rest, y: b.y + lines, z: z + 1 + i, data: structuredClone(b.data) })
    map.set(b.id, copy.id)
    out.push(copy)
  }
  const onBlocks = await copyInk(await inkOnBlocks(blocks.map((b) => b.id)), sheetId, map)
  const now = Date.now()
  const shifted = loose.filter((s) => !s.blockId || !map.has(s.blockId))
    .map((s) => ({ ...structuredClone(s), id: crypto.randomUUID(), pts: shiftPoints(s.pts, 0, lines * unit), createdAt: now, updatedAt: now }))
  if (shifted.length) await db.sheetInk.bulkAdd(shifted)
  return { blocks: out, ink: [...onBlocks, ...shifted] }
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
/** True when a TipTap document has no text and nothing but empty paragraphs, headings, quotes and code blocks. */
export function isEmptyDoc(doc: unknown): boolean {
  const walk = (n: Node): boolean => {
    if (n.text) return false
    if (n.type && !['doc', 'paragraph', 'heading', 'blockquote', 'codeBlock'].includes(n.type)) return false
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
  // Drawing left on a block deleted elsewhere (another device, an old tab) has nowhere to show.
  const ids = new Set((await blocksFor(sheetId)).map((b) => b.id))
  const orphans = (await inkFor(sheetId)).filter((s) => s.blockId && !ids.has(s.blockId) && s.updatedAt < cutoff)
  await deleteStrokes(orphans.map((s) => s.id))
}

/** Removes a block left empty, unless it's the main column. Returns whether it was removed. */
export async function pruneEmpty(b: SheetBlock): Promise<boolean> {
  if (b.kind !== 'text' || b.role === 'main' || !isEmptyDoc(b.data.doc)) return false
  await deleteBlock(b.id)
  return true
}
