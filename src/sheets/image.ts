// Pictures on pages. Mneme never stores the picture itself on its servers: it's shrunk, kept on the
// device, and uploaded to Imgur; the page only keeps the link.

export const MAX_SIDE = 2000

/** Size that fits within `max` px on the longest side (never larger than the original). */
export function fitWithin(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.round(w * k), h: Math.round(h * k) }
}

// SVG is left out on purpose: it's a document that can hold scripts, and Imgur doesn't take it anyway.
const OK = /^image\/(png|jpeg|gif|webp|avif|bmp)$/
/** The pictures among pasted or dropped files. */
export const imageFiles = (files: ArrayLike<File>) => Array.from(files).filter((f) => OK.test(f.type))

type Node = { type?: string; attrs?: Record<string, unknown>; content?: Node[] }
/**
 * A copy of a document fit to leave the account (a share link): no Imgur delete codes, which would let
 * anyone remove the picture, and no pictures that only exist on one device.
 */
export function publicDoc(doc: unknown): unknown {
  const walk = (n: Node): Node | null => {
    if (n.type === 'image') {
      if (!n.attrs?.src) return null
      return { ...n, attrs: { ...n.attrs, hash: null, local: null } }
    }
    return n.content ? { ...n, content: n.content.map(walk).filter((x): x is Node => !!x) } : n
  }
  return doc && typeof doc === 'object' ? walk(doc as Node) : doc
}
