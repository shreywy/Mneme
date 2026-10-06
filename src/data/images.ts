import { create } from 'zustand'
import { db, type LocalImage } from './db'
import { fitWithin } from '../sheets/image'
import { useSettings } from '../settings/store'
import { getPicture, PicturesFull, putPicture, removePictures, signedIn } from '../sync/pictures'

// Pictures on pages. Each one is shrunk and kept in this browser (IndexedDB). Signed in, it's then
// stored in the account's private picture folder and the page keeps its path, so your other devices can
// download it. Signed out, it can go to Imgur instead once this build has an Imgur client id (the page
// keeps the link and its delete code). Otherwise, or offline, it stays on this device and goes up later.

const CLIENT_ID = (import.meta.env.VITE_IMGUR_CLIENT_ID as string | undefined)?.trim() || ''
export const imgurReady = () => !!CLIENT_ID

/** Shrinks to 2000 px on the longest side, as WebP (JPEG where WebP isn't available). Small GIFs stay as they are, so they keep moving. */
export async function shrink(file: Blob): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file)
  const { w, h } = fitWithin(bmp.width, bmp.height)
  if (file.type === 'image/gif' && file.size < 4_000_000) { bmp.close(); return { blob: file, w, h } }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const as = (type: string) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, 0.86))
  const webp = await as('image/webp')
  const blob = webp?.type === 'image/webp' ? webp : (await as('image/jpeg'))!
  return { blob, w, h }
}

/** Keeps a picture on this device for a page. Returns its local id and size. */
export async function addImage(sheetId: string, file: Blob): Promise<LocalImage> {
  const { blob, w, h } = await shrink(file)
  const row: LocalImage = { id: crypto.randomUUID(), sheetId, blob, type: blob.type, w, h, createdAt: Date.now() }
  await db.images.add(row)
  return row
}

type Status = 'uploading' | 'failed' | 'full'
export const useUploads = create<Record<string, Status>>(() => ({}))
/** What the page keeps once a picture is up: its path in your folder, or an Imgur link and delete code. */
export type Uploaded = { stored: string } | { src: string; hash: string }
const inflight = new Map<string, Promise<Uploaded | null>>()
const done = (id: string) => useUploads.setState((s) => { const n = { ...s }; delete n[id]; return n })

