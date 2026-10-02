import { db } from './db'

const TABLES = ['folders', 'decks', 'items', 'cards', 'reviews', 'records', 'notes', 'links', 'marks', 'sheets', 'sheetBlocks'] as const

/** Everything in this browser's Mneme database, as one JSON-safe object. */
export async function exportBackup() {
  const data: Record<string, unknown[]> = {}
  for (const t of TABLES) data[t] = await db.table(t).toArray()
  return { format: 'mneme.backup', version: 1, exportedAt: new Date().toISOString(), data }
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
/** JSON turns Dates into strings; FSRS card fields need real Dates back. */
export function revive(v: unknown): unknown {
  if (typeof v === 'string' && ISO.test(v)) return new Date(v)
  if (Array.isArray(v)) return v.map(revive)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]))
  return v
}

/** Merge a backup into the database. Rows with the same id are replaced; nothing else is deleted. */
export async function restoreBackup(file: unknown): Promise<{ decks: number }> {
  const f = file as { format?: string; data?: Record<string, unknown[]> }
  if (!f || f.format !== 'mneme.backup' || !f.data) throw new Error('This file is not a Mneme backup.')
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      const rows = f.data![t]
      if (!Array.isArray(rows)) continue
      // cards hold FSRS Dates; everything else keeps plain values (timestamps are numbers)
      await db.table(t).bulkPut(t === 'cards' ? rows.map(revive) : rows)
    }
  })
  return { decks: Array.isArray(f.data.decks) ? f.data.decks.length : 0 }
}

/** Ask the browser not to clear Mneme's data under storage pressure. Returns whether storage is persistent. */
export async function ensurePersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch { return null }
}
