import { supabase } from './supabase'

// Share links: a read-only snapshot of a deck, notes page or page that anyone with the link can open.
// Progress, highlights and annotations are never part of it.

export type ShareKind = 'deck' | 'note' | 'sheet'
export type ShareRow = { id: string; kind: ShareKind; source_id: string; title: string; updated_at: string }

const MAX_BYTES = 2_500_000

/** A long random id: 24 characters from a 64-letter alphabet (144 bits), so links can't be guessed. */
function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const shareUrl = (id: string) => `${location.origin}/s/${id}`

/** This user's share of a page, if it has one. */
export async function findShare(kind: ShareKind, sourceId: string): Promise<ShareRow | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('shares').select('id,kind,source_id,title,updated_at').eq('kind', kind).eq('source_id', sourceId).maybeSingle()
  if (error) throw error
  return data as ShareRow | null
}

/** Create the share, or update its copy to the page as it is now. Keeps the same link. */
export async function publishShare(kind: ShareKind, sourceId: string, title: string, payload: unknown): Promise<ShareRow> {
  if (!supabase) throw new Error('Sharing needs an account.')
  if (JSON.stringify(payload).length > MAX_BYTES) throw new Error('This page is too big to share as a link. Export it as a file instead.')
  const existing = await findShare(kind, sourceId)
  const { data, error } = await supabase.from('shares')
    .upsert({ id: existing?.id ?? newId(), kind, source_id: sourceId, title: title.slice(0, 200), payload }, { onConflict: 'owner,kind,source_id' })
    .select('id,kind,source_id,title,updated_at').single()
  if (error) throw new Error(error.message.includes('rate_limited') ? 'You’ve made or updated a lot of links in the last hour. Try again in a while.'
    : error.message.includes('storage_full') ? 'Your account is full. Delete pages or decks you no longer need, then try again.' : error.message)
  return data as ShareRow
}

export async function stopShare(id: string) {
  if (!supabase) return
  const { error } = await supabase.from('shares').delete().eq('id', id)
  if (error) throw error
}

/** Open a share by its link. Works signed out. Null when the link is unknown or was turned off. */
export async function openShare(id: string): Promise<{ kind: ShareKind; title: string; payload: unknown; updated_at: string } | null> {
  if (!supabase || !/^[A-Za-z0-9_-]{20,40}$/.test(id)) return null
  const { data, error } = await supabase.rpc('get_share', { share_id: id })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row ?? null
}
