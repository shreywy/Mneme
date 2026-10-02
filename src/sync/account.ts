import type { RealtimeChannel, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { db } from '../data/db'
import { useSettings } from '../settings/store'
import { installHooks, markAll, pendingCount, pull, push, resetSyncState, setOnDirty, SPECS } from './engine'
import { enabledProviders, supabase, supabaseRemote } from './supabase'
import { forgetProfile, loadProfile, removeAvatars } from './profile'
import { forgetStorage, isStorageFull, loadStorage } from './storage'

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'offline' | 'error' | 'full'
type Account = { ready: boolean; user: User | null; status: SyncStatus; lastSync: number | null; error: string | null }
export const useAccount = create<Account>(() => ({ ready: !supabase, user: null, status: 'off', lastSync: null, error: null }))
export const accountsEnabled = !!supabase

const OWNER_KEY = 'mneme.sync.owner'
// Settings sync never compares this device's clock with the server's (a clock a few seconds off used
// to bring back old values). A local change marks settings dirty until it's pushed, and a pull only
// applies the server's copy when its server timestamp differs from the last one seen here.
const SETTINGS_DIRTY = 'mneme.settings.dirty'
const SETTINGS_SEEN = 'mneme.settings.remoteAt'
// Settings that follow the account. Sidebar layout and open folders stay per device.
const SYNCED_SETTINGS = ['theme', 'accent', 'darkPalette', 'lightPalette', 'customBg', 'customAccent', 'sound', 'correctSound', 'reduceMotion', 'learnShuffle', 'learnPanel', 'learnMatch', 'hiddenHints', 'libraryView', 'librarySort', 'paperDefault'] as const

let currentId: string | null = null
let channel: RealtimeChannel | null = null
let interval: ReturnType<typeof setInterval> | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null
let pullTimer: ReturnType<typeof setTimeout> | null = null
let settingsTimer: ReturnType<typeof setTimeout> | null = null
let applyingSettings = false
let settingsEdits = 0 // bumped on every local change, so a push only clears "dirty" if nothing changed meanwhile
let running: Promise<void> | null = null

const set = useAccount.setState
const remote = () => supabaseRemote(supabase!)

export async function initAccount() {
  if (!supabase) return
  void oauthProviders()
  installHooks()
  const { data } = await supabase.auth.getSession()
  await handleUser(data.session?.user ?? null)
  set({ ready: true })
  supabase.auth.onAuthStateChange((_event, session) => { void handleUser(session?.user ?? null) })
  useSettings.subscribe((s, prev) => {
    if (applyingSettings || !currentId) return
    if (SYNCED_SETTINGS.some((k) => JSON.stringify(s[k]) !== JSON.stringify(prev[k]))) {
      localStorage.setItem(SETTINGS_DIRTY, '1')
      settingsEdits++
      if (settingsTimer) clearTimeout(settingsTimer)
      settingsTimer = setTimeout(() => { pushSettings().catch(() => { /* stays dirty; the next sync retries */ }) }, 1200)
    }
  })
}

async function handleUser(user: User | null) {
  if ((user?.id ?? null) === currentId) { set({ user }); return }
  stop()
  currentId = user?.id ?? null
  set({ user, status: user ? 'syncing' : 'off', error: null })
  if (user) await start(user)
}

async function start(user: User) {
  const owner = localStorage.getItem(OWNER_KEY)
  if (owner !== user.id) {
    // Data left by a different account never gets uploaded into this one.
    if (owner) await wipeLocal()
    else await markAll() // first sign-in on this device: upload what the guest made
    localStorage.setItem(OWNER_KEY, user.id)
  }
  setOnDirty(schedulePush)
  loadProfile().catch(() => { /* shown from cache; retried on the account page */ })
  await syncNow()
  subscribe(user.id)
  interval = setInterval(() => { void syncNow() }, 60_000)
  window.addEventListener('online', onWake)
  document.addEventListener('visibilitychange', onVisible)
}

function stop() {
  setOnDirty(null)
  if (channel) { void supabase?.removeChannel(channel); channel = null }
  if (interval) clearInterval(interval)
  interval = null
  window.removeEventListener('online', onWake)
  document.removeEventListener('visibilitychange', onVisible)
}

const onWake = () => { void syncNow() }
const onVisible = () => { if (document.visibilityState === 'visible') void syncNow() }

function subscribe(uid: string) {
  if (!supabase) return
  channel = supabase.channel(`mneme-${uid}`)
  for (const t of [...SPECS.map((s) => s.remote), 'user_settings']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `user_id=eq.${uid}` }, () => schedulePull(t === 'user_settings'))
  }
  channel.subscribe()
}

function schedulePush() {
  if (!currentId) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => { void syncNow(false) }, 1200)
}
function schedulePull(settings: boolean) {
  if (pullTimer) clearTimeout(pullTimer)
  pullTimer = setTimeout(() => { void (settings ? pullSettings() : syncNow()) }, 400)
}

/** Push pending changes, then pull everything new. Runs one at a time. */
export async function syncNow(withPull = true): Promise<void> {
  if (!supabase || !currentId) return
  if (running) { await running; if (!pendingCount() && !withPull) return }
  if (!navigator.onLine) { set({ status: 'offline' }); return }
  running = (async () => {
    set({ status: 'syncing' })
    try {
      // Out of space: new data waits here, but deletions went up and other devices' changes still come in.
      let full = false
      try { await push(remote()) } catch (e) { if (!isStorageFull(e)) throw e; full = true }
      if (withPull) { await pull(remote()); await pullSettings() }
      set({ status: full ? 'full' : 'synced', lastSync: Date.now(), error: null })
      loadStorage(full ? 0 : 60_000).catch(() => { /* shown again on the next sync */ })
    } catch (e) {
      set({ status: navigator.onLine ? 'error' : 'offline', error: e instanceof Error ? e.message : String(e) })
    }
  })()
  try { await running } finally { running = null }
}

