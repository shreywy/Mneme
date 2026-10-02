import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as sheets from '../../data/sheets'
import { blocksInRect, boundsOf, cellAt, paperStyle, snapUnits, toScreen, toWorld, zoomAt, type View } from '../../sheets/grid'
import { applyChange, createHistory, type Change } from '../../sheets/history'
import type { SheetBlock, SheetRow } from '../../sheets/types'
import { isTyping } from '../../app/ui'
import { Icon } from '../../ui/Icons'
import { TextBlock } from './TextBlock'

const START: View = { x: 0, y: 0, zoom: 1 }
const viewKey = (id: string) => `mneme.sheet.view.${id}`
function loadView(id: string): View {
  try { return { ...START, ...JSON.parse(localStorage.getItem(viewKey(id)) ?? '{}') } } catch { return START }
}
const EMPTY_PARAGRAPH = { type: 'doc', content: [{ type: 'paragraph' }] }

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; moved: boolean; wasEditing: boolean }
  | { kind: 'box'; a: { x: number; y: number }; b: { x: number; y: number } }
  | { kind: 'pinch'; dist: number; zoom: number }

/** The infinite canvas: pan, zoom, click to type, move and resize blocks on the grid, select several. */
export function Canvas({ sheet, blocks }: { sheet: SheetRow; blocks: SheetBlock[] }) {
  const unit = sheet.paper.spacing
  const [view, setView] = useState<View>(() => loadView(sheet.id))
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [focusId, setFocusId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const history = useMemo(() => createHistory(), [sheet.id])
  const host = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  // Latest values for listeners that are attached once.
  const live = useRef({ blocks, selected })
  live.current = { blocks, selected }

  useEffect(() => { try { localStorage.setItem(viewKey(sheet.id), JSON.stringify(view)) } catch { /* private mode */ } }, [sheet.id, view])
  // Empty side blocks left behind (the tab closed while one was open) are cleared when the page opens.
  useEffect(() => { void sheets.blocksFor(sheet.id).then((all) => Promise.all(all.map((b) => sheets.pruneEmpty(b)))) }, [sheet.id])
  useEffect(() => {
    const el = host.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Wheel pans; Ctrl/Cmd + wheel (and a trackpad pinch, which arrives as ctrl + wheel) zooms at the cursor.
  useEffect(() => {
    const el = host.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) setView((v) => zoomAt(v, e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0025)))
      else setView((v) => ({ ...v, x: v.x + e.deltaX / v.zoom, y: v.y + e.deltaY / v.zoom }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const run = useCallback(async (c: Change | null) => { if (c) await applyChange(c) }, [])
  const removeSelected = useCallback(async () => {
    const gone = live.current.blocks.filter((b) => live.current.selected.has(b.id) && b.role !== 'main')
    if (!gone.length) return
    const c: Change = { kind: 'batch', changes: gone.map((block) => ({ kind: 'remove', block })) }
    history.record(c)
    await applyChange(c)
    setSelected(new Set())
  }, [history])

  // Keys that act on blocks. Inside a text block, the editor handles its own keys (including undo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); void run(e.shiftKey ? history.redo() : history.undo()) }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); void run(history.redo()) }
      else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelected(new Set(live.current.blocks.map((b) => b.id))) }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && live.current.selected.size) { e.preventDefault(); void removeSelected() }
      else if (e.key === 'Escape') setSelected(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history, run, removeSelected])

  const local = (e: { clientX: number; clientY: number }) => {
    const r = host.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  // Empty paper: drag pans (one finger on touch), Shift + drag draws a selection box, two fingers pinch,
  // a click starts a text block (or, while something is selected or being edited, just lets go of it).
  const onPointerDown = (e: React.PointerEvent) => {
    try { host.current!.setPointerCapture(e.pointerId) } catch { /* a pointer the browser no longer tracks */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      setGesture({ kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom })
    } else if (e.shiftKey && e.pointerType !== 'touch') {
      const p = local(e), w = toWorld(view, p.x, p.y)
      setGesture({ kind: 'box', a: w, b: w })
    } else {
      // Pressing on empty paper takes focus away right now, so note whether a block was being edited.
      const active = document.activeElement
      setGesture({ kind: 'pan', sx: e.clientX, sy: e.clientY, moved: false, wasEditing: active instanceof HTMLElement && !!active.closest('.sblock') })
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev || !gesture) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (gesture.kind === 'pinch' && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const mid = local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 })
      const target = gesture.zoom * Math.hypot(a.x - b.x, a.y - b.y) / gesture.dist
      setView((v) => zoomAt(v, mid.x, mid.y, target / v.zoom))
    } else if (gesture.kind === 'box') {
      const p = local(e)
      setGesture({ ...gesture, b: toWorld(view, p.x, p.y) })
    } else if (gesture.kind === 'pan') {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y
      setView((v) => ({ ...v, x: v.x - dx / v.zoom, y: v.y - dy / v.zoom }))
      if (!gesture.moved && Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) > 4) setGesture({ ...gesture, moved: true })
    }
  }
  const onPointerUp = async (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size) return
    const g = gesture
    setGesture(null)
    if (!g) return
    if (g.kind === 'box') {
      setSelected(new Set(blocksInRect(blocks, { x: g.a.x / unit, y: g.a.y / unit }, { x: g.b.x / unit, y: g.b.y / unit })))
      return
    }
    if (g.kind !== 'pan' || g.moved) return
    if (selected.size) { setSelected(new Set()); return }
    if (g.wasEditing) return // the first click away just stops editing
    const p = local(e)
    const { gx, gy } = cellAt(view, p.x, p.y, unit)
    const block = await sheets.addBlock({ sheetId: sheet.id, x: gx, y: gy, w: 12, h: 1, kind: 'text', data: { doc: EMPTY_PARAGRAPH }, z: Math.max(0, ...blocks.map((b) => b.z)) + 1 })
    history.record({ kind: 'add', block })
    setFocusId(block.id)
  }

  const onDoc = useCallback((b: SheetBlock, doc: unknown) => sheets.saveBlockDoc(b.id, doc), [])

  /** Leaving a block saves it; a side block left empty goes away (one undo brings it back). */
  const onBlockBlur = useCallback(async (b: SheetBlock, doc: unknown) => {
    setFocusId((f) => (f === b.id ? null : f))
    if (b.role !== 'main' && sheets.isEmptyDoc(doc)) {
      const fresh = await sheets.blocksFor(sheet.id).then((all) => all.find((x) => x.id === b.id))
      if (fresh && await sheets.pruneEmpty({ ...fresh, data: { doc } })) history.record({ kind: 'remove', block: fresh })
      return
    }
    await onDoc(b, doc)
  }, [sheet.id, history, onDoc])

  /**
   * The grip moves a block (all selected blocks, if it's one of them); the right edge sets its width.
   * Both snap to the grid unless Alt is held. Shift + click on a grip adds it to or takes it out of the selection.
   */
  const startDrag = (b: SheetBlock, what: 'move' | 'width') => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (what === 'move' && e.shiftKey) {
      setSelected((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n })
      return
    }
    const moving = what === 'move' && selected.has(b.id) ? blocks.filter((x) => selected.has(x.id)) : [b]
    const sx = e.clientX, sy = e.clientY
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    let latest = moving
    const move = (ev: PointerEvent) => {
      const step = (px: number) => (ev.altKey ? px / unit : snapUnits(px, unit))
      const dx = step((ev.clientX - sx) / view.zoom), dy = step((ev.clientY - sy) / view.zoom)
      latest = moving.map((m) => (what === 'move' ? { ...m, x: m.x + dx, y: m.y + dy } : { ...m, w: Math.max(4, m.w + dx) }))
      for (const m of latest) void sheets.putBlock(m)
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      const changes: Change[] = moving
        .map((before, i) => ({ kind: 'update' as const, before, after: latest[i] }))
        .filter((c) => c.before.x !== c.after.x || c.before.y !== c.after.y || c.before.w !== c.after.w)
      if (changes.length) history.record(changes.length === 1 ? changes[0] : { kind: 'batch', changes })
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  const zoomBy = (factor: number) => setView((v) => zoomAt(v, size.w / 2, size.h / 2, factor))
  const box = gesture?.kind === 'box' ? { a: toScreen(view, gesture.a.x, gesture.a.y), b: toScreen(view, gesture.b.x, gesture.b.y) } : null
  return (
    <div className={`sheet-host ${gesture?.kind === 'pan' && gesture.moved ? 'panning' : ''}`} ref={host} style={paperStyle(sheet.paper, view)}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <div className="sheet-world" style={{ transform: `translate(${-view.x * view.zoom}px, ${-view.y * view.zoom}px) scale(${view.zoom})` }}>
        <div className="sheet-origin" aria-hidden="true" />
        {blocks.map((b) => (
          <div key={b.id} className={`sblock ${focusId === b.id ? 'focus' : ''} ${selected.has(b.id) ? 'selected' : ''}`}
            style={{ left: b.x * unit, top: b.y * unit, width: b.w * unit, zIndex: b.z }}
            onPointerDown={(e) => e.stopPropagation()}>
            <button className="sgrip" aria-label="Move block (Shift + click to select)" onPointerDown={startDrag(b, 'move')}><Icon name="grid" size={12} /></button>
            <TextBlock block={b} unit={unit} autoFocus={focusId === b.id}
              onDoc={(doc) => onDoc(b, doc)}
              onHeight={(h) => { if (h !== b.h) void sheets.updateBlock(b.id, { h }) }}
              onBlur={(doc) => onBlockBlur(b, doc)} />
            <span className="swidth" aria-hidden="true" onPointerDown={startDrag(b, 'width')} />
          </div>
        ))}
      </div>
      {box && <div className="sheet-box" style={{ left: Math.min(box.a.x, box.b.x), top: Math.min(box.a.y, box.b.y), width: Math.abs(box.a.x - box.b.x), height: Math.abs(box.a.y - box.b.y) }} />}
      <div className="sheet-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button className="btn sm" onClick={() => setView(START)}><Icon name="reset" size={14} />Back to start</button>
        <div className="zoomctl">
          <button aria-label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>−</button>
          <button className="pct" onClick={() => zoomBy(1 / view.zoom)} title="Back to 100%">{Math.round(view.zoom * 100)}%</button>
          <button aria-label="Zoom in" onClick={() => zoomBy(1.25)}>+</button>
        </div>
      </div>
      {blocks.length > 0 && size.w > 0 && (
        <Minimap blocks={blocks} unit={unit} view={view} size={size}
          onJump={(wx, wy) => setView((v) => ({ ...v, x: wx - size.w / 2 / v.zoom, y: wy - size.h / 2 / v.zoom }))} />
      )}
    </div>
  )
}

