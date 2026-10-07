import { create } from 'zustand'
import { db } from '../data/db'
import { supabase } from '../sync/supabase'
import { checkKey } from './gemini'

// The user's Gemini key. On the device it's sealed with a non-extractable AES-GCM key kept in IndexedDB,
// so a copied browser profile doesn't hand it over (script running in the page still could, which is
// what the CSP is for). Signed in, it's also kept on the account (an owner-only `user_settings` row) so
// every device has it after one paste. It is only ever sent to Google.

const ROW = 'gemini-key'
export const useAiKey = create<{ has: boolean; loaded: boolean }>(() => ({ has: false, loaded: false }))

async function wrapKey(): Promise<CryptoKey> {
  const got = await db.secrets.get('wrap')
  if (got?.key) return got.key
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await db.secrets.put({ id: 'wrap', key })
  return key
}

async function saveLocal(k: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await wrapKey(), new TextEncoder().encode(k))
  await db.secrets.put({ id: 'gemini', iv, data })
}

async function readLocal(): Promise<string | null> {
  const s = await db.secrets.get('gemini')
  const w = await db.secrets.get('wrap')
  if (!s?.data || !s.iv || !w?.key) return null
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: s.iv as Uint8Array<ArrayBuffer> }, w.key, s.data)) }
  catch { return null }
}

const signedIn = async () => !!supabase && !!(await supabase.auth.getSession()).data.session

/** The key from the account, saved on this device (or removed here when the account has none). */
export async function pullAiKey() {
  if (!(await signedIn())) return
  const { data, error } = await supabase!.from('user_settings').select('doc,deleted').eq('id', ROW).maybeSingle()
  if (error || !data) return
  const k = !data.deleted && typeof data.doc?.key === 'string' ? data.doc.key : null
  if (k) await saveLocal(k); else await db.secrets.delete('gemini')
  useAiKey.setState({ has: !!k || !!devKey(), loaded: true })
}

// Local testing only: `VITE_GEMINI_DEV_KEY` from .env.local. `import.meta.env.DEV` is false in a build, so
// the minifier drops this and the key never reaches the bundle.
const devKey = (): string | null => (import.meta.env.DEV ? (import.meta.env.VITE_GEMINI_DEV_KEY as string | undefined) ?? null : null)

/** The key to call Gemini with, or null when there's none. */
export async function getKey(): Promise<string | null> {
  return (await readLocal()) ?? devKey()
}

export async function loadAiKey() {
  useAiKey.setState({ has: !!(await getKey()), loaded: true })
}

/** Checks the key with Google, then keeps it on this device and, signed in, on the account. */
export async function setKey(raw: string) {
  const k = raw.trim()
  if (!/^[\w.-]{20,200}$/.test(k)) throw new Error('That doesn’t look like a Gemini API key.')
  await checkKey(k)
  await saveLocal(k)
  if (await signedIn()) {
    const { error } = await supabase!.from('user_settings').upsert({ id: ROW, doc: { key: k }, deleted: false }, { onConflict: 'user_id,id' })
    if (error) throw new Error('Saved on this device, but it couldn’t be saved to your account. Try again later.')
  }
  useAiKey.setState({ has: true, loaded: true })
}

export async function removeKey() {
  await db.secrets.delete('gemini')
  if (await signedIn()) await supabase!.from('user_settings').upsert({ id: ROW, doc: {}, deleted: true }, { onConflict: 'user_id,id' })
  useAiKey.setState({ has: !!devKey(), loaded: true })
}

/** After signing out: the device copy went with everything else. */
export const forgetAiKey = () => useAiKey.setState({ has: !!devKey(), loaded: true })
