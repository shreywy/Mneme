import type { Editor } from '@tiptap/react'
import type { InsertId } from '../../../sheets/insert'
import type { PasteResult } from '../../../sheets/paste'
import { codeLang, opening, pickPage } from './nodes'

/** The node (as JSON) an insert makes when it lands in a new block of its own; null for text styles. */
export async function nodeFor(id: InsertId): Promise<object | null> {
  switch (id) {
    case 'equation': return { type: 'equation', attrs: { latex: '' } }
    case 'working': return { type: 'working', attrs: { lines: [{ rel: '=', rhs: '', why: '' }] } }
    case 'plot': return { type: 'plot', attrs: { spec: { fns: [''], xMin: -5, xMax: 5 } } }
    case 'axes': return { type: 'plot', attrs: { spec: { fns: [], xMin: -5, xMax: 5, yMin: -5, yMax: 5, xLabel: 'x', yLabel: 'y' } } }
    case 'table': return tableJSON([['', '', ''], ['', '', ''], ['', '', '']])
    case 'code': return { type: 'codeBlock', attrs: { language: null } }
    case 'checklist': return { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }] }
    case 'bullet': return { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }
    case 'numbered': return { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }
    case 'quote': return { type: 'blockquote', content: [{ type: 'paragraph' }] }
    case 'divider': return { type: 'horizontalRule' }
    case 'heading1': case 'heading2': case 'heading3': return { type: 'heading', attrs: { level: Number(id.slice(-1)) } }
    case 'inlineMath': return { type: 'paragraph', content: [{ type: 'inlineMath', attrs: { latex: '' } }] }
    case 'link': { const t = await pickPage(); return t ? { type: 'linkCard', attrs: t } : null }
  }
}

export function tableJSON(rows: string[][]) {
  const cell = (type: 'tableHeader' | 'tableCell', text: string) => ({ type, content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] })
  const width = Math.max(1, ...rows.map((r) => r.length))
  return {
    type: 'table',
    content: rows.map((r, i) => ({ type: 'tableRow', content: Array.from({ length: width }, (_, k) => cell(i === 0 ? 'tableHeader' : 'tableCell', r[k] ?? '')) })),
  }
}

/** Puts an insert at the editor's cursor. Text styles (headings, lists, quote) apply to the current line. */
export async function runInsert(editor: Editor, id: InsertId) {
  const chain = () => editor.chain().focus()
  switch (id) {
    case 'heading1': case 'heading2': case 'heading3': return chain().toggleHeading({ level: Number(id.slice(-1)) as 1 | 2 | 3 }).run()
    case 'bullet': return chain().toggleBulletList().run()
    case 'numbered': return chain().toggleOrderedList().run()
    case 'checklist': return chain().toggleTaskList().run()
    case 'quote': return chain().toggleBlockquote().run()
    case 'code': return chain().toggleCodeBlock().run()
    case 'divider': return chain().setHorizontalRule().run()
    case 'table': return chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    case 'inlineMath': return chain().insertContent(opening({ type: 'inlineMath', attrs: { latex: '' } })).run()
  }
  const node = await nodeFor(id)
  if (!node) return
  chain().insertContent(opensItself(node)).run()
}

/** Maths, plots and working open their editor as soon as they land. */
export const opensItself = (node: object) => {
  const n = node as { type: string; attrs?: Record<string, unknown> }
  return OPENS.includes(n.type) ? opening(n) : node
}

/** Inserts that open their editor as soon as they land. */
export const OPENS = ['equation', 'plot', 'working']

/** Applies a smart paste at the cursor. */
export function applyPaste(editor: Editor, p: Exclude<PasteResult, null>) {
  const chain = () => editor.chain().focus()
  if (p.kind === 'table') return chain().insertContent(tableJSON(p.rows)).run()
  if (p.kind === 'latex') return chain().insertContent({ type: 'equation', attrs: { latex: p.tex } }).run()
  if (p.kind === 'code') return chain().insertContent({ type: 'codeBlock', attrs: { language: codeLang(p.lang) || null }, content: [{ type: 'text', text: p.code }] }).run()
  return chain().insertContent({ type: 'linkCard', attrs: p.target }).run()
}
