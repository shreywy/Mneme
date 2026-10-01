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
      // Implicit flow so an emailed sign-in link works on any device (PKCE needs the same browser).
      // Once the code email is live, sign-in uses the 6-digit code and this can move to PKCE.
      flowType: 'implicit',
    },
  })
  : null

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
