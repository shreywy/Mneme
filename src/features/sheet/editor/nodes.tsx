import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { create } from 'zustand'
import { Extension, InputRule, Node, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes, type NodeViewProps } from '@tiptap/react'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { TextSelection } from '@tiptap/pm/state'
import { createLowlight } from 'lowlight'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import matlab from 'highlight.js/lib/languages/matlab'
import python from 'highlight.js/lib/languages/python'
import r from 'highlight.js/lib/languages/r'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import { db } from '../../../data/db'
import { pageIcon, pageUrl, pagesOf, type PageKind } from '../../../data/pages'
import { listLibrary } from '../../../data/repo'
import { listNotes } from '../../../data/notes'
import { listSheets } from '../../../data/sheets'
import { Derivation, Plot } from '../../notes/figures'
import { plotBlock, type PlotSpec } from '../../../sheets/plot'
import { texHtml } from '../../../sheets/tex'
import type { DerivationLine } from '../../../notes-format/types'
import { Icon } from '../../../ui/Icons'
import { Sheet } from '../../../ui/controls'
import { MathField } from './MathField'

// The things you can insert into a text block. Each is a node in the block's document, drawn by a React
// view, and each takes a whole number of lines so the text after it stays on the paper's lines.

const tex = texHtml
/** Events inside an open editor (inputs, the maths field) belong to it, not to the text around it. */
const stopInside = ({ event }: { event: Event }) => !!(event.target as Element | null)?.closest?.('.nv-edit, .nv-ui')

/**
 * A text box that keeps what you're typing while the node saves it. Bound straight to the node, the box
 * was redrawn from the saved value a moment later, which threw the cursor to the end.
 */
function Draft({ value, onCommit, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  const typing = useRef(false)
  useEffect(() => { if (!typing.current) setDraft(value) }, [value])
  return <input {...rest} value={draft} onFocus={(e) => { typing.current = true; rest.onFocus?.(e) }} onBlur={(e) => { typing.current = false; rest.onBlur?.(e) }}
    onChange={(e) => { setDraft(e.target.value); onCommit(e.target.value) }} />
}

/** Rounds its content's height up to whole lines. */
function Lines({ children, className, boxRef }: { children: ReactNode; className?: string; boxRef?: React.Ref<HTMLDivElement> }) {
  const inner = useRef<HTMLDivElement>(null)
  const [h, setH] = useState<number>()
  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    const fit = () => {
      const ln = parseFloat(getComputedStyle(el).getPropertyValue('--ln')) || 28
      setH(Math.max(1, Math.ceil(el.offsetHeight / ln - 0.01)) * ln)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return <div ref={boxRef} className={`nv-lines ${className ?? ''}`} style={{ height: h }}><div ref={inner} className="nv-inner">{children}</div></div>
}

/**
 * A node inserted here opens its editor straight away: it carries a one-off token, and only the view
 * holding the token we just handed out opens (not some other view that happens to redraw).
 */
let pending: string | null = null
export function opening<T extends { type: string; attrs?: Record<string, unknown> }>(node: T): T {
  pending = crypto.randomUUID()
  return { ...node, attrs: { ...node.attrs, openToken: pending } }
}
const openToken = { openToken: { default: null, rendered: false } }

/** Open when just inserted or clicked; closes on Escape, Done, or when focus leaves it. */
function useOpen(selectedProp: boolean, p: Pick<NodeViewProps, 'node' | 'updateAttributes' | 'editor' | 'getPos'>) {
  // TipTap marks a node selected whenever the selection covers it, focused or not (a block that starts
  // with an equation selects it on load). Only a selection you made while typing here opens it.
  const selected = selectedProp && p.editor.isFocused
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement & HTMLSpanElement>(null)
  // Selecting it while typing (arrow keys) opens it. Only selecting: closing is a click elsewhere, Escape,
  // Done or focus leaving, because focus moving into its own editor also reads as "deselected".
  const was = useRef(selected)
  useEffect(() => {
    if (was.current === selected) return
    was.current = selected
    if (selected) setOpen(true)
  }, [selected])
  // Claim the token once mounted (an effect, so React's double render in development can't lose it),
  // then drop it so it isn't saved with the page.
  useEffect(() => {
    const t = p.node.attrs.openToken
    if (!t) return
    if (t === pending) { pending = null; setOpen(true) }
    queueMicrotask(() => p.updateAttributes({ openToken: null }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // While its editor is open, the text's own cursor sits just after the node, not on it. A node selection
  // makes the text take focus back from the maths field (and a key press would replace the node).
  useEffect(() => {
    if (!open) return
    const { state, view } = p.editor
    const pos = p.getPos()
    const sel = state.selection as { node?: unknown; from: number }
    if (typeof pos !== 'number' || !sel.node || sel.from !== pos) return
    view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(pos + p.node.nodeSize))))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  // A click anywhere else closes it, even if it never had focus.
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as globalThis.Node)) setOpen(false) }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [open])
  const onBlur = (e: React.FocusEvent) => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as globalThis.Node)) setOpen(false) }
  const onKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false) } }
  return { open, setOpen, onBlur, onKeyDown, box }
}

