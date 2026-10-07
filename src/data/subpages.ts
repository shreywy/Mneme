import { db } from './db'
import { addBlock, blocksFor, createSheet, deleteBlock } from './sheets'
import { trashPage } from './trash'
import { MAIN_BLOCK, type Paper, type SheetBlock, type SheetRow } from '../sheets/types'
import { wouldCycle } from '../sheets/tree'

// Pages under pages. A sub-page has `parentId` (the page) and `box` (the box block on that page that
// shows it). Boxes don't list their pages: they read them, so the canvas and the sidebar always agree.

const live = (s: SheetRow) => !s.archived && !s.deletedAt
const byRank = (a: SheetRow, b: SheetRow) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.title.localeCompare(b.title, undefined, { numeric: true })

export async function boxesOf(sheetId: string): Promise<SheetBlock[]> {
  return (await blocksFor(sheetId)).filter((b) => b.kind === 'box').sort((a, b) => a.y - b.y || a.x - b.x)
}

/** A box on the page, by default under everything else, as wide as the main column. */
export async function addBox(sheetId: string, label = '', at?: { x: number; y: number }): Promise<SheetBlock> {
  const blocks = await blocksFor(sheetId)
  const spot = at ?? { x: MAIN_BLOCK.x, y: Math.max(MAIN_BLOCK.y, ...blocks.map((b) => b.y + b.h)) + 1 }
  const z = Math.max(0, ...blocks.map((b) => b.z)) + 1
  return addBlock({ sheetId, ...spot, w: MAIN_BLOCK.w, h: 4, kind: 'box', data: { doc: null, label }, z })
}

export async function ensureBox(sheetId: string): Promise<string> {
  return (await boxesOf(sheetId)).at(-1)?.id ?? (await addBox(sheetId, 'Pages')).id
}

/** A page's sub-pages (not archived or deleted), in hand order. */
export async function kidsOf(sheetId: string): Promise<SheetRow[]> {
  return (await db.sheets.where('parentId').equals(sheetId).toArray()).filter(live).sort(byRank)
}

const nextRank = async (parentId: string, boxId: string) =>
  Math.max(-1, ...(await kidsOf(parentId)).filter((s) => s.box === boxId).map((s) => s.rank ?? -1)) + 1

export async function createSubPage(parentId: string, boxId: string, paper?: Paper): Promise<string> {
  const rank = await nextRank(parentId, boxId)
  const id = await createSheet({ folderId: null, paper })
  await db.sheets.update(id, { parentId, box: boxId, rank })
  return id
}

/** Puts a page in a box (at the end, or in `order`'s place). Refuses, returning false, if it would be under itself. */
export async function moveIntoBox(pageId: string, parentId: string, boxId: string, order?: string[]): Promise<boolean> {
  if (wouldCycle(pageId, parentId, await db.sheets.toArray())) return false
  const rank = order ? order.indexOf(pageId) : await nextRank(parentId, boxId)
  await db.transaction('rw', db.sheets, async () => {
    await db.sheets.where('id').equals(pageId).modify((s) => {
      s.parentId = parentId; s.box = boxId; s.folderId = null; s.rank = rank; s.updatedAt = Date.now()
      delete s.unit
    })
    if (order) for (const [i, id] of order.entries()) if (id !== pageId) await db.sheets.update(id, { rank: i })
  })
  return true
}

/** The folder a page lives in: its top page's. */
async function folderOf(id: string): Promise<string | null> {
  const seen = new Set<string>()
  let s = await db.sheets.get(id)
  while (s?.parentId && !seen.has(s.id)) {
    seen.add(s.id)
    const up = await db.sheets.get(s.parentId)
    if (!up) return null
    s = up
  }
  return s?.folderId ?? null
}

/** Makes a page top level in a folder (and unit). */
async function toTop(pageId: string, folderId: string | null, unit?: string) {
  await db.sheets.where('id').equals(pageId).modify((s) => {
    delete s.parentId; delete s.box; delete s.rank
    s.folderId = folderId; s.updatedAt = Date.now()
    if (unit) s.unit = unit; else delete s.unit
  })
}

export async function moveOutALevel(pageId: string): Promise<void> {
  const s = await db.sheets.get(pageId)
  const parent = s?.parentId ? await db.sheets.get(s.parentId) : undefined
  if (!s || !parent) return
  if (parent.parentId) await moveIntoBox(pageId, parent.parentId, parent.box ?? await ensureBox(parent.parentId))
  else await toTop(pageId, await folderOf(parent.id), parent.unit)
}

/** Moves a page's sub-pages into its own place (before it's deleted or archived without them). */
export async function liftChildren(pageId: string): Promise<void> {
  const s = await db.sheets.get(pageId)
  if (!s) return
  const folder = await folderOf(pageId)
  for (const k of await kidsOf(pageId)) {
    if (s.parentId) await moveIntoBox(k.id, s.parentId, s.box ?? await ensureBox(s.parentId))
    else await toTop(k.id, folder, s.unit)
  }
}

/** Deletes a box. Its pages go to Recently deleted with it, or move into another box on the page. */
export async function deleteBox(boxId: string, withPages: boolean): Promise<void> {
  const box = await db.sheetBlocks.get(boxId)
  if (!box) return
  const pages = (await kidsOf(box.sheetId)).filter((s) => s.box === boxId)
  if (withPages) for (const p of pages) await trashPage('sheet', p.id)
  else if (pages.length) {
    const other = (await boxesOf(box.sheetId)).filter((b) => b.id !== boxId).at(-1)?.id ?? (await addBox(box.sheetId, 'Pages')).id
    for (const p of pages) await moveIntoBox(p.id, box.sheetId, other)
  }
  await deleteBlock(boxId)
}

/**
 * Sub-pages whose box is gone (deleted on another device) move into the page's last box. Only ones
 * unchanged for a minute: a box made on another device may still be syncing in. Returns how many moved.
 */
export async function adoptOrphans(sheetId: string, now = Date.now()): Promise<number> {
  const boxes = new Set((await boxesOf(sheetId)).map((b) => b.id))
  const lost = (await kidsOf(sheetId)).filter((s) => (!s.box || !boxes.has(s.box)) && s.updatedAt < now - 60_000)
  if (!lost.length) return 0
  const into = await ensureBox(sheetId)
  for (const s of lost) await moveIntoBox(s.id, sheetId, into)
  return lost.length
}
