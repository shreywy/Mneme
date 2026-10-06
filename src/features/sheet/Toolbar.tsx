import { useState, type ReactNode } from 'react'
import type { ChainedCommands } from '@tiptap/react'
import { FONTS, SIZES } from '../../sheets/fonts'
import { askName } from '../../ui/confirm'
import { Icon } from '../../ui/Icons'
import { useSheetUI } from './store'
import { opening } from './editor/nodes'

const COLORS = [
  { label: 'Default', value: null }, { label: 'Red', value: '#C2412D' }, { label: 'Orange', value: '#C8742C' }, { label: 'Green', value: '#3F7A3A' },
  { label: 'Blue', value: '#3D6FB6' }, { label: 'Purple', value: '#7A55B0' }, { label: 'Grey', value: '#8A867C' },
]
const MARKS = [
  { label: 'None', value: null }, { label: 'Yellow', value: '#F5DD6B' }, { label: 'Green', value: '#A9D98B' }, { label: 'Blue', value: '#9CC7F0' },
  { label: 'Pink', value: '#F2A7C3' }, { label: 'Orange', value: '#F6BE7E' },
]

/** Keeps the text block focused when a toolbar button is pressed. */
const keep = (e: React.MouseEvent) => e.preventDefault()

/** `wide`: only on wider screens (phones get it from Insert, Markdown or the Style menu). */
function B({ label, on, disabled, onClick, children, kbd, wide }: { label: string; on?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode; kbd?: string; wide?: boolean }) {
  return (
    <button type="button" className={`tb ${on ? 'on' : ''} ${wide ? 'wide' : ''}`} aria-label={label} aria-pressed={on} title={kbd ? `${label}  ${kbd}` : label} disabled={disabled} onMouseDown={keep} onClick={onClick}>{children}</button>
  )
}

function Swatches({ label, icon, items, current, onPick, disabled }: { label: string; icon: ReactNode; items: { label: string; value: string | null }[]; current?: string | null; onPick: (v: string | null) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="tb-pop-wrap">
      <button type="button" className="tb" aria-label={label} title={label} aria-expanded={open} disabled={disabled} onMouseDown={keep} onClick={() => setOpen(!open)}>
        {icon}<span className="tb-bar" style={{ background: current ?? 'transparent' }} />
      </button>
      {open && (
        <span className="tb-pop" role="menu" onMouseLeave={() => setOpen(false)}>
          {items.map((c) => (
            <button key={c.label} type="button" role="menuitem" aria-label={c.label} title={c.label} onMouseDown={keep} onClick={() => { onPick(c.value); setOpen(false) }}
              className={`sw ${c.value === null ? 'none' : ''}`} style={c.value ? { background: c.value } : undefined} />
          ))}
        </span>
      )}
    </span>
  )
}

/**
 * The bar along the top of the canvas. Text controls act on the block being edited; undo and redo act on
 * its text while you type, and on the page (moves, deletes) otherwise.
 */