// ---------- equation ($$) ----------

function EquationView({ node, updateAttributes, selected, deleteNode, editor, getPos }: NodeViewProps) {
  const latex = node.attrs.latex as string
  const { open, setOpen, onBlur, onKeyDown, box } = useOpen(selected, { node, updateAttributes, editor, getPos })
  return (
    <NodeViewWrapper className={`nv nv-eq ${open ? 'is-open' : ''}`} data-drag-handle="">
      <Lines boxRef={box}>
        <div className="nv-eq-show nv-ui" contentEditable={false} onClick={() => setOpen(true)} dangerouslySetInnerHTML={{ __html: tex(latex, true) }} />
        {open && (
          <div className="nv-edit" contentEditable={false} onBlur={onBlur} onKeyDown={onKeyDown}>
            <MathField value={latex} autoFocus onChange={(v) => updateAttributes({ latex: v })} onDone={() => setOpen(false)} />
            <div className="nv-edit-foot">
              <span>Type <code>sqrt</code>, <code>/</code> or <code>theta</code>; Tab moves on</span>
              <button type="button" className="btn sm ghost" onClick={() => deleteNode()}>Remove</button>
              <button type="button" className="btn sm" onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        )}
      </Lines>
    </NodeViewWrapper>
  )
}

export const Equation = Node.create({
  name: 'equation',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ latex: { default: '' }, ...openToken }),
  parseHTML: () => [{ tag: 'div[data-equation]', getAttrs: (el) => ({ latex: (el as HTMLElement).dataset.latex ?? '' }) }],
  renderHTML: ({ node }) => ['div', { 'data-equation': '', 'data-latex': node.attrs.latex }],
  addNodeView() { return ReactNodeViewRenderer(EquationView, { stopEvent: stopInside }) },
})

// ---------- maths in a sentence ($…$) ----------

function InlineMathView({ node, updateAttributes, deleteNode, editor, getPos }: NodeViewProps) {
  const latex = node.attrs.latex as string
  const { open, setOpen, onBlur, onKeyDown, box } = useOpen(false, { node, updateAttributes, editor, getPos })
  return (
    <NodeViewWrapper as="span" className="nv-im">
      <span ref={box}>
      <span contentEditable={false} className="nv-im-show nv-ui" onClick={() => setOpen(true)} dangerouslySetInnerHTML={{ __html: tex(latex, false) }} />
      {open && (
        <span className="nv-edit nv-pop" contentEditable={false} onBlur={onBlur} onKeyDown={onKeyDown}>
          <MathField value={latex} autoFocus buttons={false} onChange={(v) => updateAttributes({ latex: v })} onDone={() => { setOpen(false); if (!latex) deleteNode() }} />
        </span>
      )}
      </span>
    </NodeViewWrapper>
  )
}

export const InlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ latex: { default: '' }, ...openToken }),
  parseHTML: () => [{ tag: 'span[data-math]', getAttrs: (el) => ({ latex: (el as HTMLElement).dataset.latex ?? '' }) }],
  renderHTML: ({ node }) => ['span', { 'data-math': '', 'data-latex': node.attrs.latex }],
  renderText: ({ node }) => `$${node.attrs.latex}$`,
  addNodeView() { return ReactNodeViewRenderer(InlineMathView, { stopEvent: stopInside }) },
  addInputRules() {
    // $x^2$ in a sentence. No space just inside the dollars, so "costs $5 and $10" stays text.
    return [new InputRule({
      find: /(^|[^\\$])\$([^\s$](?:[^$]*[^\s$])?)\$$/,
      handler: ({ state, range, match }) => {
        const start = range.from + match[1].length
        state.tr.replaceWith(start, range.to, this.type.create({ latex: match[2] }))
      },
    })]
  },
})

