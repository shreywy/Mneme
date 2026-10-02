import { db } from './db'
import { addBlock, blocksFor } from './sheets'
import { DEFAULT_PAPER, type SheetBlock, type SheetStroke } from '../sheets/types'
import { copyInk, deleteStrokes, inkOnBlocks } from './ink'

// My blocks: blocks the user saved to reuse (a table set up just so, axes with labels). They live on one
// hidden page, so they sync and count toward storage like any other page. Each saved group shares a
// `group` id and a `name`, with positions kept relative to the group's top-left.

export const MY_BLOCKS_ID = 'my-blocks'
export type MyBlock = { group: string; name: string; blocks: SheetBlock[] }

async function ensurePage() {
  if (await db.sheets.get(MY_BLOCKS_ID)) return
  const now = Date.now()
  await db.sheets.put({ id: MY_BLOCKS_ID, folderId: null, title: 'My blocks', titleAuto: false, hidden: true, paper: DEFAULT_PAPER, createdAt: now, updatedAt: now })
}

/** Saves blocks, and what's drawn on them, as one named group. */
export async function saveMyBlock(name: string, blocks: SheetBlock[]) {
  if (!blocks.length) return
  await ensurePage()
  const group = crypto.randomUUID()
  const x0 = Math.min(...blocks.map((b) => b.x)), y0 = Math.min(...blocks.map((b) => b.y))
  const map = new Map<string, string>()
  for (const b of [...blocks].sort((a, c) => a.y - c.y || a.x - c.x)) {
    const saved = await addBlock({ sheetId: MY_BLOCKS_ID, x: b.x - x0, y: b.y - y0, w: b.w, h: b.h, kind: b.kind, z: b.z, data: { ...structuredClone(b.data), group, name } })
    map.set(b.id, saved.id)
  }
  await copyInk(await inkOnBlocks(blocks.map((b) => b.id)), MY_BLOCKS_ID, map)
}

export async function listMyBlocks(): Promise<MyBlock[]> {
  const groups = new Map<string, MyBlock>()
  for (const b of await blocksFor(MY_BLOCKS_ID)) {
    const g = b.data.group
    if (!g) continue
    if (!groups.has(g)) groups.set(g, { group: g, name: b.data.name ?? 'My block', blocks: [] })
    groups.get(g)!.blocks.push(b)
  }
  for (const g of groups.values()) g.blocks.sort((a, b) => a.y - b.y || a.x - b.x)
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

export async function deleteMyBlock(group: string) {
  const gone = await db.sheetBlocks.where('sheetId').equals(MY_BLOCKS_ID).filter((b) => b.data.group === group).toArray()
  await db.sheetBlocks.bulkDelete(gone.map((b) => b.id))
  await deleteStrokes((await inkOnBlocks(gone.map((b) => b.id))).map((s) => s.id))
}

/** Copies a saved group, with its drawing, onto a page with its top-left at `at` (grid units). */
export async function placeMyBlock(g: MyBlock, sheetId: string, at: { x: number; y: number }): Promise<{ blocks: SheetBlock[]; ink: SheetStroke[] }> {
  const z = Math.max(0, ...(await blocksFor(sheetId)).map((b) => b.z))
  const out: SheetBlock[] = []
  const map = new Map<string, string>()
  for (const [i, b] of g.blocks.entries()) {
    const { group: _g, name: _n, ...data } = b.data
    const placed = await addBlock({ sheetId, x: at.x + b.x, y: at.y + b.y, w: b.w, h: b.h, kind: b.kind, z: z + 1 + i, data: structuredClone(data) })
    map.set(b.id, placed.id)
    out.push(placed)
  }
  const ink = await copyInk(await inkOnBlocks(g.blocks.map((b) => b.id)), sheetId, map)
  return { blocks: out, ink }
}