export function Toolbar({ mainBlockId }: { mainBlockId?: string }) {
  const editor = useSheetUI((s) => s.editor)
  const blockId = useSheetUI((s) => s.blockId)
  const canvas = useSheetUI((s) => s.canvas)
  useSheetUI((s) => s.tick)
  const ed = editor && !editor.isDestroyed ? editor : null
  const off = !ed
  const is = (name: string, attrs?: Record<string, unknown>) => !!ed?.isActive(name, attrs)
  const run = (fn: (c: ChainedCommands) => ChainedCommands) => { if (ed) fn(ed.chain().focus()).run() }
  const style = ed?.getAttributes('textStyle') ?? {}
  const fontKey = FONTS.find((f) => f.css === style.fontFamily)?.key ?? ''
  const size = typeof style.fontSize === 'string' ? parseInt(style.fontSize, 10) : 0
  const inTable = is('table')

  const link = async () => {
    if (!ed) return
    const href = await askName({ title: is('link') ? 'Edit link' : 'Add a link', value: ed.getAttributes('link').href ?? 'https://', confirm: 'Save' })
    if (href === null) return
    run((c) => (href === 'https://' ? c.unsetLink() : c.extendMarkRange('link').setLink({ href })))
  }

  const level = ([1, 2, 3] as const).find((l) => is('heading', { level: l })) ?? 0
  return (
    <div className={`sheet-toolbar ${off ? 'idle' : ''}`} role="toolbar" aria-label="Formatting">
      <B label="Undo" kbd="Ctrl+Z" onClick={() => (ed ? run((c) => c.undo()) : canvas?.undo())} disabled={ed ? !ed.can().undo() : false}><Icon name="undo" size={16} /></B>
      <B label="Redo" kbd="Ctrl+Shift+Z" onClick={() => (ed ? run((c) => c.redo()) : canvas?.redo())} disabled={ed ? !ed.can().redo() : false}><Icon name="redo" size={16} /></B>
      <i className="tb-sep" />
      <B wide label="Normal text" on={is('paragraph') && !is('heading')} disabled={off} onClick={() => run((c) => c.setParagraph())}><span className="tb-t">Text</span></B>
      {([1, 2, 3] as const).map((l) => (
        <B wide key={l} label={`Heading ${l}`} kbd={'#'.repeat(l) + ' '} on={is('heading', { level: l })} disabled={off} onClick={() => run((c) => c.toggleHeading({ level: l }))}><span className="tb-t">H{l}</span></B>
      ))}
      <select className="tb-select tb-style narrow" aria-label="Text style" title="Text style" disabled={off} value={level}
        onChange={(e) => { const l = Number(e.target.value) as 0 | 1 | 2 | 3; run((c) => (l ? c.setHeading({ level: l }) : c.setParagraph())) }}>
        <option value={0}>Text</option><option value={1}>Heading 1</option><option value={2}>Heading 2</option><option value={3}>Heading 3</option>
      </select>
      <i className="tb-sep" />
      <select className="tb-select" aria-label="Font" title="Font" disabled={off} value={fontKey} style={{ fontFamily: FONTS.find((f) => f.key === fontKey)?.css }}
        onChange={(e) => { const f = FONTS.find((x) => x.key === e.target.value); run((c) => (f ? c.setFontFamily(f.css) : c.unsetFontFamily())) }}>
        <option value="">Page font</option>
        {FONTS.map((f) => <option key={f.key} value={f.key} style={{ fontFamily: f.css }}>{f.label}</option>)}
      </select>
      <select className="tb-select tb-size" aria-label="Text size" title="Text size" disabled={off} value={size || ''}
        onChange={(e) => { const n = Number(e.target.value); run((c) => (n ? c.setFontSize(`${n}px`) : c.unsetFontSize())) }}>
        <option value="">Size</option>
        {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <i className="tb-sep" />
      <B label="Bold" kbd="Ctrl+B" on={is('bold')} disabled={off} onClick={() => run((c) => c.toggleBold())}><b className="tb-t">B</b></B>
      <B label="Italic" kbd="Ctrl+I" on={is('italic')} disabled={off} onClick={() => run((c) => c.toggleItalic())}><i className="tb-t tb-i">I</i></B>
      <B label="Underline" kbd="Ctrl+U" on={is('underline')} disabled={off} onClick={() => run((c) => c.toggleUnderline())}><u className="tb-t">U</u></B>
      <B wide label="Strikethrough" on={is('strike')} disabled={off} onClick={() => run((c) => c.toggleStrike())}><s className="tb-t">S</s></B>
      <Swatches label="Text colour" icon={<Icon name="color" size={16} />} items={COLORS} current={style.color ?? null} disabled={off}
        onPick={(v) => run((c) => (v ? c.setColor(v) : c.unsetColor()))} />
      <Swatches label="Highlight" icon={<Icon name="highlight" size={16} />} items={MARKS} current={ed?.getAttributes('highlight').color ?? null} disabled={off}
        onPick={(v) => run((c) => (v ? c.setHighlight({ color: v }) : c.unsetHighlight()))} />
      <B label="Link" kbd="Ctrl+K" on={is('link')} disabled={off} onClick={link}><Icon name="link" size={16} /></B>
      <B wide label="Maths in a sentence" kbd="$…$" disabled={off} onClick={() => run((c) => c.insertContent(opening({ type: 'inlineMath', attrs: { latex: '' } })))}><span className="tb-t tb-sum">∑</span></B>
      <i className="tb-sep" />
      <B label="Bulleted list" kbd="- " on={is('bulletList')} disabled={off} onClick={() => run((c) => c.toggleBulletList())}><Icon name="list" size={16} /></B>
      <B label="Numbered list" kbd="1. " on={is('orderedList')} disabled={off} onClick={() => run((c) => c.toggleOrderedList())}><Icon name="ol" size={16} /></B>
      <B wide label="Checklist" kbd="[] " on={is('taskList')} disabled={off} onClick={() => run((c) => c.toggleTaskList())}><Icon name="task" size={16} /></B>
      <B wide label="Quote" kbd="> " on={is('blockquote')} disabled={off} onClick={() => run((c) => c.toggleBlockquote())}><Icon name="quote" size={16} /></B>
      <B wide label="Code" kbd="```" on={is('codeBlock')} disabled={off} onClick={() => run((c) => c.toggleCodeBlock())}><Icon name="code" size={16} /></B>
      {inTable && <>
        <i className="tb-sep" />
        <B label="Add a row below" onClick={() => run((c) => c.addRowAfter())}><span className="tb-t">+ Row</span></B>
        <B label="Add a column to the right" onClick={() => run((c) => c.addColumnAfter())}><span className="tb-t">+ Col</span></B>
        <B label="Delete this row" onClick={() => run((c) => c.deleteRow())}><span className="tb-t">− Row</span></B>
        <B label="Delete this column" onClick={() => run((c) => c.deleteColumn())}><span className="tb-t">− Col</span></B>
        <B label="Delete the table" onClick={() => run((c) => c.deleteTable())}><Icon name="table" size={16} /></B>
      </>}
      <span className="grow" />
      <span className="tb-insert"><B label="Insert" kbd="I or /" onClick={() => useSheetUI.setState({ insertOpen: true })}><Icon name="plus" size={16} /><span className="tb-t">Insert</span></B></span>
      <B label={blockId === mainBlockId ? "The main column can't be deleted" : 'Delete this block'} disabled={off || !canvas || !blockId || blockId === mainBlockId}
        onClick={() => { if (blockId) void canvas?.removeBlock(blockId) }}><Icon name="trash" size={16} /></B>
    </div>
  )
}
