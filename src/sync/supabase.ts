import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Remote, RemoteRow } from './engine'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Null when the build has no Supabase settings: the app then runs in guest mode only. */
export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Email sign-in is by 6-digit code, so the only redirect is OAuth, which returns to the same browser.
      flowType: 'pkce',
    },
  })
  : null

/** Which OAuth providers are switched on in the dashboard, so the sign-in dialog only shows those. */
export async function enabledProviders(): Promise<Record<string, boolean>> {
  if (!url || !key) return {}
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
    return r.ok ? ((await r.json()) as { external?: Record<string, boolean> }).external ?? {} : {}
  } catch { return {} }
}

export function supabaseRemote(sb: SupabaseClient): Remote {
  return {
    async upsert(table, rows) {
      const { error } = await sb.from(table).upsert(rows, { onConflict: 'user_id,id' })
      if (error) throw error
    },
    async pullSince(table, since, limit) {
      const { data, error } = await sb.from(table).select('id,doc,deleted,updated_at').gt('updated_at', since).order('updated_at').limit(limit)
      if (error) throw error
      return (data ?? []) as RemoteRow[]
    },
  }
}
