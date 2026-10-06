import { supabase } from './supabase'

// The devices signed in to this account, and its activity log (see the devices_and_activity migration).

export type Session = { id: string; created_at: string; last_active: string; user_agent: string | null; ip: string | null; current: boolean }
export type AccountEvent = { id: number; at: string; kind: 'share_created' | 'share_updated' | 'share_stopped' | 'device_signed_out'; detail: { kind?: string; title?: string; device?: string } }

/** "Chrome on Windows" from a user agent string. */
export function deviceName(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device'
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : null
  return browser && os ? `${browser} on ${os}` : browser ?? os ?? 'Unknown device'
}

export async function listSessions(): Promise<Session[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('my_sessions')
  if (error) throw error
  return (data ?? []) as Session[]
}

export async function endSession(id: string): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await supabase.rpc('end_session', { session: id })
  if (error) throw error
  return !!data
}

/** Signs out every device but this one. */
export async function signOutOthers() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut({ scope: 'others' })
  if (error) throw error
}

export async function listActivity(limit = 30): Promise<AccountEvent[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('account_events').select('id,at,kind,detail').order('at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as AccountEvent[]
}
