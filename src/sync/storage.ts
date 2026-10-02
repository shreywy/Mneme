import { create } from 'zustand'
import { supabase } from './supabase'

// Each account gets a fixed amount of cloud space (counted by the server, see the storage_cap
// migration). This device keeps working when it's full; only new data stops syncing until
// something is deleted.
export const DEFAULT_CAP = 20 * 1024 * 1024

/** cap null: no limit. */
export type StorageUsage = { used: number; cap: number | null }
export const useStorage = create<{ usage: StorageUsage | null }>(() => ({ usage: null }))

export function isStorageFull(e: unknown): boolean {
  if (!e) return false
  const msg = e instanceof Error ? e.message : typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  return msg.includes('storage_full')
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
}

export function describeUsage({ used, cap }: StorageUsage): { label: string; pct: number | null; level: 'ok' | 'near' | 'full' } {
  if (cap === null) return { label: `${formatBytes(used)} used · no limit`, pct: null, level: 'ok' }
  const pct = Math.min(100, Math.round((used / cap) * 100))
  return { label: `${formatBytes(used)} of ${formatBytes(cap)}`, pct, level: used >= cap ? 'full' : used >= cap * 0.9 ? 'near' : 'ok' }
}

let lastLoad = 0
/** Reads this account's usage. `maxAgeMs` skips the request if it was read that recently. */
export async function loadStorage(maxAgeMs = 0): Promise<StorageUsage | null> {
  if (!supabase) return null
  if (maxAgeMs && Date.now() - lastLoad < maxAgeMs) return useStorage.getState().usage
  lastLoad = Date.now()
  const { data, error } = await supabase.from('storage_usage').select('bytes,cap_bytes').maybeSingle()
  if (error) throw error
  const usage: StorageUsage = data
    ? { used: Number(data.bytes), cap: data.cap_bytes == null ? null : Number(data.cap_bytes) }
    : { used: 0, cap: DEFAULT_CAP }
  useStorage.setState({ usage })
  return usage
}

export function forgetStorage() { lastLoad = 0; useStorage.setState({ usage: null }) }