/** Uploads a local picture (once, however many views ask). Null when it can't yet: signed out with no Imgur, offline, or full. */
export function uploadImage(id: string): Promise<Uploaded | null> {
  if (!navigator.onLine) return Promise.resolve(null)
  const running = inflight.get(id)
  if (running) return running
  const job = (async (): Promise<Uploaded | null> => {
    const img = await db.images.get(id)
    if (!img) return null
    if (await signedIn()) {
      useUploads.setState({ [id]: 'uploading' })
      try {
        const stored = await putPicture(id, img.blob)
        done(id)
        return { stored }
      } catch (e) {
        useUploads.setState({ [id]: e instanceof PicturesFull ? 'full' : 'failed' })
        return null
      }
    }
    if (!CLIENT_ID || !useSettings.getState().imgurConsent) return null
    if (img.url && img.deleteHash) return { src: img.url, hash: img.deleteHash }
    useUploads.setState({ [id]: 'uploading' })
    try {
      const body = new FormData()
      body.append('image', img.blob)
      body.append('type', 'file')
      const res = await fetch('https://api.imgur.com/3/image', { method: 'POST', headers: { Authorization: `Client-ID ${CLIENT_ID}` }, body })
      const json = (await res.json()) as { data?: { link?: string; deletehash?: string } }
      const url = json.data?.link, hash = json.data?.deletehash
      if (!res.ok || !url || !hash || !/^https:\/\/i\.imgur\.com\//.test(url)) throw new Error('upload failed')
      await db.images.update(id, { url, deleteHash: hash })
      done(id)
      return { src: url, hash }
    } catch {
      useUploads.setState({ [id]: 'failed' })
      return null
    }
  })().finally(() => inflight.delete(id))
  inflight.set(id, job)
  return job
}

/** Removes a picture from your folder or Imgur. Best effort: a failure leaves a file nobody links to. */
export async function deleteRemote(hash: string | null | undefined, stored?: string | null) {
  if (stored) await removePictures([stored])
  if (!CLIENT_ID || !hash || !/^[A-Za-z0-9]+$/.test(hash)) return
  try { await fetch(`https://api.imgur.com/3/image/${hash}`, { method: 'DELETE', headers: { Authorization: `Client-ID ${CLIENT_ID}` } }) } catch { /* offline */ }
}

type Node = { type?: string; attrs?: Record<string, unknown>; content?: Node[] }
export type PictureRef = { local: string | null; hash: string | null; stored: string | null }
/** Every picture in a document: its local id, stored path and Imgur delete code. */
export function imagesIn(doc: unknown): PictureRef[] {
  const out: PictureRef[] = []
  const walk = (n: Node) => {
    if (n.type === 'image') out.push({ local: (n.attrs?.local as string) ?? null, hash: (n.attrs?.hash as string) ?? null, stored: (n.attrs?.stored as string) ?? null })
    n.content?.forEach(walk)
  }
  if (doc && typeof doc === 'object') walk(doc as Node)
  return out
}

const refKey = (i: PictureRef) => i.stored ?? i.hash ?? i.local
/** Every picture still on a page on this device (any page: a picture can be copied from one to another). */
async function picturesInUse(exceptSheet?: string): Promise<Set<string | null>> {
  // ponytail: scans every block on the device; fine for a rare, delayed cleanup.
  const blocks = await db.sheetBlocks.toArray()
  return new Set(blocks.filter((b) => b.sheetId !== exceptSheet).flatMap((b) => imagesIn(b.data.doc).flatMap((i) => [i.local, i.hash, i.stored])).filter(Boolean))
}

/**
 * A picture deleted from a page goes for good once it's clear it isn't coming back (undo, or it's still
 * on this or another page) — a little after the undo toast has gone.
 */
export function forgetLater(local: string | null, hash: string | null, stored: string | null = null) {
  setTimeout(async () => {
    const used = await picturesInUse()
    if ((local && used.has(local)) || (hash && used.has(hash)) || (stored && used.has(stored))) return
    await deleteRemote(hash, stored)
    if (local) await db.images.delete(local)
  }, 15_000)
}

/** A page deleted for good takes its pictures with it, here and in your folder or on Imgur, unless another page still has them. */
export async function forgetPageImages(sheetId: string, docs: unknown[]) {
  const used = await picturesInUse(sheetId)
  for (const d of docs) for (const i of imagesIn(d)) if (!used.has(refKey(i))) void deleteRemote(i.hash, i.stored)
  await db.images.where('sheetId').equals(sheetId).delete()
}

// One object URL per picture, shared by every view of it. A picture this device doesn't have yet is
// downloaded from your folder once and kept, so it shows offline from then on.
const urls = new Map<string, string>()
const fetching = new Map<string, Promise<Blob | null>>()
export async function localUrl(id: string, stored?: string | null, sheetId = ''): Promise<string | null> {
  const hit = urls.get(id)
  if (hit) return hit
  let blob = (await db.images.get(id))?.blob ?? null
  if (!blob && stored) {
    let job = fetching.get(stored)
    if (!job) {
      job = getPicture(stored).then(async (b) => {
        if (b) await db.images.put({ id, sheetId, blob: b, type: b.type, w: 0, h: 0, createdAt: Date.now() })
        return b
      }).finally(() => fetching.delete(stored))
      fetching.set(stored, job)
    }
    blob = await job
  }
  if (!blob) return null
  const u = urls.get(id) ?? URL.createObjectURL(blob)
  urls.set(id, u)
  return u
}