async function pushSettings() {
  if (!supabase || !currentId) return
  const edits = settingsEdits
  const s = useSettings.getState()
  const doc = Object.fromEntries(SYNCED_SETTINGS.map((k) => [k, s[k]]))
  const { data, error } = await supabase.from('user_settings').upsert({ id: 'settings', doc, deleted: false }, { onConflict: 'user_id,id' }).select('updated_at').single()
  if (error) throw error
  localStorage.setItem(SETTINGS_SEEN, data.updated_at)
  if (edits === settingsEdits) localStorage.removeItem(SETTINGS_DIRTY)
}

async function pullSettings() {
  if (!supabase || !currentId) return
  // Unsent local changes win; they go up instead.
  if (localStorage.getItem(SETTINGS_DIRTY)) { await pushSettings(); return }
  const { data, error } = await supabase.from('user_settings').select('doc,updated_at').eq('id', 'settings').maybeSingle()
  if (error) throw error
  if (!data) { await pushSettings(); return }
  if (data.updated_at === localStorage.getItem(SETTINGS_SEEN)) return // nothing new (often the echo of our own push)
  if (localStorage.getItem(SETTINGS_DIRTY)) return // changed while we were fetching; the scheduled push sends it
  applyingSettings = true
  try { useSettings.getState().set(data.doc as Partial<ReturnType<typeof useSettings.getState>>) } finally { applyingSettings = false }
  localStorage.setItem(SETTINGS_SEEN, data.updated_at)
}

/** Clear this device's copy. The account's data stays on the server. Hooks don't fire for clear(). */
async function wipeLocal() {
  await db.transaction('rw', db.tables, async () => { for (const t of db.tables) await t.clear() })
  resetSyncState()
  localStorage.removeItem(SETTINGS_DIRTY)
  localStorage.removeItem(SETTINGS_SEEN)
  localStorage.removeItem('mneme.settings.syncedAt') // older key
}

export async function sendSignInEmail(email: string) {
  if (!supabase) throw new Error('Accounts are not set up in this build.')
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  if (error) throw error
}

export type OAuthProvider = 'github' | 'google'
let providers: Promise<Record<string, boolean>> | null = null
export const oauthProviders = () => (providers ??= enabledProviders())

/** Leaves the page for the provider; Supabase sends the user back here signed in. */
export async function signInWithProvider(provider: OAuthProvider) {
  if (!supabase) throw new Error('Accounts are not set up in this build.')
  const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${location.origin}/account` } })
  if (error) throw error
}

export async function verifyCode(email: string, token: string) {
  if (!supabase) throw new Error('Accounts are not set up in this build.')
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw error
}

/** Upload anything pending, sign out, and remove this device's copy (it stays in the account). */
export async function signOut() {
  if (!supabase) return
  await syncNow(false).catch(() => {})
  await forgetLocally('global')
}

async function forgetLocally(scope: 'global' | 'local') {
  stop()
  await supabase?.auth.signOut({ scope }).catch(() => { /* the session may already be gone */ })
  currentId = null
  await wipeLocal()
  localStorage.removeItem(OWNER_KEY)
  forgetProfile()
  forgetStorage()
  set({ user: null, status: 'off', lastSync: null })
}

// ---------- confirming destructive actions with an emailed code ----------
// Entering the code signs this device in again, which stamps the session with a fresh "otp" method.
// The server's delete function checks for that stamp, so the code is a real check, not just a screen.

export async function sendConfirmCode() {
  const email = useAccount.getState().user?.email
  if (!email) throw new Error('This account has no email address to send a code to.')
  await sendSignInEmail(email)
  return email
}

export async function confirmWithCode(code: string) {
  const email = useAccount.getState().user?.email
  if (!email) throw new Error('This account has no email address.')
  await verifyCode(email, code)
}

/** Delete every deck and its progress, everywhere. Goes through sync as ordinary deletions. Folders and notes stay. */
export async function clearAllDecks(): Promise<number> {
  const n = await db.decks.count()
  await db.transaction('rw', [db.decks, db.items, db.cards, db.records, db.reviews, db.links], async () => {
    for (const t of [db.items, db.cards, db.records, db.reviews, db.links, db.decks] as const) await (t as typeof db.decks).toCollection().delete()
  })
  await syncNow(false)
  return n
}

/** Permanently delete the account and everything in it, then clear this device. */
export async function deleteAccount() {
  if (!supabase) return
  await removeAvatars()
  const { error } = await supabase.rpc('delete_my_account')
  if (error) throw new Error(error.code === '42501' ? 'Confirm with the emailed code again; it has expired.' : error.message)
  await forgetLocally('local')
}

export const unsyncedCount = pendingCount

/** GitHub username when signed in with GitHub, otherwise the part of the email before the @. */
export function displayName(user: User): string {
  const m = user.user_metadata as { user_name?: string; preferred_username?: string; full_name?: string } | undefined
  return m?.user_name ?? m?.preferred_username ?? m?.full_name?.split(' ')[0] ?? user.email?.split('@')[0] ?? 'You'
}