/** Every block as a box, the current view, and the start. Click to jump there. */
function Minimap({ blocks, unit, view, size, onJump }: { blocks: SheetBlock[]; unit: number; view: View; size: { w: number; h: number }; onJump: (wx: number, wy: number) => void }) {
  const vw = { x: view.x / unit, y: view.y / unit, w: size.w / view.zoom / unit, h: size.h / view.zoom / unit }
  const b = boundsOf([...blocks, vw, { x: 0, y: 0, w: 0, h: 0 }])!
  const W = 200, H = 132, pad = 6
  const k = Math.min((W - pad * 2) / Math.max(b.w, 1), (H - pad * 2) / Math.max(b.h, 1))
  const at = (x: number, y: number) => ({ left: pad + (x - b.x) * k, top: pad + (y - b.y) * k })
  return (
    <button className="sheet-minimap" aria-label="Map of the whole page. Click to jump there." onPointerDown={(e) => e.stopPropagation()} onClick={(e) => {
      const r = e.currentTarget.getBoundingClientRect()
      onJump(((e.clientX - r.left - pad) / k + b.x) * unit, ((e.clientY - r.top - pad) / k + b.y) * unit)
    }}>
      {blocks.map((bl) => <i key={bl.id} style={{ ...at(bl.x, bl.y), width: Math.max(2, bl.w * k), height: Math.max(2, bl.h * k) }} />)}
      <span className="mm-view" style={{ ...at(vw.x, vw.y), width: vw.w * k, height: vw.h * k }} />
      <span className="mm-start" style={at(0, 0)} />
    </button>
  )
}
