import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { BETWEEN, paginate } from '../../../sheets/pages'

/** Lines of writing per sheet and the line height, or null when the page isn't in Pages layout. */
export type BreakConfig = { perPage: number; unit: number } | null
type State = { before: Record<number, number>; set: DecorationSet }
export const pageBreakKey = new PluginKey<State>('pageBreaks')
export const RECALC = 'pageBreaksRecalc'

function gaps(doc: PMNode, before: Record<number, number>): DecorationSet {
  const list: Decoration[] = []
  doc.forEach((_node, offset, index) => {
    const px = before[index]
    if (!px) return
    list.push(Decoration.widget(offset, () => {
      const d = document.createElement('div')
      d.className = 'page-gap'
      d.style.height = `${px}px`
      d.contentEditable = 'false'
      d.setAttribute('aria-hidden', 'true')
      return d
    }, { side: -1, key: `gap-${index}-${px}`, ignoreSelection: true }))
  })
  return DecorationSet.create(doc, list)
}

/**
 * Pages layout for the main column: whatever would cross the bottom of a sheet moves to the top of the
 * next one, with space in front of it. The space is a decoration, never part of the document, so it isn't
 * saved, synced or printed (print lays out its own pages).
 */
export const PageBreaks = Extension.create<{ get: () => BreakConfig }>({
  name: 'pageBreaks',
  addOptions: () => ({ get: () => null }),
  addProseMirrorPlugins() {
    const get = this.options.get
    return [new Plugin<State>({
      key: pageBreakKey,
      state: {
        init: () => ({ before: {}, set: DecorationSet.empty }),
        apply(tr, old) {
          const next = tr.getMeta(pageBreakKey) as Record<number, number> | undefined
          if (next) return { before: next, set: gaps(tr.doc, next) }
          return { before: old.before, set: old.set.map(tr.mapping, tr.doc) }
        },
      },
      props: { decorations: (state) => pageBreakKey.getState(state)?.set },
      view(view) {
        let timer: ReturnType<typeof setTimeout> | undefined
        const measure = () => {
          if (view.isDestroyed) return
          const cfg = get()
          let next: Record<number, number> = {}
          if (cfg) {
            const heights: number[] = []
            view.state.doc.forEach((_n, offset) => {
              const el = view.nodeDOM(offset) as HTMLElement | null
              heights.push(el?.offsetHeight ?? cfg.unit)
            })
            next = paginate(heights, cfg.perPage * cfg.unit, BETWEEN * cfg.unit).before
            for (const k of Object.keys(next)) next[Number(k)] = Math.round(next[Number(k)])
          }
          const cur = pageBreakKey.getState(view.state)!.before
          if (JSON.stringify(next) !== JSON.stringify(cur)) view.dispatch(view.state.tr.setMeta(pageBreakKey, next).setMeta('addToHistory', false))
        }
        const soon = () => { clearTimeout(timer); timer = setTimeout(measure, 50) }
        // Pictures and fonts that finish loading change heights without a transaction.
        const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(soon)
        ro?.observe(view.dom)
        soon()
        return { update: soon, destroy: () => { clearTimeout(timer); ro?.disconnect() } }
      },
    })]
  },
})