// ---------- step-by-step working ----------

const RELS = ['=', '≈', '<', '>', '≤', '≥', '⇒']
const REL_TEX: Record<string, string> = { '=': '=', '≈': '\\approx', '<': '<', '>': '>', '≤': '\\le', '≥': '\\ge', '⇒': '\\Rightarrow' }
const TEX_REL = Object.fromEntries(Object.entries(REL_TEX).map(([k, v]) => [v, k]))

function WorkingView({ node, updateAttributes, selected, deleteNode, editor, getPos }: NodeViewProps) {
  const lines = node.attrs.lines as DerivationLine[]
  const { open, setOpen, onBlur, onKeyDown, box } = useOpen(selected, { node, updateAttributes, editor, getPos })
  const set = (i: number, patch: Partial<DerivationLine>) => updateAttributes({ lines: lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) })
  return (
    <NodeViewWrapper className={`nv nv-work ${open ? 'is-open' : ''}`}>
      <Lines boxRef={box}>
        <div className="nv-ui" contentEditable={false} onClick={() => setOpen(true)}>
          {lines.some((l) => l.rhs.trim()) ? <Derivation b={{ type: 'derivation', lines: lines.filter((l) => l.rhs.trim()) }} /> : <div className="nv-empty">Step-by-step working: click to add steps</div>}
        </div>
        {open && (
          <div className="nv-edit" contentEditable={false} onBlur={onBlur} onKeyDown={onKeyDown}>
            <div className="nv-work-rows">
              <span className="h">Left side</span><span className="h" /><span className="h">Right side (LaTeX)</span><span className="h">Why</span><span />
              {lines.map((l, i) => (
                <WorkRow key={i} l={l} first={i === 0} onChange={(p) => set(i, p)} onRemove={lines.length > 1 ? () => updateAttributes({ lines: lines.filter((_, k) => k !== i) }) : undefined}
                  onEnter={() => updateAttributes({ lines: [...lines.slice(0, i + 1), { rel: l.rel ?? '=', rhs: '', why: '' }, ...lines.slice(i + 1)] })} />
              ))}
            </div>
            <div className="nv-edit-foot">
              <button type="button" className="btn sm ghost" onClick={() => updateAttributes({ lines: [...lines, { rel: '=', rhs: '', why: '' }] })}><Icon name="plus" size={13} />Add a step</button>
              <span className="grow" />
              <button type="button" className="btn sm ghost" onClick={() => deleteNode()}>Remove</button>
              <button type="button" className="btn sm" onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        )}
      </Lines>
    </NodeViewWrapper>
  )
}
function WorkRow({ l, first, onChange, onRemove, onEnter }: { l: DerivationLine; first: boolean; onChange: (p: Partial<DerivationLine>) => void; onRemove?: () => void; onEnter: () => void }) {
  const enter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } }
  return <>
    <Draft className="input" value={l.lhs ?? ''} placeholder={first ? 'F' : ''} spellCheck={false} onCommit={(v) => onChange({ lhs: v })} onKeyDown={enter} aria-label="Left side" />
    <select className="select" value={TEX_REL[l.rel ?? '='] ?? l.rel ?? '='} onChange={(e) => onChange({ rel: REL_TEX[e.target.value] })} aria-label="Relation">
      {RELS.map((x) => <option key={x}>{x}</option>)}
    </select>
    <Draft className="input" value={l.rhs} placeholder={first ? '\\frac{mv^2}{r}' : ''} spellCheck={false} onCommit={(v) => onChange({ rhs: v })} onKeyDown={enter} aria-label="Right side" autoFocus={first && !l.rhs} />
    <Draft className="input" value={l.why ?? ''} placeholder={first ? 'Newton’s second law' : ''} onCommit={(v) => onChange({ why: v })} onKeyDown={enter} aria-label="Why" />
    {onRemove ? <button type="button" className="iconbtn" onClick={onRemove} aria-label="Remove this step"><Icon name="x" size={13} /></button> : <span />}
  </>
}

