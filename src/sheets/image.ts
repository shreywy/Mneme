// Pictures on pages. Each one is shrunk and kept on the device. Signed in, it's also stored in the
// account's private `pictures` folder, and the page keeps its path (`stored`). Share links get signed
// links that expire instead of the path.

export const MAX_SIDE = 2000

/** Size that fits within `max` px on the longest side (never larger than the original). */
export function fitWithin(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.round(w * k), h: Math.round(h * k) }
}

// SVG is left out on purpose: it's a document that can hold scripts.
const OK = /^image\/(png|jpeg|gif|webp|avif|bmp)$/
/** The pictures among pasted or dropped files. */
export const imageFiles = (files: ArrayLike<File>) => Array.from(files).filter((f) => OK.test(f.type))

const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/avif': 'avif' }
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PATH = new RegExp(`^${UUID}/${UUID}\.(webp|jpg|png|gif|avif)$`)

/** Where a picture lives in the account's folder: `<user id>/<picture id>.<ext>`. Null for a type the bucket won't take. */
export function picturePath(userId: string, pictureId: string, type: string): string | null {
  const p = `${userId}/${pictureId}.${EXT[type] ?? ''}`
  return PATH.test(p) ? p : null
}
export const isPicturePath = (p: unknown): p is string => typeof p === 'string' && PATH.test(p)

const IMGUR = /^https:\/\/i\.imgur\.com\/[A-Za-z0-9]+\.[a-z]+$/
/**
 * Whether a picture link in someone else's page may load: an Imgur picture, or a signed link to this
 * Mneme's own picture store. Anything else could make the viewer's browser call a server of the sender's choosing.
 */
export function isSafePictureUrl(src: unknown, supabaseUrl = ''): src is string {
  if (typeof src !== 'string') return false
  if (IMGUR.test(src)) return true
  const origin = supabaseUrl.replace(/\/+$/, '')
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(origin) || !src.startsWith(`${origin}/storage/v1/object/sign/pictures/`)) return false
  const rest = src.slice(`${origin}/storage/v1/object/sign/pictures/`.length)
  const [path, query, ...more] = rest.split('?')
  return !more.length && PATH.test(path) && /^token=[A-Za-z0-9._-]+$/.test(query ?? '')
}

type Node = { type?: string; attrs?: Record<string, unknown>; content?: Node[] }
/** Every stored picture path in a document. */
export function storedIn(doc: unknown): string[] {
  const out: string[] = []
  const walk = (n: Node) => { if (n.type === 'image' && isPicturePath(n.attrs?.stored)) out.push(n.attrs.stored); n.content?.forEach(walk) }
  if (doc && typeof doc === 'object') walk(doc as Node)
  return out
}

/**
 * A copy of a document fit to leave the account (a share link). A stored picture gets its signed link
 * from `signed`; its path, Imgur delete codes (which would let anyone remove the picture) and local ids
 * are dropped, and so are pictures that only exist on one device.
 */
export function publicDoc(doc: unknown, signed: Record<string, string> = {}): unknown {
  const walk = (n: Node): Node | null => {
    if (n.type === 'image') {
      const stored = n.attrs?.stored as string | undefined
      const src = (stored && signed[stored]) || n.attrs?.src
      if (!src) return null
      return { ...n, attrs: { ...n.attrs, src, stored: null, hash: null, local: null } }
    }
    return n.content ? { ...n, content: n.content.map(walk).filter((x): x is Node => !!x) } : n
  }
  return doc && typeof doc === 'object' ? walk(doc as Node) : doc
}
