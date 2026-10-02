import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { isTyping } from '../../app/ui'
import { deleteMyBlock, listMyBlocks, MY_BLOCKS_ID } from '../../data/myblocks'
import { db } from '../../data/db'
import { byLetter, INSERTS, searchInserts, type InsertId, type InsertItem } from '../../sheets/insert'
import { confirmAction } from '../../ui/confirm'
import { toast } from '../../ui/toasts'
import { Icon } from '../../ui/Icons'
import { nodeFor, opensItself, runInsert } from './editor/commands'
import { INSERT_DRAG } from './TextBlock'
import { useRecents, useSheetUI, type Tool } from './store'
import { InkBar } from './Ink'

export const MYBLOCK_DRAG = 'application/x-mneme-myblock'

const TILE_ICON: Partial<Record<InsertId, string>> = { image: 'image', plot: 'chart', table: 'table', code: 'code', checklist: 'task', link: 'link', quote: 'quote', working: 'list' }
const TILE_GLYPH: Partial<Record<InsertId, string>> = { equation: '∑', axes: '┼' }

/** Puts an insert where it belongs: at the cursor of the block being edited, or in a new block mid-view. */
export async function insertNow(id: InsertId, at?: { x: number; y: number }) {
  const { editor, canvas } = useSheetUI.getState()
  useRecents.getState().push(id)
  useSheetUI.setState({ insertOpen: false })
  if (editor && !editor.isDestroyed && !at) return runInsert(editor, id)
  if (!canvas) { toast('Tap the line where it should go, then Insert'); return }
  const node = await nodeFor(id)
  if (!node) return
  await canvas.newBlock(Array.isArray(node) ? node : [opensItself(node)], at)
}

const TOOLS: { id: Tool; label: string; icon: string; key: string; ink?: boolean }[] = [
  { id: 'text', label: 'Type: click the paper to write there', icon: 'text', key: 'T' },
  { id: 'select', label: 'Select: drag to pick several blocks', icon: 'cursor', key: 'V' },
  { id: 'pan', label: 'Move around the page', icon: 'hand', key: 'H' },
  { id: 'pen', label: 'Pen: draw anywhere. Hold at the end of a stroke for a shape', icon: 'pen', key: 'P', ink: true },
  { id: 'highlighter', label: 'Highlighter: goes behind the text', icon: 'highlight', key: 'M', ink: true },
  { id: 'eraser', label: 'Eraser', icon: 'eraser', key: 'E', ink: true },
  { id: 'lasso', label: 'Lasso: draw around ink and blocks to select them', icon: 'lasso', key: 'L', ink: true },
]

/** Tools along the bottom: what a drag on the paper does, bookmarks, and Insert. */
export function Dock() {
  const tool = useSheetUI((s) => s.tool)
  const open = useSheetUI((s) => s.insertOpen)
  const canvas = useSheetUI((s) => s.canvas)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey || useSheetUI.getState().insertOpen || document.querySelector('[role=dialog]')) return
      const t = TOOLS.find((x) => x.key === e.key.toUpperCase())
      if (t) { useSheetUI.setState({ tool: t.id }); return }
      if (e.key === 'i' || e.key === 'I' || e.key === '/') { e.preventDefault(); useSheetUI.setState({ insertOpen: true }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <>
      <div className="sheet-dock" onPointerDown={(e) => e.stopPropagation()}>
        {TOOLS.map((t, i) => (
          <span key={t.id} className="dk-wrap">{t.ink && !TOOLS[i - 1].ink && <i className="dk-sep" />}
          <button className={`dk ${tool === t.id ? 'on' : ''}`} aria-label={t.label} aria-pressed={tool === t.id} title={`${t.label}  ${t.key}`}
            onMouseDown={(e) => e.preventDefault()} onClick={() => useSheetUI.setState({ tool: t.id })}><Icon name={t.icon} size={18} /></button></span>
        ))}
        <i className="dk-sep" />
        <button className="dk" aria-label="Add a bookmark in the middle of the view" title="Bookmark this spot" onMouseDown={(e) => e.preventDefault()} onClick={() => void canvas?.addBookmark()}><Icon name="flag" size={18} /></button>
        <button className={`dk dk-insert ${open ? 'on' : ''}`} title="Insert  I" onMouseDown={(e) => e.preventDefault()} onClick={() => useSheetUI.setState({ insertOpen: !open })}><Icon name="plus" size={16} />Insert</button>
      </div>
      {open ? <InsertPanel /> : <InkBar />}
    </>
  )
}

function Tile({ it, onPick }: { it: InsertItem; onPick: () => void }) {
  return (
    <button className="ins-tile" draggable title={it.hint ? `${it.label}  (${it.hint})` : it.label}
      onDragStart={(e) => { e.dataTransfer.setData(INSERT_DRAG, it.id); e.dataTransfer.effectAllowed = 'copy' }}
      onMouseDown={(e) => e.preventDefault()} onClick={onPick}>
      {TILE_GLYPH[it.id] ? <span className="g">{TILE_GLYPH[it.id]}</span> : <Icon name={TILE_ICON[it.id] ?? 'plus'} size={19} />}
      <span className="l">{it.label}</span>
      {it.letter && <span className="k">{it.letter}</span>}
    </button>
  )
}

