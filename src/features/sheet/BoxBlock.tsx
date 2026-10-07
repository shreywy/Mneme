import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { createSubPage, kidsOf, moveIntoBox } from '../../data/subpages'
import { PAGE_DRAG } from '../../data/pages'
import { ancestors, parentsOf } from '../../sheets/tree'
import type { SheetBlock } from '../../sheets/types'
import { Icon } from '../../ui/Icons'
import { toast } from '../../ui/toasts'
import { useSettings } from '../../settings/store'
import { pickPage } from './editor/nodes'

type N = { type?: string; text?: string; content?: N[] }
/** The first line of text under the title, for a card's preview. */
export function firstLine(doc: unknown): string {
  const text = (n: N): string => (n.text ?? '') + (n.content ?? []).map(text).join('')
  for (const [i, block] of ((doc as N | null)?.content ?? []).entries()) {
    if (i === 0 && block.type === 'heading') continue // the title is already on the card
    const t = text(block).trim()
    if (t) return t
  }
  return ''
}

const refused = () => toast("Can't put a page inside its own sub-page")

/**
 * A box of sub-pages on a page. Its cards are the pages whose `box` is this block, read live, so the
 * sidebar and the box always agree. Drag cards to reorder, between boxes, or in from the sidebar.
 */
export function BoxBlock({ block, onHeight, onRename }: { block: SheetBlock; onHeight: (px: number) => void; onRename: (label: string) => void }) {
  const nav = useNavigate()
  const sheetId = block.sheetId
  const cards = useLiveQuery(async () => {
    const kids = (await kidsOf(sheetId)).filter((s) => s.box === block.id)
    const ids = kids.map((k) => k.id)
    const mains = ids.length ? await db.sheetBlocks.where('sheetId').anyOf(ids).filter((b) => b.role === 'main').toArray() : []
    const grand = ids.length ? await db.sheets.where('parentId').anyOf(ids).filter((s) => !s.archived && !s.deletedAt).toArray() : []
    return kids.map((s) => ({ s, line: firstLine(mains.find((m) => m.sheetId === s.id)?.data.doc), n: grand.filter((g) => g.parentId === s.id).length }))
  }, [sheetId, block.id]) ?? []
  // The title being typed; null when not editing, so undo and other devices show straight away.
  const [draft, setDraft] = useState<string | null>(null)
  const el = useRef<HTMLDivElement>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  // The canvas passes a new onHeight every render; observe once and call the latest.
  const heightCb = useRef(onHeight)
  heightCb.current = onHeight
  useEffect(() => {
    const node = el.current
    if (!node) return
    const ro = new ResizeObserver(() => heightCb.current(node.offsetHeight))
    ro.observe(node)
    return () => ro.disconnect()
  }, [])

  const newPage = async () => nav(`/write/${await createSubPage(sheetId, block.id, useSettings.getState().paperDefault ?? undefined)}`)
  const addExisting = async () => {
    const all = await db.sheets.toArray()
    const t = await pickPage({ kinds: ['sheet'], exclude: [sheetId, ...ancestors(sheetId, parentsOf(all)), ...cards.map((c) => c.s.id)], title: 'Put a page in this box' })
    if (t && !await moveIntoBox(t.id, sheetId, block.id)) refused()
  }
  // Where a drop lands: before the card under the pointer's middle, else at the end.
  const indexAt = (y: number) => {
    const rows = [...(el.current?.querySelectorAll<HTMLElement>('.sbox-card') ?? [])]
    const i = rows.findIndex((r) => { const b = r.getBoundingClientRect(); return y < b.top + b.height / 2 })
    return i === -1 ? rows.length : i
  }
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(PAGE_DRAG)) return
    e.preventDefault(); e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDropAt(indexAt(e.clientY))
  }
  const onDrop = async (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(PAGE_DRAG)
    setDropAt(null)
    if (!raw) return
    e.preventDefault(); e.stopPropagation()
    const { kind, id } = JSON.parse(raw) as { kind: string; id: string }
    if (kind !== 'sheet') { toast('Only pages you write can go in a box'); return }
    const order = cards.map((c) => c.s.id).filter((x) => x !== id)
    order.splice(Math.min(indexAt(e.clientY), order.length), 0, id)
    if (!await moveIntoBox(id, sheetId, block.id, order)) refused()
  }

  return (
    <div ref={el} className="sbox" onDragOver={onDragOver} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAt(null) }} onDrop={onDrop}>
      <div className="sbox-head">
        <input className="sbox-label" value={draft ?? block.data.label ?? ''} placeholder="Pages" aria-label="Box title"
          onFocus={() => setDraft(block.data.label ?? '')}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft !== null && draft.trim() !== (block.data.label ?? '')) onRename(draft.trim()); setDraft(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        <span className="sbox-n">{cards.length}</span>
      </div>
      {cards.map((c, i) => (
        <Link key={c.s.id} to={`/write/${c.s.id}`} className={`sbox-card ${dropAt === i ? 'drop-before' : ''}`} draggable
          data-page-kind="sheet" data-page-id={c.s.id} data-page-title={c.s.title} data-page-parent={sheetId} data-page-box={block.id}
          onDragStart={(e) => { e.dataTransfer.setData(PAGE_DRAG, JSON.stringify({ kind: 'sheet', id: c.s.id })); e.dataTransfer.setData(`${PAGE_DRAG}-sheet`, ''); e.dataTransfer.effectAllowed = 'move' }}>
          <b>{c.s.title}</b>
          <small>{[c.line || 'Empty page', c.n ? `${c.n} sub-page${c.n === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</small>
        </Link>
      ))}
      {dropAt === cards.length && cards.length > 0 && <div className="sbox-drop" />}
      {!cards.length && <p className="sbox-empty">Drag pages here, or add one.</p>}
      <div className="sbox-add">
        <button type="button" onClick={() => void newPage()}><Icon name="plus" size={13} />New page</button>
        <button type="button" onClick={() => void addExisting()}><Icon name="page" size={13} />Add existing</button>
      </div>
    </div>
  )
}
