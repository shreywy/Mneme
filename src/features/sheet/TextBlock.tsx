import { useEffect, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { linesFor } from '../../sheets/grid'
import type { SheetBlock } from '../../sheets/types'

type Props = {
  block: SheetBlock
  unit: number
  autoFocus?: boolean
  onDoc: (doc: unknown) => void
  onHeight: (lines: number) => void
  /** Called with the final document; the block may be removed if it's empty. */
  onBlur: (doc: unknown) => void
}

/** One text block. StarterKit's input rules give the markdown shortcuts: #, -, 1., >, ```, ---. [ ] makes a checklist. */
export function TextBlock({ block, unit, autoFocus, onDoc, onHeight, onBlur }: Props) {
  // The editor keeps the handlers it was created with, so they read the latest props through a ref.
  const cb = useRef({ onDoc, onHeight, onBlur })
  cb.current = { onDoc, onHeight, onBlur }
  const save = useRef<ReturnType<typeof setTimeout>>(undefined)
  const main = block.role === 'main'
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList, TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: ({ node }) => (main && node.type.name === 'heading' ? 'Title' : main ? 'Start writing' : 'Type here') }),
    ],
    content: (block.data.doc as object | null) ?? '',
    autofocus: autoFocus ? 'end' : false,
    onUpdate: ({ editor: e }) => { clearTimeout(save.current); save.current = setTimeout(() => cb.current.onDoc(e.getJSON()), 400) },
    onBlur: ({ editor: e }) => { clearTimeout(save.current); cb.current.onBlur(e.getJSON()) },
  })
  // A change from another device replaces the content, unless this block is being edited here.
  useEffect(() => {
    if (editor && !editor.isFocused && JSON.stringify(editor.getJSON()) !== JSON.stringify(block.data.doc)) {
      editor.commands.setContent(block.data.doc as object, { emitUpdate: false })
    }
  }, [editor, block.data.doc])
  // Focus after the click that created the block has finished, or the browser takes focus back.
  useEffect(() => {
    if (!autoFocus || !editor) return
    // focus('end') places the cursor; its own DOM focus waits for an animation frame, so focus the view now too.
    const t = setTimeout(() => { if (!editor.isDestroyed && !editor.isFocused) { editor.commands.focus('end'); editor.view.focus() } }, 30)
    return () => clearTimeout(t)
  }, [autoFocus, editor])
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => cb.current.onHeight(linesFor(el.offsetHeight, unit)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [unit])
  useEffect(() => () => clearTimeout(save.current), [])
  return <div ref={box} className="tblock" style={{ '--ln': `${unit}px` } as React.CSSProperties}><EditorContent editor={editor} /></div>
}
