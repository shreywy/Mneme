import type { Table, Transaction } from 'dexie'
import { db } from '../data/db'
import { revive } from '../data/backup'

// Local-first sync. IndexedDB stays the source the UI reads; this module copies changes to the server
// and pulls changes made on the user's other devices.
//
// - Every write to a synced table is caught by a Dexie hook and its id queued as "pending".
// - push() upserts pending rows (or a tombstone if the row is gone) and clears them.
// - pull() fetches rows the server changed since a per-table cursor and applies them locally.
//   Writes made while applying are tagged on their transaction, so they aren't queued again.
// - A pending local change wins over an incoming remote one until it has been pushed.

export type RemoteRow = { id: string; doc: unknown; deleted: boolean; updated_at: string }
export interface Remote {
  upsert(table: string, rows: { id: string; doc: unknown; deleted: boolean }[]): Promise<void>
  pullSince(table: string, since: string, limit: number): Promise<RemoteRow[]>
}

type Row = Record<string, unknown>
type Spec = {
  remote: string
  table: () => Table
  idOf: (r: Row) => string
  /** Find the local primary key for a remote id (undefined if the row isn't here). */
  localKey: (id: string) => Promise<unknown>
  /** Shape a remote doc before it's written locally. */
  toLocal?: (doc: Row, existingKey: unknown) => Row
}

const split = (id: string) => { const i = id.indexOf('|'); return [id.slice(0, i), id.slice(i + 1)] }
const byKey = (table: () => Table) => async (id: string) => ((await table().get(id)) ? id : undefined)
const byPair = (table: () => Table) => async (id: string) => { const k = split(id); return (await table().get(k)) ? k : undefined }

export const SPECS: Spec[] = [
  { remote: 'folders', table: () => db.folders, idOf: (r) => String(r.id), localKey: byKey(() => db.folders) },
  { remote: 'decks', table: () => db.decks, idOf: (r) => String(r.id), localKey: byKey(() => db.decks) },
  { remote: 'items', table: () => db.items, idOf: (r) => `${r.deckId}|${r.key}`, localKey: byPair(() => db.items) },
  { remote: 'card_states', table: () => db.cards, idOf: (r) => `${r.deckId}|${r.key}`, localKey: byPair(() => db.cards) },
  {
    remote: 'reviews', table: () => db.reviews, idOf: (r) => String(r.syncId),
    localKey: async (id) => (await db.reviews.where('syncId').equals(id).first())?.id,
    // Local ids are per-device auto-increments: keep ours, or let IndexedDB assign one.
    toLocal: (doc, key) => { const { id: _remoteLocalId, ...rest } = doc; return key === undefined ? rest : { ...rest, id: key } },
  },
  { remote: 'deck_records', table: () => db.records, idOf: (r) => String(r.deckId), localKey: byKey(() => db.records) },
  { remote: 'notes', table: () => db.notes, idOf: (r) => String(r.id), localKey: byKey(() => db.notes) },
  { remote: 'deck_note_links', table: () => db.links, idOf: (r) => `${r.noteId}|${r.deckId}`, localKey: byPair(() => db.links) },
]

// ---------- pending queue ----------
const PENDING_KEY = 'mneme.sync.pending'
const CURSOR_KEY = 'mneme.sync.cursors'
const store = typeof localStorage === 'undefined' ? null : localStorage
let pending = new Map<string, Set<string>>(loadPending())
let cursors: Record<string, string> = load(CURSOR_KEY, {})
let saveTimer: ReturnType<typeof setTimeout> | null = null
let onDirty: (() => void) | null = null

function load<T>(k: string, fallback: T): T { try { return store ? JSON.parse(store.getItem(k) ?? '') ?? fallback : fallback } catch { return fallback } }
function loadPending(): [string, Set<string>][] { return Object.entries(load<Record<string, string[]>>(PENDING_KEY, {})).map(([t, ids]) => [t, new Set(ids)]) }
function savePending() {
  if (!store || saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try { store.setItem(PENDING_KEY, JSON.stringify(Object.fromEntries([...pending].map(([t, s]) => [t, [...s]])))) } catch { /* quota or private mode */ }
  }, 50)
}
function mark(remote: string, id: string) {
  let s = pending.get(remote)
  if (!s) pending.set(remote, (s = new Set()))
  s.add(id)
  savePending()
  onDirty?.()
}

