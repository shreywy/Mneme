import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { TextSelection, type Transaction } from '@tiptap/pm/state'
import { linesFor } from '../../sheets/grid'
import { classifyPaste } from '../../sheets/paste'
import type { InsertId } from '../../sheets/insert'
import type { SheetBlock } from '../../sheets/types'
import { toastAction } from '../../ui/toasts'
import { Icon } from '../../ui/Icons'
import { textExtensions } from './editor/extensions'
import { RECALC, type BreakConfig } from './editor/pagebreaks'
import { applyPaste, growTable, runInsert } from './editor/commands'
import { useRecents, useSheetUI } from './store'

export const INSERT_DRAG = 'application/x-mneme-insert'

type Props = {
  block: SheetBlock
  unit: number
  autoFocus?: boolean
  onDoc: (doc: unknown) => void
  onHeight: (lines: number) => void
  /** Called with the final document; the block may be removed if it's empty. */
  onBlur: (doc: unknown) => void
  /** Pages layout (main column only): where the sheets break. */
  pages?: BreakConfig
  editable?: boolean
}

const LABEL = { table: 'a table', latex: 'an equation', code: 'code', link: 'a link card' } as const

/**
 * One text block. Markdown shortcuts (#, -, 1., [ ], >, ```, ---, $$, $…$), the / menu, smart paste and
 * everything in Insert work here. While it's being edited, the toolbar acts on it.
 */
