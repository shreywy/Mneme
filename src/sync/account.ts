import type { RealtimeChannel, Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { db } from '../data/db'
import { useSettings } from '../settings/store'
import { installHooks, markAll, pendingCount, pull, push, resetSyncState, setOnDirty, SPECS } from './engine'
import { enabledProviders, supabase, supabaseRemote } from './supabase'
import { forgetProfile, loadProfile, removeAvatars } from './profile'
import { forgetAiKey, pullAiKey } from '../ai/key'
import { removeAllPictures } from './pictures'
import { forgetStorage, isStorageFull, loadStorage } from './storage'

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'offline' | 'error' | 'full'
/** `secondStep`: signed in, but the account has an authenticator and this session hasn't used it yet. Nothing syncs until it has. */
type Account = { ready: boolean; user: User | null; status: SyncStatus; lastSync: number | null; error: string | null; secondStep: boolean }
export const useAccount = create<Account>(() => ({ ready: !supabase, user: null, status: 'off', lastSync: null, error: null, secondStep: false }))
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
  await handleSession(data.session)
  set({ ready: true })
  supabase.auth.onAuthStateChange((_event, session) => { void handleSession(session) })
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

/**
 * Whether this session still needs the authenticator code: the account has a verified authenticator and
 * the session's token says it hasn't been used. Read from the session itself, because calling the auth
 * client from inside its own state-change callback can deadlock.
 */
export function needsSecondStep(session: Session | null): boolean {
  if (!session || !(session.user.factors ?? []).some((f) => f.status === 'verified')) return false
  try {
    const part = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return (JSON.parse(atob(part)) as { aal?: string }).aal !== 'aal2'
  } catch { return true }
}

async function handleSession(session: Session | null) {
  const user = session?.user ?? null
  // The server refuses everything until the second step, so don't sync (or wipe and re-upload) before it.
  if (needsSecondStep(session)) {
    if (currentId) { stop(); currentId = null }
    set({ user, secondStep: true, status: 'off' })
    return
  }
  set({ secondStep: false })
  await handleUser(user)
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
      if (withPull) { await pull(remote()); await pullSettings(); await pullAiKey().catch(() => { /* next pull */ }) }
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
  forgetAiKey()
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

// ---------- two-step sign-in (authenticator app) ----------

export type Authenticator = { id: string; name: string; createdAt: string }

/** This account's authenticators. */
export async function listAuthenticators(): Promise<Authenticator[]> {
  if (!supabase) return []
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return data.totp.map((f) => ({ id: f.id, name: f.friendly_name ?? 'Authenticator app', createdAt: f.created_at }))
}

/** Starts adding an authenticator: returns the QR code (an image URL) and the secret to type in instead. */
export async function startAuthenticator(): Promise<{ id: string; qr: string; secret: string }> {
  if (!supabase) throw new Error('Accounts are not set up in this build.')
  // Half-finished ones from earlier attempts would block a new one.
  const { data: all } = await supabase.auth.mfa.listFactors()
  for (const f of all?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
  const n = (all?.totp.length ?? 0) + 1
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: n === 1 ? 'Authenticator app' : `Authenticator app ${n}`, issuer: 'Mneme' })
  if (error) throw error
  const qr = data.totp.qr_code.startsWith('data:') ? data.totp.qr_code : `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`
  return { id: data.id, qr, secret: data.totp.secret }
}

/** Checks a 6-digit code against an authenticator (finishing setup, or the second step at sign-in). */
export async function checkAuthenticatorCode(code: string, factorId?: string) {
  if (!supabase) return
  const id = factorId ?? (await listAuthenticators())[0]?.id
  if (!id) throw new Error('This account has no authenticator.')
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: code.replace(/\s/g, '') })
  if (error) throw new Error(/invalid|expired/i.test(error.message) ? 'That code didn’t match. Check the time on your phone, then try the newest code.' : error.message)
}

export async function cancelAuthenticator(factorId: string) {
  await supabase?.auth.mfa.unenroll({ factorId })
}

export async function removeAuthenticator(factorId: string) {
  if (!supabase) return
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw error
  await supabase.auth.refreshSession() // so this session's token stops listing the removed authenticator
}

/** Permanently delete the account and everything in it, then clear this device. */
export async function deleteAccount() {
  if (!supabase) return
  await removeAvatars()
  await removeAllPictures()
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
