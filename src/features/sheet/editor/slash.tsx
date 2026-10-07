import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { Extension, ReactRenderer } from '@tiptap/react'
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import { searchInserts, searchTitles, type InsertItem } from '../../../sheets/insert'
import { db } from '../../../data/db'
import { useRecents, useSheetUI } from '../store'
import { runInsert } from './commands'

// The slash menu: type / and keep typing to filter, arrows and Enter to pick. Same list as Insert.
// The [[ menu works the same way, over your pages.

type Item = { id: string; label: string; group: string; hint?: string }
type ListProps = { items: Item[]; command: (item: Item) => void; field?: HTMLElement; label: string; empty: string }
type ListHandle = { onKeyDown: (e: KeyboardEvent) => boolean }

const SlashList = forwardRef<ListHandle, ListProps>(function SlashList({ items, command, field, label, empty }, ref) {
  const [at, setAt] = useState(0)
  // Screen readers follow the highlighted choice while focus stays in the text (combobox pattern).
  useEffect(() => {
    if (!field) return
    field.setAttribute('aria-controls', 'slash-list')
    field.setAttribute('aria-expanded', 'true')
    if (items[at]) field.setAttribute('aria-activedescendant', `slash-opt-${at}`); else field.removeAttribute('aria-activedescendant')
  }, [field, at, items])
  useEffect(() => () => { for (const a of ['aria-controls', 'aria-expanded', 'aria-activedescendant']) field?.removeAttribute(a) }, [field])
  useEffect(() => setAt(0), [items])
  useImperativeHandle(ref, () => ({
    onKeyDown: (e) => {
      if (e.key === 'ArrowDown') { setAt((i) => (i + 1) % Math.max(items.length, 1)); return true }
      if (e.key === 'ArrowUp') { setAt((i) => (i - 1 + items.length) % Math.max(items.length, 1)); return true }
      if (e.key === 'Enter' || e.key === 'Tab') { if (items[at]) command(items[at]); return !!items[at] }
      return false
    },
  }), [items, at, command])
  if (!items.length) return <div className="slash-menu"><div className="slash-none">{empty}</div></div>
  let group = ''
  return (
    <div className="slash-menu" role="listbox" aria-label={label} id="slash-list">
      {items.map((it, i) => {
        const head = it.group !== group ? (group = it.group) : null
        return (
          <div key={it.id}>
            {head && <div className="slash-group">{head}</div>}
            <button role="option" id={`slash-opt-${i}`} aria-selected={i === at} className={i === at ? 'on' : ''} onMouseEnter={() => setAt(i)} onMouseDown={(e) => { e.preventDefault(); command(it) }}>
              <span className="l">{it.label}</span>{it.hint && <span className="k">{it.hint}</span>}
            </button>
          </div>
        )
      })}
    </div>
  )
})

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [Suggestion<InsertItem, InsertItem>({
      editor: this.editor,
      char: '/',
      allowSpaces: false,
      // In code a / is just a slash.
      allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
      items: ({ query }) => searchInserts(query).slice(0, 14),
      command: ({ editor, range, props }) => {
        editor.chain().focus().deleteRange(range).run()
        useRecents.getState().push(props.id)
        void runInsert(editor, props.id)
      },
      render: popup('Insert', 'Nothing called that'),
    })]
  },
})

/** Where a menu like this sits: under the text being typed, or above it near the bottom of the window. */
function popup<T extends Item>(label: string, empty: string) {
  return () => {
    let r: ReactRenderer<ListHandle, ListProps> | null = null
    const place = (p: SuggestionProps<T, T>) => {
      const box = p.clientRect?.()
      if (!box || !r) return
      const el = r.element as HTMLElement
      const below = box.bottom + 6, room = window.innerHeight - below
      el.style.left = `${Math.min(box.left, window.innerWidth - 280)}px`
      el.style.top = room < 300 ? `${Math.max(8, box.top - 6 - Math.min(340, el.offsetHeight || 340))}px` : `${below}px`
    }
    return {
      onStart: (p: SuggestionProps<T, T>) => {
        r = new ReactRenderer(SlashList, { props: { items: p.items, command: p.command as (i: Item) => void, field: p.editor.view.dom, label, empty }, editor: p.editor })
        const el = r.element as HTMLElement
        el.classList.add('slash-pop')
        document.body.appendChild(el)
        place(p)
      },
      onUpdate: (p: SuggestionProps<T, T>) => { r?.updateProps({ items: p.items, command: p.command as (i: Item) => void, field: p.editor.view.dom, label, empty }); place(p) },
      onKeyDown: (p: SuggestionKeyDownProps) => {
        if (p.event.key === 'Escape') { r?.destroy(); (r?.element as HTMLElement | undefined)?.remove(); r = null; return true }
        return r?.ref?.onKeyDown(p.event) ?? false
      },
      onExit: () => { (r?.element as HTMLElement | undefined)?.remove(); r?.destroy(); r = null },
    }
  }
}

type PageItem = Item & { title: string }

/** Type [[ and part of a title to link one of your pages inside the sentence. */
export const PageLinkSuggest = Extension.create({
  name: 'pageLinkSuggest',
  addProseMirrorPlugins() {
    return [Suggestion<PageItem, PageItem>({
      editor: this.editor,
      char: '[[',
      pluginKey: new PluginKey('pageLinkSuggest'),
      allowSpaces: true,
      allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
      items: async ({ query }) => {
        const here = useSheetUI.getState().sheetId
        const rows = (await db.sheets.toArray()).filter((s) => !s.archived && !s.deletedAt && !s.hidden)
        const byId = new Map(rows.map((r) => [r.id, r]))
        return searchTitles(rows.filter((s) => s.id !== here), query).slice(0, 12)
          .map((s) => ({ id: s.id, title: s.title, label: s.title, group: 'Pages', hint: s.parentId ? byId.get(s.parentId)?.title : undefined }))
      },
      command: ({ editor, range, props }) => {
        editor.chain().focus().deleteRange(range).insertContent([{ type: 'pageLink', attrs: { id: props.id, title: props.title } }, { type: 'text', text: ' ' }]).run()
      },
      render: popup('Link to page', 'No page called that'),
    })]
  },
})
