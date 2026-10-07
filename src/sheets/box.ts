import type { SheetBlock } from './types'

type Kid = { id: string; title: string; box?: string; rank?: number }

/**
 * Boxes as plain text blocks (title, then the page titles as a list), for printing and sharing: those
 * only know text blocks, and a share doesn't carry the sub-pages themselves.
 */
export function boxesAsText(blocks: SheetBlock[], kids: Kid[]): SheetBlock[] {
  return blocks.map((b) => {
    if (b.kind !== 'box') return b
    const titles = kids.filter((k) => k.box === b.id)
      .sort((x, y) => (x.rank ?? Infinity) - (y.rank ?? Infinity) || x.title.localeCompare(y.title, undefined, { numeric: true }))
      .map((k) => k.title)
    const text = (t: string) => [{ type: 'text', text: t }]
    const content: object[] = [{ type: 'heading', attrs: { level: 3 }, content: text(b.data.label || 'Pages') }]
    if (titles.length) content.push({ type: 'bulletList', content: titles.map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: text(t) }] })) })
    return { ...b, kind: 'text', data: { doc: { type: 'doc', content } } }
  })
}
