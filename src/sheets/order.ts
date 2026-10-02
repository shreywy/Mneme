import type { SheetBlock } from './types'

/** The order a page reads in as one column: top to bottom, then left to right. */
export const readingOrder = (blocks: SheetBlock[]) => [...blocks].sort((a, b) => a.y - b.y || a.x - b.x)

type Node = { type?: string; text?: string; content?: Node[] }
const textOf = (n: Node): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('')

/** The page's first heading, used as its title until the user names it. */
export function titleFrom(doc: unknown): string | null {
  const find = (n: Node): Node | undefined => (n.type === 'heading' ? n : (n.content ?? []).map(find).find(Boolean))
  const h = doc && typeof doc === 'object' ? find(doc as Node) : undefined
  const t = h ? textOf(h).replace(/\s+/g, ' ').trim() : ''
  return t ? t.slice(0, 200) : null
}
