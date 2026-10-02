import { create } from 'zustand'
import { db, type LocalImage } from './db'
import { fitWithin } from '../sheets/image'
import { useSettings } from '../settings/store'

// Pictures on pages. Each one is shrunk and kept in this browser (IndexedDB), then uploaded to Imgur
// anonymously with Mneme's client id. The page keeps the Imgur link and its delete code, so any of your
// devices can show it and deleting it removes it from Imgur. Without a client id, or offline, a picture
// stays on the device it was added on and uploads later.

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

type Status = 'uploading' | 'failed'
export const useUploads = create<Record<string, Status>>(() => ({}))
const inflight = new Map<string, Promise<{ url: string; hash: string } | null>>()

/** Uploads a local picture (once, however many views ask). Null when it can't yet: no client id, no consent, offline. */
export function uploadImage(id: string): Promise<{ url: string; hash: string } | null> {
  if (!CLIENT_ID || !useSettings.getState().imgurConsent || !navigator.onLine) return Promise.resolve(null)
  const running = inflight.get(id)
  if (running) return running
  const job = (async () => {
    const img = await db.images.get(id)
    if (!img) return null
    if (img.url && img.deleteHash) return { url: img.url, hash: img.deleteHash }
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
      useUploads.setState((s) => { const n = { ...s }; delete n[id]; return n })
      return { url, hash }
    } catch {
      useUploads.setState({ [id]: 'failed' })
      return null
    } finally {
      inflight.delete(id)
    }
  })()
  inflight.set(id, job)
  return job
}

/** Removes a picture from Imgur. Best effort: a failure leaves an unlisted picture nobody links to. */
export async function deleteRemote(hash: string | null | undefined) {
  if (!CLIENT_ID || !hash || !/^[A-Za-z0-9]+$/.test(hash)) return
  try { await fetch(`https://api.imgur.com/3/image/${hash}`, { method: 'DELETE', headers: { Authorization: `Client-ID ${CLIENT_ID}` } }) } catch { /* offline */ }
}

type Node = { type?: string; attrs?: Record<string, unknown>; content?: Node[] }
/** Every picture in a document: its local id and Imgur delete code. */
export function imagesIn(doc: unknown): { local: string | null; hash: string | null }[] {
  const out: { local: string | null; hash: string | null }[] = []
  const walk = (n: Node) => {
    if (n.type === 'image') out.push({ local: (n.attrs?.local as string) ?? null, hash: (n.attrs?.hash as string) ?? null })
    n.content?.forEach(walk)
  }
  if (doc && typeof doc === 'object') walk(doc as Node)
  return out
}

/**
 * A picture deleted from a page goes from Imgur once it's clear it isn't coming back (undo, or it's
 * still in another block of the page) — a little after the undo toast has gone.
 */
export function forgetLater(sheetId: string, local: string | null, hash: string | null) {
  setTimeout(async () => {
    const still = (await db.sheetBlocks.where('sheetId').equals(sheetId).toArray()).some((b) => imagesIn(b.data.doc).some((i) => (local && i.local === local) || (hash && i.hash === hash)))
    if (still) return
    await deleteRemote(hash)
    if (local) await db.images.delete(local)
  }, 15_000)
}

/** A page deleted for good takes its pictures with it, here and on Imgur. */
export async function forgetPageImages(sheetId: string, docs: unknown[]) {
  for (const d of docs) for (const i of imagesIn(d)) void deleteRemote(i.hash)
  await db.images.where('sheetId').equals(sheetId).delete()
}

// One object URL per local picture, shared by every view of it.
const urls = new Map<string, string>()
export async function localUrl(id: string): Promise<string | null> {
  const hit = urls.get(id)
  if (hit) return hit
  const img = await db.images.get(id)
  if (!img) return null
  const u = URL.createObjectURL(img.blob)
  urls.set(id, u)
  return u
}