export const Working = Node.create({
  name: 'working',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ lines: { default: [{ rel: '=', rhs: '', why: '' }] }, ...openToken }),
  parseHTML: () => [{ tag: 'div[data-working]' }],
  renderHTML: () => ['div', { 'data-working': '' }],
  addNodeView() { return ReactNodeViewRenderer(WorkingView, { stopEvent: stopInside }) },
})

// ---------- plot and axes ----------

function PlotView({ node, updateAttributes, selected, deleteNode, editor, getPos }: NodeViewProps) {
  const spec = node.attrs.spec as PlotSpec
  const { open, setOpen, onBlur, onKeyDown, box } = useOpen(selected, { node, updateAttributes, editor, getPos })
  const block = useMemo(() => plotBlock(spec), [spec])
  const set = (patch: Partial<PlotSpec>) => updateAttributes({ spec: { ...spec, ...patch } })
  const num = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? undefined : Number(v))
  return (
    <NodeViewWrapper className={`nv nv-plot ${open ? 'is-open' : ''}`}>
      <Lines boxRef={box}>
        <div className="nv-ui" contentEditable={false} onClick={() => setOpen(true)}><Plot b={block} /></div>
        {open && (
          <div className="nv-edit nv-plot-edit" contentEditable={false} onBlur={onBlur} onKeyDown={onKeyDown}>
            {[...spec.fns, ''].slice(0, 6).map((f, i) => (
              <label key={i} className="nv-fn"><span>y =</span>
                <Draft className="input" value={f} placeholder={i === 0 ? '100 / x' : 'another line'} spellCheck={false} autoFocus={i === 0 && !f}
                  onCommit={(v) => { const fns = [...spec.fns]; fns[i] = v; set({ fns: fns.filter((x, k) => x.trim() || k < spec.fns.length - 1 || k === i) }) }} />
              </label>
            ))}
            <div className="nv-ranges">
              <label>x from <input className="input" inputMode="decimal" defaultValue={spec.xMin} onChange={(e) => { const v = num(e.target.value); if (v !== undefined && v < spec.xMax) set({ xMin: v }) }} /></label>
              <label>to <input className="input" inputMode="decimal" defaultValue={spec.xMax} onChange={(e) => { const v = num(e.target.value); if (v !== undefined && v > spec.xMin) set({ xMax: v }) }} /></label>
              <label>y from <input className="input" inputMode="decimal" placeholder="auto" defaultValue={spec.yMin ?? ''} onChange={(e) => set({ yMin: num(e.target.value) })} /></label>
              <label>to <input className="input" inputMode="decimal" placeholder="auto" defaultValue={spec.yMax ?? ''} onChange={(e) => set({ yMax: num(e.target.value) })} /></label>
              <label>x label <input className="input" defaultValue={spec.xLabel ?? ''} onChange={(e) => set({ xLabel: e.target.value || undefined })} /></label>
              <label>y label <input className="input" defaultValue={spec.yLabel ?? ''} onChange={(e) => set({ yLabel: e.target.value || undefined })} /></label>
            </div>
            <div className="nv-edit-foot">
              <span>Use x, ^, sqrt(), sin(), pi, e</span>
              <button type="button" className="btn sm ghost" onClick={() => deleteNode()}>Remove</button>
              <button type="button" className="btn sm" onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        )}
      </Lines>
    </NodeViewWrapper>
  )
}

export const PlotNode = Node.create({
  name: 'plot',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ spec: { default: { fns: [''], xMin: -5, xMax: 5 } satisfies PlotSpec }, ...openToken }),
  parseHTML: () => [{ tag: 'div[data-plot]' }],
  renderHTML: () => ['div', { 'data-plot': '' }],
  addNodeView() { return ReactNodeViewRenderer(PlotView, { stopEvent: stopInside }) },
})

// ---------- link card ----------