/** Insert: a letter or a click puts it at the cursor, a number repeats a recent one, dragging puts it anywhere. */
export function InsertPanel() {
  const [q, setQ] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const recents = useRecents((s) => s.recents)
  const mine = useLiveQuery(() => listMyBlocks(), [], [])
  const myCount = useLiveQuery(() => db.sheetBlocks.where('sheetId').equals(MY_BLOCKS_ID).count(), [], 0)
  const canvas = useSheetUI((s) => s.canvas)
  const close = () => useSheetUI.setState({ insertOpen: false })
  const recentItems = recents.map((r) => (r.startsWith('my:') ? { my: mine.find((g) => g.group === r.slice(3)) } : { it: INSERTS.find((i) => i.id === r) })).filter((x) => x.my || x.it)
  const pickRecent = (n: number) => {
    const r = recentItems[n]
    if (r?.it) void insertNow(r.it.id)
    else if (r?.my) { useRecents.getState().push(`my:${r.my.group}`); close(); void canvas?.placeGroup(r.my.group) }
  }

  const panel = useRef<HTMLDivElement>(null)
  // A click anywhere else (back into the text, say) closes it.
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!panel.current?.contains(e.target as Node)) close() }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return }
      // Keys in a field or another dialog are theirs. The text you were writing in is fine: that's where it inserts.
      const at = document.activeElement
      const field = at instanceof HTMLInputElement || at instanceof HTMLTextAreaElement || at instanceof HTMLSelectElement || at?.tagName === 'MATH-FIELD'
      if (at === search.current || field || at?.closest('[role=dialog]:not(.insert-panel)') || e.ctrlKey || e.metaKey || e.altKey) return
      if (/^[1-4]$/.test(e.key)) { e.preventDefault(); pickRecent(Number(e.key) - 1); return }
      if (e.key === '/') { e.preventDefault(); search.current?.focus(); return }
      const hit = e.key.length === 1 ? byLetter(e.key) : undefined
      if (hit) { e.preventDefault(); e.stopPropagation(); void insertNow(hit.id) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const results = q ? searchInserts(q) : INSERTS.filter((i) => i.letter)
  return (
    <div ref={panel} className="insert-panel" role="dialog" aria-label="Insert" onPointerDown={(e) => e.stopPropagation()}>
      <div className="ins-search">
        <Icon name="search" size={15} />
        <input ref={search} placeholder="Search, or press a letter" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search what to insert"
          onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) void insertNow(results[0].id) }} />
        <kbd>Esc</kbd>
      </div>
      {!q && recentItems.length > 0 && (
        <>
          <div className="ins-h">Recent</div>
          <div className="ins-recent">
            {recentItems.map((r, i) => (
              <button key={i} onMouseDown={(e) => e.preventDefault()} onClick={() => pickRecent(i)}><span className="k">{i + 1}</span>{r.it ? r.it.label : r.my!.name}</button>
            ))}
          </div>
        </>
      )}
      <div className="ins-grid">
        {results.map((it) => <Tile key={it.id} it={it} onPick={() => void insertNow(it.id)} />)}
        {!results.length && <p className="muted ins-none">Nothing called that.</p>}
      </div>
      {!q && (
        <>
          <div className="ins-h">My blocks</div>
          {mine.length ? (
            <div className="ins-mine">
              {mine.map((g) => (
                <div key={g.group} className="ins-my" draggable onDragStart={(e) => { e.dataTransfer.setData(MYBLOCK_DRAG, g.group); e.dataTransfer.effectAllowed = 'copy' }}>
                  <button className="t" onClick={() => { useRecents.getState().push(`my:${g.group}`); close(); void canvas?.placeGroup(g.group) }}><Icon name="star" size={14} />{g.name}<span className="n">{g.blocks.length > 1 ? `${g.blocks.length} blocks` : ''}</span></button>
                  <button className="iconbtn" aria-label={`Delete ${g.name} from My blocks`} onClick={async () => { if (await confirmAction({ title: `Delete "${g.name}" from My blocks?`, body: 'Copies already on your pages stay.', confirm: 'Delete', danger: true })) await deleteMyBlock(g.group) }}><Icon name="x" size={13} /></button>
                </div>
              ))}
            </div>
          ) : <p className="ins-empty">{myCount ? '' : 'Select blocks on a page and choose Save as my block. They show up here, on every page.'}</p>}
        </>
      )}
      <div className="ins-foot"><span>Letter or click: at the cursor</span><span>Drag: anywhere on the page</span></div>
    </div>
  )
}

