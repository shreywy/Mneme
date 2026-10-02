import { db } from './db'
import type { SheetStroke } from '../sheets/types'

// Ink on pages: one row per stroke, so two devices drawing on the same page never overwrite each other.

export type NewStroke = Omit<SheetStroke, 'id' | 'createdAt' | 'updatedAt'>

export const inkFor = (sheetId: string) => db.sheetInk.where('sheetId').equals(sheetId).toArray()

export async function addStroke(s: NewStroke): Promise<SheetStroke> {
  const now = Date.now()
  const row: SheetStroke = { ...s, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
  await db.sheetInk.add(row)
  return row
}
export const putStroke = (s: SheetStroke) => db.sheetInk.put({ ...s, updatedAt: Date.now() })
export async function putStrokes(list: SheetStroke[]) {
  if (list.length) await db.sheetInk.bulkPut(list.map((s) => ({ ...s, updatedAt: Date.now() })))
}
export async function updateStrokes(list: { id: string; patch: Partial<Omit<SheetStroke, 'id' | 'sheetId' | 'createdAt'>> }[]) {
  if (!list.length) return
  const now = Date.now()
  await db.sheetInk.bulkUpdate(list.map(({ id, patch }) => ({ key: id, changes: { ...patch, updatedAt: now } })))
}
export async function deleteStrokes(ids: string[]) {
  if (ids.length) await db.sheetInk.bulkDelete(ids)
}
export const getStroke = (id: string) => db.sheetInk.get(id)

/** Strokes anchored to any of these blocks. */
export const inkOnBlocks = (blockIds: string[]) => (blockIds.length ? db.sheetInk.where('blockId').anyOf(blockIds).toArray() : Promise.resolve([]))

/** Copies of strokes for new blocks (duplicate, My blocks): same drawing, each on the block it maps to. */
export async function copyInk(strokes: SheetStroke[], sheetId: string, blockMap: Map<string, string>): Promise<SheetStroke[]> {
  const now = Date.now()
  const rows = strokes.filter((s) => s.blockId && blockMap.has(s.blockId)).map((s) => ({ ...structuredClone(s), id: crypto.randomUUID(), sheetId, blockId: blockMap.get(s.blockId!)!, createdAt: now, updatedAt: now }))
  if (rows.length) await db.sheetInk.bulkAdd(rows)
  return rows
}
