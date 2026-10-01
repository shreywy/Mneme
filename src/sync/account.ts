import type { RealtimeChannel, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { db } from '../data/db'
import { useSettings } from '../settings/store'
import { installHooks, markAll, pendingCount, pull, push, resetSyncState, setOnDirty, SPECS } from './engine'
import { supabase, supabaseRemote } from './supabase'

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'offline' | 'error'
type Account = { ready: boolean; user: User | null; status: SyncStatus; lastSync: number | null; error: string | null }
export const useAccount = create<Account>(() => ({ ready: !supabase, user: null, status: 'off', lastSync: null, error: null }))
export const accountsEnabled = !!supabase

const OWNER_KEY = 'mneme.sync.owner'
const SETTINGS_TS = 'mneme.settings.syncedAt'
// Settings that follow the account. Sidebar layout and open folders stay per device.
const SYNCED_SETTINGS = ['theme', 'accent', 'sound', 'correctSound', 'reduceMotion', 'learnShuffle', 'learnPanel', 'learnMatch', 'hiddenHints', 'libraryView', 'librarySort'] as const

let currentId: string | null = null
let channel: RealtimeChannel | null = null
let interval: ReturnType<typeof setInterval> | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null
let pullTimer: ReturnType<typeof setTimeout> | null = null
let settingsTimer: ReturnType<typeof setTimeout> | null = null
let applyingSettings = false
let running: Promise<void> | null = null

const set = useAccount.setState
const remote = () => supabaseRemote(supabase!)

export async function initAccount() {
  if (!supabase) return
  installHooks()
  const { data } = await supabase.auth.getSession()
  await handleUser(data.session?.user ?? null)
  set({ ready: true })
  supabase.auth.onAuthStateChange((_event, session) => { void handleUser(session?.user ?? null) })
  useSettings.subscribe((s, prev) => {
    if (applyingSettings || !currentId) return
    if (SYNCED_SETTINGS.some((k) => JSON.stringify(s[k]) !== JSON.stringify(prev[k]))) {
      localStorage.setItem(SETTINGS_TS, String(Date.now()))
      if (settingsTimer) clearTimeout(settingsTimer)
      settingsTimer = setTimeout(() => { void pushSettings() }, 1200)
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
      await push(remote())
      if (withPull) { await pull(remote()); await pullSettings() }
      set({ status: 'synced', lastSync: Date.now(), error: null })
    } catch (e) {
      set({ status: navigator.onLine ? 'error' : 'offline', error: e instanceof Error ? e.message : String(e) })
    }
  })()
  try { await running } finally { running = null }
}

async function pushSettings() {
  if (!supabase || !currentId) return
  const s = useSettings.getState()
  const doc = Object.fromEntries(SYNCED_SETTINGS.map((k) => [k, s[k]]))
  await supabase.from('user_settings').upsert({ id: 'settings', doc, deleted: false }, { onConflict: 'user_id,id' })
}

async function pullSettings() {
  if (!supabase || !currentId) return
  const { data } = await supabase.from('user_settings').select('doc,updated_at').eq('id', 'settings').maybeSingle()
  const localTs = Number(localStorage.getItem(SETTINGS_TS) ?? 0)
  const remoteTs = data ? Date.parse(data.updated_at) : 0
  if (data && remoteTs > localTs) {
    applyingSettings = true
    try { useSettings.getState().set(data.doc as Partial<ReturnType<typeof useSettings.getState>>) } finally { applyingSettings = false }
    localStorage.setItem(SETTINGS_TS, String(remoteTs))
  } else if (!data || localTs > remoteTs) {
    await pushSettings()
  }
}

/** Clear this device's copy. The account's data stays on the server. Hooks don't fire for clear(). */
async function wipeLocal() {
  await db.transaction('rw', db.tables, async () => { for (const t of db.tables) await t.clear() })
  resetSyncState()
  localStorage.removeItem(SETTINGS_TS)
}

export async function sendSignInEmail(email: string) {
  if (!supabase) throw new Error('Accounts are not set up in this build.')
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin, shouldCreateUser: true } })
  if (error) throw error
}

/** Leaves the page for GitHub; Supabase sends the user back here signed in. */
export async function signInWithGitHub() {
  if (!supabase) throw new Error('Accounts are not set up in this build.')
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: location.origin } })
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
  stop()
  await supabase.auth.signOut()
  currentId = null
  await wipeLocal()
  localStorage.removeItem(OWNER_KEY)
  set({ user: null, status: 'off', lastSync: null })
}

export const unsyncedCount = pendingCount
