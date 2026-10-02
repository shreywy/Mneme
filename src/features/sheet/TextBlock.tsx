import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { linesFor } from '../../sheets/grid'
import { classifyPaste } from '../../sheets/paste'
import type { InsertId } from '../../sheets/insert'
import type { SheetBlock } from '../../sheets/types'
import { toastAction } from '../../ui/toasts'
import { Icon } from '../../ui/Icons'
import { textExtensions } from './editor/extensions'
import { applyPaste, runInsert } from './editor/commands'
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
}

const LABEL = { table: 'a table', latex: 'an equation', code: 'code', link: 'a link card' } as const

/**
 * One text block. Markdown shortcuts (#, -, 1., [ ], >, ```, ---, $$, $…$), the / menu, smart paste and
 * everything in Insert work here. While it's being edited, the toolbar acts on it.
 */
export function TextBlock({ block, unit, autoFocus, onDoc, onHeight, onBlur }: Props) {
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
  const main = block.role === 'main'

  /** The + beside an empty line: where it goes (px from the block's top), or nowhere. */
  const placePlus = (e: Editor) => {
    const { $from, empty } = e.state.selection
    const blank = e.isFocused && empty && $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0 && $from.depth === 1
    const dom = blank ? (e.view.nodeDOM($from.before()) as HTMLElement | null) : null
    setPlus(dom ? dom.offsetTop : null)
  }
  const report = (e: Editor) => { useSheetUI.setState((s) => ({ tick: s.tick + 1 })); placePlus(e) }

  const editor = useEditor({
    extensions: textExtensions(main),
    content: (block.data.doc as object | null) ?? '',
    // Focus is placed by the effect below, once the click that made the block is over.
    editorProps: {
      handlePaste: (view, event) => {
        const data = event.clipboardData
        if (!data || data.files.length || view.state.selection.$from.parent.type.spec.code) return false
        let lang: string | undefined
        try { lang = JSON.parse(data.getData('vscode-editor-data') || '{}').mode } catch { lang = undefined }
        const text = data.getData('text/plain')
        const hit = classifyPaste({ text, origin: location.origin, editorLanguage: lang })
        const ed = editorRef.current
        if (!hit || !ed) return false
        applyPaste(ed, hit)
        toastAction(`Pasted as ${LABEL[hit.kind]}`, { label: 'Paste as plain text', run: () => { ed.chain().focus().undo().insertContent(text.split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] }))).run() } })
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
      // Clicking the toolbar or Insert keeps this block as the one they act on.
      const to = event.relatedTarget as Element | null
      if (!to?.closest?.('.sheet-toolbar, .insert-panel')) useSheetUI.setState((s) => (s.editor === e ? { editor: null } : {}))
      setPlus(null)
      clearTimeout(save.current); save.current = undefined; unsaved.current = undefined
      cb.current.onBlur(remember(e.getJSON()))
    },
  })
  const editorRef = useRef<Editor | null>(null)
  editorRef.current = editor

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
      {plus !== null && (
        <button className="tplus" style={{ top: plus }} aria-label="Insert on this line" title="Insert (or type /)"
          onMouseDown={(e) => e.preventDefault()} onClick={() => useSheetUI.setState({ insertOpen: true })}><Icon name="plus" size={14} /></button>
      )}
    </div>
  )
}