type Target = { kind: PageKind; id: string }
function LinkCardView({ node, deleteNode, selected }: NodeViewProps) {
  const { kind, id } = node.attrs as Target
  const nav = useNavigate()
  const title = useLiveQuery(async () => {
    const row = kind === 'deck' ? await db.decks.get(id) : kind === 'note' ? await db.notes.get(id) : await db.sheets.get(id)
    return row ? row.title : null
  }, [kind, id], undefined)
  const noun = kind === 'deck' ? 'Deck' : kind === 'note' ? 'Notes' : 'Page'
  return (
    <NodeViewWrapper className={`nv nv-link ${selected ? 'is-open' : ''}`}>
      <Lines>
        <div className="nv-card nv-ui" contentEditable={false}>
          <Icon name={pageIcon(kind)} />
          <div className="t"><span>{noun}</span><b>{title === null ? 'Deleted' : title ?? '…'}</b></div>
          {title !== null && <button type="button" className="btn sm" onClick={() => nav(pageUrl({ kind, id }))}>Open</button>}
          <button type="button" className="iconbtn" aria-label="Remove the link" onClick={() => deleteNode()}><Icon name="x" size={14} /></button>
        </div>
      </Lines>
    </NodeViewWrapper>
  )
}

export const LinkCard = Node.create({
  name: 'linkCard',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ kind: { default: 'deck' }, id: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-link-card]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-link-card': '' })],
  addNodeView() { return ReactNodeViewRenderer(LinkCardView, { stopEvent: stopInside }) },
})

/** "Link a deck or page": a promise that resolves to what was picked. Its dialog is mounted once on the page. */
const usePick = create<{ resolve: ((t: Target | null) => void) | null }>(() => ({ resolve: null }))
export const pickPage = () => new Promise<Target | null>((resolve) => usePick.setState({ resolve }))

export function PagePickerHost({ exclude }: { exclude?: string }) {
  const resolve = usePick((s) => s.resolve)
  const [q, setQ] = useState('')
  const pages = useLiveQuery(async () => {
    const [{ decks }, notes, sheets] = await Promise.all([listLibrary(), listNotes(), listSheets()])
    return pagesOf(decks, notes, sheets)
  }, [])
  if (!resolve) return null
  const done = (t: Target | null) => { usePick.setState({ resolve: null }); setQ(''); resolve(t) }
  const needle = q.trim().toLowerCase()
  const hits = (pages ?? []).filter((p) => p.id !== exclude && (!needle || p.title.toLowerCase().includes(needle))).sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))
  return (
    <Sheet onClose={() => done(null)} label="Link a deck or page" width={460}>
      <h2 style={{ fontSize: 22 }}>Link a deck or page</h2>
      <input className="input" autoFocus placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: '14px 0 10px' }}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) done({ kind: hits[0].kind, id: hits[0].id }) }} />
      <div className="pick-list">
        {hits.map((p) => (
          <button key={`${p.kind}:${p.id}`} className="pick-row" onClick={() => done({ kind: p.kind, id: p.id })}>
            <Icon name={pageIcon(p.kind)} size={15} /><span className="t">{p.title}</span><span className="k">{p.kind === 'deck' ? 'Deck' : p.kind === 'note' ? 'Notes' : 'Page'}</span>
          </button>
        ))}
        {!hits.length && <p className="muted" style={{ padding: 10 }}>Nothing matches.</p>}
      </div>
    </Sheet>
  )
}

// ---------- table size ----------

/** "How big?" for a new table: a grid you sweep over. Resolves to rows and columns, or null. */
const useTableSize = create<{ resolve: ((s: { rows: number; cols: number } | null) => void) | null }>(() => ({ resolve: null }))
export const pickTableSize = () => new Promise<{ rows: number; cols: number } | null>((resolve) => useTableSize.setState({ resolve }))

export function TableSizeHost() {
  const resolve = useTableSize((s) => s.resolve)
  const [at, setAt] = useState({ rows: 3, cols: 3 })
  if (!resolve) return null
  const done = (v: { rows: number; cols: number } | null) => { useTableSize.setState({ resolve: null }); setAt({ rows: 3, cols: 3 }); resolve(v) }
  return (
    <Sheet onClose={() => done(null)} label="Table size" width={340}>
      <h2 style={{ fontSize: 22 }}>Table size</h2>
      <p className="muted" style={{ margin: '6px 0 14px', fontSize: 13 }}>{at.rows} rows × {at.cols} columns. The first row is the header. You can add more later with the + on its edges.</p>
      <div className="tsize" onMouseLeave={() => undefined}>
        {Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => (
          <button key={`${r}-${c}`} type="button" aria-label={`${r + 1} by ${c + 1}`} className={r < at.rows && c < at.cols ? 'on' : ''}
            onMouseEnter={() => setAt({ rows: r + 1, cols: c + 1 })} onFocus={() => setAt({ rows: r + 1, cols: c + 1 })} onClick={() => done({ rows: r + 1, cols: c + 1 })} />
        )))}
      </div>
    </Sheet>
  )
}

