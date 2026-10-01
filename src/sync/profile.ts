import { create } from 'zustand'
import { supabase } from './supabase'

// The signed-in user's profile: a username and a picture. Lives in Supabase (`profiles` table and the
// `avatars` bucket) and is cached in localStorage so the sidebar shows it instantly and offline.

export type Avatar =
  | { kind: 'letter'; color?: string }
  | { kind: 'icon'; icon: AvatarIcon; color?: string }
  | { kind: 'image'; path: string; v: number }
export type Profile = { username: string; avatar: Avatar }

export const AVATAR_ICONS = ['flame', 'spark', 'trophy', 'cards', 'notes', 'lib', 'match', 'loop', 'clock', 'chart', 'check', 'folder'] as const
export type AvatarIcon = (typeof AVATAR_ICONS)[number]
export const AVATAR_COLORS = ['#4F6B3A', '#2F5D46', '#A9553A', '#98712A', '#475866', '#6B4E8A', '#8A3E5C', '#2E6A7A', '#1C1B18'] as const

export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,24}$/

const CACHE = 'mneme.profile'
type State = { profile: Profile | null; loaded: boolean }
export const useProfile = create<State>(() => {
  try { return { profile: JSON.parse(localStorage.getItem(CACHE) ?? 'null'), loaded: false } } catch { return { profile: null, loaded: false } }
})
const setProfile = (profile: Profile | null) => {
  useProfile.setState({ profile, loaded: true })
  try { profile ? localStorage.setItem(CACHE, JSON.stringify(profile)) : localStorage.removeItem(CACHE) } catch { /* private mode */ }
}

const uid = async () => (await supabase?.auth.getSession())?.data.session?.user.id ?? null

/** Fetch this user's profile. `null` means they haven't set one up yet (first sign-in). */
export async function loadProfile(): Promise<Profile | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('profiles').select('username,avatar').maybeSingle()
  if (error) { useProfile.setState({ loaded: true }); throw error }
  setProfile(data as Profile | null)
  return data as Profile | null
}

export function forgetProfile() { setProfile(null); useProfile.setState({ loaded: false }) }

export async function usernameAvailable(name: string): Promise<boolean> {
  if (!supabase) return true
  const { data, error } = await supabase.rpc('username_available', { name })
  if (error) throw error
  return !!data
}

/** Create or update the profile. Throws a readable message if the username is taken or invalid. */
export async function saveProfile(p: Profile) {
  if (!supabase) return
  if (!USERNAME_RE.test(p.username)) throw new Error('Use 3 to 24 letters, numbers, dots, dashes or underscores.')
  const id = await uid()
  const { error } = await supabase.from('profiles').upsert({ id, username: p.username, avatar: p.avatar }, { onConflict: 'id' })
  if (error) throw new Error(error.code === '23505' ? 'That username is taken.' : error.message)
  setProfile(p)
}

/** Crop to a centred square, shrink to 256 px and encode as WebP (JPEG if the browser can't). */
export async function shrinkImage(file: File, size = 256): Promise<Blob> {
  const img = await createImageBitmap(file)
  const side = Math.min(img.width, img.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
  img.close()
  const blob = (type: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.82))
  const webp = await blob('image/webp')
  if (webp && webp.type === 'image/webp') return webp
  const jpeg = await blob('image/jpeg')
  if (!jpeg) throw new Error("Couldn't read that image.")
  return jpeg
}

/** Upload a new picture (replacing the old one) and return the avatar to save on the profile. */
export async function uploadAvatar(file: File): Promise<Avatar> {
  if (!supabase) throw new Error('Accounts are not set up in this build.')
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  const id = await uid()
  if (!id) throw new Error('Sign in first.')
  const blob = await shrinkImage(file)
  const path = `${id}/avatar.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: '3600' })
  if (error) throw error
  return { kind: 'image', path, v: Date.now() }
}

/** Remove every picture this user has stored (used before deleting the account). */
export async function removeAvatars() {
  if (!supabase) return
  const id = await uid()
  if (!id) return
  const { data } = await supabase.storage.from('avatars').list(id)
  if (data?.length) await supabase.storage.from('avatars').remove(data.map((f) => `${id}/${f.name}`))
}

export function avatarUrl(a: Avatar): string | null {
  if (a.kind !== 'image' || !supabase) return null
  return `${supabase.storage.from('avatars').getPublicUrl(a.path).data.publicUrl}?v=${a.v}`
}