export const pendingCount = () => [...pending.values()].reduce((n, s) => n + s.size, 0)
export function setOnDirty(fn: (() => void) | null) { onDirty = fn }
export function resetSyncState() {
  pending = new Map(); cursors = {}
  try { store?.removeItem(PENDING_KEY); store?.removeItem(CURSOR_KEY) } catch { /* ignore */ }
}

// ---------- hooks ----------
const isRemote = (tx: Transaction | undefined) => !!(tx as unknown as { __mnemeRemote?: boolean } | undefined)?.__mnemeRemote
let hooked = false
export function installHooks() {
  if (hooked) return
  hooked = true
  for (const spec of SPECS) {
    const t = spec.table() as Table<Row, unknown>
    t.hook('creating', (_pk, obj: Row, tx) => {
      if (spec.remote === 'reviews' && !obj.syncId) obj.syncId = crypto.randomUUID()
      if (!isRemote(tx)) mark(spec.remote, spec.idOf(obj))
    })
    t.hook('updating', function (mods, _pk, obj, tx) {
      if (!isRemote(tx)) mark(spec.remote, spec.idOf({ ...(obj as Row), ...(mods as Row) }))
    })
    t.hook('deleting', (pk, obj: Row | undefined, tx) => {
      if (isRemote(tx)) return
      // Dexie may not hand us the row (e.g. deleting a key that doesn't exist); derive the id from the key.
      const id = obj ? spec.idOf(obj) : Array.isArray(pk) ? pk.join('|') : spec.remote === 'reviews' ? null : String(pk)
      if (id) mark(spec.remote, id)
    })
  }
}

/** Queue every local row (first sign-in on this device uploads what the guest made). */
export async function markAll() {
  await db.transaction('rw', db.reviews, async () => {
    await db.reviews.filter((r) => !r.syncId).modify((r) => { r.syncId = crypto.randomUUID() })
  })
  for (const spec of SPECS) for (const r of await spec.table().toArray()) mark(spec.remote, spec.idOf(r as Row))
}

// ---------- push / pull ----------
const CHUNK = 300

export async function push(remote: Remote): Promise<number> {
  let sent = 0
  for (const spec of SPECS) {
    const ids = [...(pending.get(spec.remote) ?? [])]
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      const rows = await Promise.all(chunk.map(async (id) => {
        const key = await spec.localKey(id)
        const row = key === undefined ? undefined : await spec.table().get(key as never)
        return row ? { id, doc: JSON.parse(JSON.stringify(row)), deleted: false } : { id, doc: {}, deleted: true }
      }))
      await remote.upsert(spec.remote, rows)
      const s = pending.get(spec.remote)
      for (const id of chunk) s?.delete(id)
      savePending()
      sent += rows.length
    }
  }
  return sent
}

const OVERLAP_MS = 5000 // re-read the last few seconds so rows committed slightly out of order aren't missed

export async function pull(remote: Remote): Promise<number> {
  let applied = 0
  for (const spec of SPECS) {
    for (;;) {
      const cursor = cursors[spec.remote] ?? '1970-01-01T00:00:00.000Z'
      const since = new Date(Math.max(0, Date.parse(cursor) - OVERLAP_MS)).toISOString()
      const rows = await remote.pullSince(spec.remote, since, 1000)
      if (!rows.length) break
      const waiting = pending.get(spec.remote)
      await db.transaction('rw', spec.table(), async (tx) => {
        ;(tx as unknown as { __mnemeRemote: boolean }).__mnemeRemote = true
        for (const r of rows) {
          if (waiting?.has(r.id)) continue // our unpushed change wins
          const key = await spec.localKey(r.id)
          if (r.deleted) { if (key !== undefined) await spec.table().delete(key as never); continue }
          const doc = (spec.remote === 'card_states' ? revive(r.doc) : r.doc) as Row
          await spec.table().put((spec.toLocal ? spec.toLocal(doc, key) : doc) as never)
          applied++
        }
      })
      const last = rows[rows.length - 1].updated_at
      const advanced = last > cursor
      cursors[spec.remote] = advanced ? last : cursor
      try { store?.setItem(CURSOR_KEY, JSON.stringify(cursors)) } catch { /* ignore */ }
      if (rows.length < 1000 || !advanced) break
    }
  }
  return applied
}
