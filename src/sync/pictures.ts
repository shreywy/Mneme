import { picturePath } from '../sheets/image'
import { supabase } from './supabase'

// Pictures in the account's private `pictures` folder (see the pictures migration). Only the owner can
// read, add or delete them; share links get signed links instead.

const bucket = () => supabase!.storage.from('pictures')
const uid = async () => (await supabase?.auth.getSession())?.data.session?.user.id ?? null
/** How long a picture link in a share works. Updating the share makes new ones. */
export const SHARE_LINK_DAYS = 365

export const signedIn = async () => !!(supabase && (await uid()))

export class PicturesFull extends Error { constructor() { super('Picture space is full') } }

/** Stores a picture and returns its path. Throws PicturesFull past the account's allowance. */
export async function putPicture(id: string, blob: Blob): Promise<string> {
  const user = await uid()
  const path = user && picturePath(user, id, blob.type)
  if (!supabase || !path) throw new Error('Can’t store this picture')
  const { error } = await bucket().upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false })
  if (!error) return path
  const status = String((error as { statusCode?: string }).statusCode ?? '')
  if (status === '409' || /already exists/i.test(error.message)) return path // stored earlier; the reply was lost
  // The only check a picture in your own folder can fail is the allowance.
  if (status === '403' || /row-level security/i.test(error.message)) throw new PicturesFull()
  throw error
}

/** Downloads one of your pictures (for a device that didn't add it). */
export async function getPicture(path: string): Promise<Blob | null> {
  if (!supabase) return null
  const { data } = await bucket().download(path)
  return data ?? null
}

/** Signed links for a share, by path. Paths that can't be signed are left out. */
export async function signPictures(paths: string[]): Promise<Record<string, string>> {
  if (!supabase || !paths.length) return {}
  const { data, error } = await bucket().createSignedUrls([...new Set(paths)], SHARE_LINK_DAYS * 86400)
  if (error) throw error
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl!]))
}

export async function removePictures(paths: string[]) {
  if (!supabase || !paths.length) return
  try { await bucket().remove(paths) } catch { /* offline: an unlinked file nobody else can read */ }
}

/** Every picture this account has stored (before deleting the account). */
export async function removeAllPictures() {
  const user = await uid()
  if (!supabase || !user) return
  for (;;) {
    const { data } = await bucket().list(user, { limit: 1000 })
    if (!data?.length) return
    await bucket().remove(data.map((f) => `${user}/${f.name}`))
    if (data.length < 1000) return
  }
}