// ---------- code ----------

export const lowlight = createLowlight({ bash, c, cpp, csharp, css, go, java, javascript, json, matlab, python, r, rust, sql, typescript, xml })
export const CODE_LANGS: { id: string; label: string }[] = [
  { id: '', label: 'Plain text' }, { id: 'bash', label: 'Bash' }, { id: 'c', label: 'C' }, { id: 'cpp', label: 'C++' }, { id: 'csharp', label: 'C#' },
  { id: 'css', label: 'CSS' }, { id: 'go', label: 'Go' }, { id: 'xml', label: 'HTML' }, { id: 'java', label: 'Java' }, { id: 'javascript', label: 'JavaScript' },
  { id: 'json', label: 'JSON' }, { id: 'matlab', label: 'MATLAB' }, { id: 'python', label: 'Python' }, { id: 'r', label: 'R' }, { id: 'rust', label: 'Rust' },
  { id: 'sql', label: 'SQL' }, { id: 'typescript', label: 'TypeScript' },
]
/** Names editors and people use, mapped to the ones above. */
export const codeLang = (name: string | undefined) => {
  const n = (name ?? '').toLowerCase()
  const alias: Record<string, string> = { js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', typescriptreact: 'typescript', javascriptreact: 'javascript', py: 'python', sh: 'bash', shell: 'bash', shellscript: 'bash', html: 'xml', 'c++': 'cpp', 'c#': 'csharp', cs: 'csharp', rs: 'rust' }
  const id = alias[n] ?? n
  return CODE_LANGS.some((l) => l.id === id) ? id : ''
}

function CodeView({ node, updateAttributes }: NodeViewProps) {
  const [copied, setCopied] = useState(false)
  return (
    <NodeViewWrapper className="nv-code">
      <div className="nv-code-head nv-ui" contentEditable={false}>
        <label className="nv-lang-wrap">Language
          <select className={`nv-lang ${node.attrs.language ? '' : 'unset'}`} value={node.attrs.language ?? ''} onChange={(e) => updateAttributes({ language: e.target.value || null })}>
            {CODE_LANGS.map((l) => <option key={l.id} value={l.id}>{l.id ? l.label : 'Choose…'}</option>)}
          </select>
        </label>
        <button type="button" className="nv-copy" onClick={async () => { await navigator.clipboard.writeText(node.textContent); setCopied(true); setTimeout(() => setCopied(false), 1400) }}>
          <Icon name={copied ? 'check' : 'copy'} size={13} />{copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre><NodeViewContent<'code'> as="code" /></pre>
    </NodeViewWrapper>
  )
}

export const Code = CodeBlockLowlight.extend({
  addNodeView() { return ReactNodeViewRenderer(CodeView, { stopEvent: stopInside }) },
}).configure({ lowlight, defaultLanguage: null })

// ---------- Enter at the end of ``` or $$ ----------

/** The typed shortcuts that only finish when you press Enter: ```lang makes code, $$ makes an equation. */
export const EnterShortcuts = Extension.create({
  name: 'enterShortcuts',
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection
        if (!empty || $from.parent.type.name !== 'paragraph') return false
        const text = $from.parent.textContent
        const at = { from: $from.before(), to: $from.after() }
        const code = text.match(/^```\s*([\w#+-]*)$/)
        if (code) return editor.chain().insertContentAt(at, { type: 'codeBlock', attrs: { language: codeLang(code[1]) || null } }).focus().run()
        if (text === '$$') return editor.chain().insertContentAt(at, [opening({ type: 'equation', attrs: { latex: '' } }), { type: 'paragraph' }]).run()
        return false
      },
    }
  },
})