export function TextBlock({ block, unit, autoFocus, onDoc, onHeight, onBlur, pages = null, editable = true }: Props) {
  // The editor keeps the handlers it was created with, so they read the latest props through a ref.
  const cb = useRef({ onDoc, onHeight, onBlur })
  cb.current = { onDoc, onHeight, onBlur }
  const save = useRef<ReturnType<typeof setTimeout>>(undefined)
  const unsaved = useRef<unknown>(undefined)
  // What this block has saved lately: the database echoes each save back, sometimes late, and an echo of
  // an older save must never be mistaken for a change from another device.
  const sent = useRef<string[]>([])
  const remember = (doc: unknown) => { sent.current = [JSON.stringify(doc), ...sent.current].slice(0, 12); return doc }
  const box = useRef<HTMLDivElement>(null)
  const [plus, setPlus] = useState<number | null>(null)
  const [table, setTable] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const main = block.role === 'main'

  /** The + beside an empty line: where it goes (px from the block's top), or nowhere. */
  const placePlus = (e: Editor) => {
    const { $from, empty } = e.state.selection
    const blank = e.view.hasFocus() && empty && $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0 && $from.depth === 1
    const dom = blank ? (e.view.nodeDOM($from.before()) as HTMLElement | null) : null
    setPlus(dom ? dom.offsetTop : null)
  }
  /** Where the table the cursor is in sits (px within the block), for the + on its edges. */
  const placeTable = (e: Editor) => {
    if (!e.view.hasFocus() || !e.isActive('table')) { setTable(null); return }
    const at = e.view.domAtPos(e.state.selection.from).node
    const el = (at instanceof Element ? at : at.parentElement)?.closest('table') as HTMLElement | null
    if (!el || !box.current) { setTable(null); return }
    let top = 0, left = 0
    for (let n: HTMLElement | null = el; n && n !== box.current; n = n.offsetParent as HTMLElement | null) { top += n.offsetTop; left += n.offsetLeft }
    setTable((t) => (t && t.top === top && t.left === left && t.width === el.offsetWidth && t.height === el.offsetHeight ? t : { top, left, width: el.offsetWidth, height: el.offsetHeight }))
  }
  const report = (e: Editor) => { useSheetUI.setState((s) => ({ tick: s.tick + 1 })); placePlus(e); placeTable(e) }

  const pagesRef = useRef<BreakConfig>(pages)
  pagesRef.current = pages
  const editor = useEditor({
    extensions: textExtensions(main, () => pagesRef.current),
    editable,
    content: (block.data.doc as object | null) ?? '',
    // Focus is placed by the effect below, once the click that made the block is over.
    editorProps: {
      handlePaste: (view, event) => {
        const data = event.clipboardData
        if (!data || data.files.length || view.state.selection.$from.parent.type.spec.code) return false
        let lang: string | undefined
        try { lang = JSON.parse(data.getData('vscode-editor-data') || '{}').mode } catch { lang = undefined }
        const text = data.getData('text/plain').replace(/\r\n?/g, '\n')
        const hit = classifyPaste({ text, origin: location.origin, editorLanguage: lang })
        const ed = editorRef.current
        if (!hit || !ed) return false
        // Remember what the paste made, and keep that range current through later typing, so "Paste as
        // plain text" swaps exactly that and nothing typed since.
        const start = ed.state.selection.from
        applyPaste(ed, hit)
        let range = { from: Math.min(start, ed.state.selection.from), to: ed.state.selection.from }
        const track = ({ transaction }: { transaction: Transaction }) => {
          range = { from: transaction.mapping.map(range.from, -1), to: transaction.mapping.map(range.to, 1) }
        }
        ed.on('transaction', track)
        setTimeout(() => ed.off('transaction', track), 7000)
        toastAction(`Pasted as ${LABEL[hit.kind]}`, {
          label: 'Paste as plain text',
          run: () => {
            ed.off('transaction', track)
            if (ed.isDestroyed) return
            ed.chain().focus().insertContentAt(range, text.split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] }))).run()
          },
        })
        return true
      },
      handleDrop: (view, event) => {
        const id = event.dataTransfer?.getData(INSERT_DRAG) as InsertId | undefined
        const ed = editorRef.current
        if (!id || !ed) return false
        event.preventDefault()
        event.stopPropagation()
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })
        if (at) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at.pos))))
        useRecents.getState().push(id)
        void runInsert(ed, id)
        return true
      },
    },
    onUpdate: ({ editor: e }) => {
      clearTimeout(save.current)
      unsaved.current = e.getJSON()
      save.current = setTimeout(() => { save.current = undefined; unsaved.current = undefined; cb.current.onDoc(remember(e.getJSON())) }, 400)
      report(e)
    },
    onSelectionUpdate: ({ editor: e }) => report(e),
    onFocus: ({ editor: e }) => { useSheetUI.setState({ editor: e, lastEditor: e, blockId: block.id }); report(e) },
    onBlur: ({ editor: e, event }) => {
      // The toolbar keeps acting on this block until you go somewhere else. Focus moving to "nowhere" (a
      // dropdown opening, the window losing focus) doesn't count: dropping the block then disabled the
      // toolbar and snapped its font and size lists shut. Clicking the paper or another block does count.
      const to = event.relatedTarget as Element | null
      if (to && !to.closest?.('.sheet-toolbar, .insert-panel')) useSheetUI.setState((s) => (s.editor === e ? { editor: null } : {}))
      setPlus(null)
      setTable(null)
      clearTimeout(save.current); save.current = undefined; unsaved.current = undefined
      cb.current.onBlur(remember(e.getJSON()))
    },
  })
  const editorRef = useRef<Editor | null>(null)
  editorRef.current = editor
  // Switching to or from Pages layout (or another paper size) lays the breaks out again.
  useEffect(() => { if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(RECALC, true).setMeta('addToHistory', false)) }, [editor, pages?.perPage, pages?.unit])

  // A change from another device replaces the content, unless this block is being edited here (typing,
  // or using the toolbar on it) or the change is just our own save coming back.
  useEffect(() => {
    if (!editor || editor.isFocused || useSheetUI.getState().editor === editor || unsaved.current !== undefined) return
    const incoming = JSON.stringify(block.data.doc)
    if (sent.current.includes(incoming) || JSON.stringify(editor.getJSON()) === incoming) return
    editor.commands.setContent(block.data.doc as object, { emitUpdate: false })
  }, [editor, block.data.doc])
  // Focus after the click that created the block has finished, or the browser takes focus back.
  useEffect(() => {
    if (!autoFocus || !editor) return
    // focus('end') places the cursor; its own DOM focus waits for an animation frame, so focus the view now too.
    const t = setTimeout(() => {
      // A maths, plot or working editor that just opened in this block keeps the focus it took.
      if (editor.isDestroyed || editor.isFocused || box.current?.contains(document.activeElement)) return
      editor.commands.focus('end')
      editor.view.focus()
    }, 30)
    return () => clearTimeout(t)
  }, [autoFocus, editor])
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => cb.current.onHeight(linesFor(el.offsetHeight, unit)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [unit])
  // Leaving the page within the save delay still saves what was typed.
  useEffect(() => () => {
    clearTimeout(save.current)
    if (unsaved.current !== undefined) cb.current.onDoc(remember(unsaved.current))
    useSheetUI.setState((s) => (s.lastEditor === editor ? { editor: null, lastEditor: null } : {}))
  }, [editor])
  return (
    <div ref={box} className="tblock" style={{ '--ln': `${unit}px` } as React.CSSProperties}>
      <EditorContent editor={editor} />
      {table && editor && <>
        <button className="tgrow row" style={{ top: table.top + table.height + 4, left: table.left, width: table.width }} aria-label="Add a row" title="Add a row"
          onMouseDown={(e) => e.preventDefault()} onClick={() => growTable(editor, 'row')}><Icon name="plus" size={12} /></button>
        <button className="tgrow col" style={{ top: table.top, left: table.left + table.width + 4, height: table.height }} aria-label="Add a column" title="Add a column"
          onMouseDown={(e) => e.preventDefault()} onClick={() => growTable(editor, 'col')}><Icon name="plus" size={12} /></button>
      </>}
      {plus !== null && (
        <button className="tplus" style={{ top: plus }} aria-label="Insert on this line" title="Insert (or type /)"
          onMouseDown={(e) => e.preventDefault()} onClick={() => useSheetUI.setState({ insertOpen: true })}><Icon name="plus" size={14} /></button>
      )}
    </div>
  )
}
