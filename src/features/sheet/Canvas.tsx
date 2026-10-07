import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as sheets from '../../data/sheets'
import * as inkData from '../../data/ink'
import { forgetLater, imagesIn } from '../../data/images'
import { imageNodes } from './editor/image'
import { anchorFor, distToStroke, encodePoints, insidePolygon, lassoPicks, recogniseShape, rubOut, shiftPoints, straightenHighlight, strokeBounds, textLineMid, type Pt } from '../../sheets/ink'
import { listMyBlocks, placeMyBlock, saveMyBlock } from '../../data/myblocks'
import { blocksInRect, boundsOf, cellAt, clearUnder, freeSpot, pushBelow, settle, type Place, paperStyle, pinchView, snapUnits, toScreen, toWorld, zoomAt, type View } from '../../sheets/grid'
import { applyChange, createHistory, type Change } from '../../sheets/history'
import { titleFrom } from '../../sheets/order'
import { pageCount, pageLines, sheetFrame } from '../../sheets/pages'
import { fontCss } from '../../sheets/fonts'
import type { InsertId } from '../../sheets/insert'
import { MAIN_BLOCK, type SheetBlock, type SheetRow, type SheetStroke } from '../../sheets/types'
import type { Editor } from '@tiptap/react'
import { isTyping } from '../../app/ui'
import { isDarkTheme, useSettings } from '../../settings/store'
import { useContextItems } from '../../ui/ContextMenu'
import { askName, chooseAction } from '../../ui/confirm'
import { addBox, adoptOrphans, createSubPage, deleteBox, kidsOf } from '../../data/subpages'
import { useNavigate } from 'react-router'
import { BoxBlock } from './BoxBlock'
import { toast } from '../../ui/toasts'
import { Icon } from '../../ui/Icons'
import { AiButton } from '../ai/AiButton'
import { openAi } from '../../ai/panel'
import { getKey } from '../../ai/key'
import { pictureIn, snap } from '../../ai/snap'
import { linesToDoc, transcribe } from '../../ai/transcribe'
import { PagePickerHost, TableSizeHost } from './editor/nodes'
import { Dock, MYBLOCK_DRAG, insertNow } from './Dock'
import { INSERT_DRAG, TextBlock } from './TextBlock'

/**
 * Redraws a text block only when its saved block, line spacing or focus changes. Its handlers are read
 * through a ref inside, so new handler functions on each canvas render don't count.
 */
const TextBlockMemo = memo(TextBlock, (a, b) => a.block === b.block && a.unit === b.unit && a.autoFocus === b.autoFocus && a.pages === b.pages)
import { Toolbar } from './Toolbar'
import { isInkTool, useSheetUI } from './store'
import { HIGHLIGHTERS, InkLayer, inkColor, useInk, worldPoints, type Draft, type InkShift } from './Ink'

const START: View = { x: 0, y: 0, zoom: 1 }
const viewKey = (id: string) => `mneme.sheet.view.${id}`
function loadView(id: string): View {
  try { return { ...START, ...JSON.parse(localStorage.getItem(viewKey(id)) ?? '{}') } } catch { return START }
}
const EMPTY_PARAGRAPH = { type: 'doc', content: [{ type: 'paragraph' }] }
/** Bookmark colours; the first is the default. */
export const MARK_COLORS = [
  { label: 'Orange', value: '#C8742C' }, { label: 'Red', value: '#C2412D' }, { label: 'Green', value: '#3F7A3A' },
  { label: 'Blue', value: '#3D6FB6' }, { label: 'Purple', value: '#7A55B0' }, { label: 'Grey', value: '#8A867C' },
]
export const markColor = (b: SheetBlock) => b.data.color ?? MARK_COLORS[0].value

/** A row of bookmark colours, the current one ringed. */
function MarkColors({ current, onPick }: { current: string; onPick: (c: string) => void }) {
  return (
    <span className="mark-colors" role="group" aria-label="Bookmark colour">
      {MARK_COLORS.map((c) => <button key={c.value} className={`ink-swatch sm ${current === c.value ? 'on' : ''}`} style={{ '--c': c.value } as React.CSSProperties} aria-label={c.label} aria-pressed={current === c.value} title={c.label} onClick={() => onPick(c.value)} />)}
    </span>
  )
}

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; moved: boolean; wasEditing: boolean; click: boolean }
  | { kind: 'box'; a: { x: number; y: number }; b: { x: number; y: number } }
  /** Two fingers: the view and where they were (canvas px) when the second one landed. */
  | { kind: 'pinch'; view: View; from: [{ x: number; y: number }, { x: number; y: number }] }
  | { kind: 'draw' }
  /** Strokes as they stand during this rub (`work`), the ones it removed that existed before, and the pieces it made. */
  | { kind: 'erase'; work: Map<string, SheetStroke>; before: Map<string, SheetStroke>; added: Map<string, SheetStroke>; writes: Promise<void> }
  | { kind: 'lasso' }

/** A pen has been used in this tab: with "only the pen draws" on Auto, fingers now move the page instead. */
let seenPen = false

/**
 * Class names that give a page its own light or dark paper, whatever the app uses. It takes the palette
 * you picked for that mode in Settings; a page set to the mode the app is already in just follows the app.
 */
export function usePaperTheme(s: SheetRow) {
  const settings = useSettings()
  const want = s.paper.theme
  if (!want || want === 'app' || (want === 'dark') === isDarkTheme(settings)) return ''
  const palette = want === 'dark' ? settings.darkPalette : settings.lightPalette
  return `paper-${want}${palette && palette !== 'paper' ? ` pal-${palette}` : ''}`
}

/**
 * The infinite canvas: pan, zoom, click to type, move and resize blocks on the grid, select several,
 * bookmarks, and drop targets for Insert.
 */
export function Canvas({ sheet, blocks, strokes }: { sheet: SheetRow; blocks: SheetBlock[]; strokes: SheetStroke[] }) {
  const unit = sheet.paper.spacing
  const nav = useNavigate()
  const [view, setView] = useState<View>(() => loadView(sheet.id))
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [focusId, setFocusId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [selInk, setSelInk] = useState<Set<string>>(() => new Set())
  const select = (ids: Iterable<string>, ink: Iterable<string> = []) => { setSelected(new Set(ids)); setSelInk(new Set(ink)) }
  // The stroke being drawn. It stays drawn until the saved stroke shows up, so nothing flickers.
  const [draft, setDraft] = useState<Draft | null>(null)
  const draftRef = useRef<Draft | null>(null)
  const landing = useRef<string | null>(null)
  const [lasso, setLasso] = useState<number[][] | null>(null)
  const [eraserAt, setEraserAt] = useState<{ x: number; y: number } | null>(null)
  const [inkShift, setInkShift] = useState<InkShift | null>(null)
  const shiftLanded = useRef(false)
  const hold = useRef<{ timer?: ReturnType<typeof setTimeout>; x: number; y: number }>({ x: 0, y: 0 })
  const taps = useRef({ t: 0, n: 0, moved: false })
  const prefs = useInk()
  // Heights as measured here. Only the block being edited writes its height, so a device that measures
  // slightly differently never marks a block changed (which would push its copy over newer text).
  const [heights, setHeights] = useState<Record<string, number>>({})
  // Where dragged blocks are drawn. A drag only moves these (no saving, no redrawing the text); the
  // drop saves once, and each entry goes when the saved block matches it.
  const [placed, setPlaced] = useState<Record<string, Place>>({})
  useEffect(() => { setPlaced((p) => (Object.keys(p).length ? settle(p, blocks) : p)) }, [blocks])
  const shown = useMemo(() => blocks.map((b) => {
    const p = placed[b.id], h = heights[b.id]
    return p || h ? { ...b, ...(p ?? {}), ...(h ? { h } : {}) } : b
  }), [blocks, heights, placed])
  const spots = useMemo(() => new Map(shown.map((b) => [b.id, { x: b.x, y: b.y }])), [shown])
  useEffect(() => {
    if (landing.current && strokes.some((x) => x.id === landing.current)) { landing.current = null; if (!draftRef.current) setDraft(null) }
    if (shiftLanded.current) { shiftLanded.current = false; setInkShift(null) }
  }, [strokes])
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
  const [space, setSpace] = useState(false)
  const tool = useSheetUI((s) => s.tool)
  const history = useMemo(() => createHistory(), [sheet.id])
  const host = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  /** Every finger on the canvas, on the paper or on a block. */
  const fingers = useRef(new Map<number, { x: number; y: number }>())
  const firstFinger = useRef(0)
  // Latest values for listeners that are attached once.
  const live = useRef({ blocks, selected, view, size, shown, strokes, selInk, spots, prefs })
  live.current = { blocks, selected, view, size, shown, strokes, selInk, spots, prefs }
  const main = blocks.find((b) => b.role === 'main')
  const theme = usePaperTheme(sheet)
  // Pages layout: sheets behind the main column, which breaks between them.
  const pageSize = sheet.paper.size ?? 'a4'
  const paged = sheet.paper.layout === 'pages'
  const breaks = useMemo(() => (paged ? { perPage: pageLines(pageSize, unit), unit } : null), [paged, pageSize, unit])

  useEffect(() => { try { localStorage.setItem(viewKey(sheet.id), JSON.stringify(view)) } catch { /* private mode */ } }, [sheet.id, view])
  // Empty side blocks left behind (the tab closed while one was open) are cleared when the page opens.
  useEffect(() => { void sheets.pruneLeftovers(sheet.id) }, [sheet.id])
  // Sub-pages whose box was deleted on another device go back into a box.
  useEffect(() => { void adoptOrphans(sheet.id) }, [sheet.id])
  useEffect(() => {
    const el = host.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Picking up the pen, highlighter or eraser lets go of the selection, so its frame can't get in the way.
  useEffect(() => { if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') { setSelected(new Set()); setSelInk(new Set()) } }, [tool])
  // Leaving the page puts the tools back to typing and closes Insert.
  useEffect(() => () => useSheetUI.setState({ tool: 'text', insertOpen: false, editor: null, lastEditor: null, blockId: null, canvas: null }), [])

  // Wheel pans; Ctrl/Cmd + wheel (and a trackpad pinch, which arrives as ctrl + wheel) zooms at the cursor.
  useEffect(() => {
    const el = host.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      // Firefox reports lines, not pixels.
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1
      if (e.ctrlKey || e.metaKey) setView((v) => zoomAt(v, e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * k * 0.0025)))
      else setView((v) => ({ ...v, x: v.x + (e.deltaX * k) / v.zoom, y: v.y + (e.deltaY * k) / v.zoom }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const nextZ = () => Math.max(0, ...live.current.blocks.map((b) => b.z)) + 1
  const middleCell = () => {
    const { view: v, size: s } = live.current
    const c = toWorld(v, s.w / 2, s.h / 3)
    return { x: Math.floor(c.x / unit) - 6, y: Math.floor(c.y / unit) }
  }
  /** Deletes blocks (not the main column) with whatever is drawn on them, and any strokes in `inkIds`. One undo brings it all back. */
  const removeNow = useCallback(async (ids: Set<string>, inkIds: Set<string> = new Set()) => {
    const gone = live.current.blocks.filter((b) => ids.has(b.id) && b.role !== 'main')
    const goneIds = new Set(gone.map((b) => b.id))
    const goneInk = live.current.strokes.filter((st) => inkIds.has(st.id) || (st.blockId && goneIds.has(st.blockId)))
    const list: Change[] = [...gone.map((block) => ({ kind: 'remove' as const, block })), ...goneInk.map((stroke) => ({ kind: 'ink-remove' as const, stroke }))]
    if (!list.length) return
    const c: Change = list.length === 1 ? list[0] : { kind: 'batch', changes: list }
    history.record(c)
    await applyChange(c)
    select([])
    for (const b of gone) for (const i of imagesIn(b.data.doc)) forgetLater(i.local, i.hash, i.stored)
    const what = gone.length === 1 ? 'Block deleted' : gone.length ? `${gone.length} blocks deleted` : 'Drawing deleted'
    toast(what, list.length === 1 ? 'Ctrl+Z brings it back' : 'Ctrl+Z brings them back', 'trash')
  }, [history])
  /** Same, but boxes holding pages ask first: their pages go to Recently deleted, or move to another box. */
  const removeSelection = useCallback(async (ids: Set<string>, inkIds: Set<string> = new Set()) => {
    const boxes = live.current.blocks.filter((x) => ids.has(x.id) && x.kind === 'box')
    const kids = boxes.length ? (await kidsOf(sheet.id)).filter((s) => boxes.some((bx) => bx.id === s.box)) : []
    if (!kids.length) return removeNow(ids, inkIds)
    const c = await chooseAction({
      title: kids.length === 1 ? 'Delete the page in this box too?' : `Delete the ${kids.length} pages in ${boxes.length === 1 ? 'this box' : 'these boxes'} too?`,
      body: 'Pages you keep move into another box on this page.',
      choices: [{ value: 'keep', label: 'Keep them' }, { value: 'all', label: 'Delete them', danger: true }],
    })
    if (!c) return
    for (const bx of boxes) await deleteBox(bx.id, c === 'all')
    select([])
    toast(c === 'all' ? 'Box and pages deleted' : 'Box deleted', c === 'all' ? 'The pages are in Recently deleted' : 'Its pages moved to another box', 'trash')
    const rest = new Set([...ids].filter((x) => !boxes.some((bx) => bx.id === x)))
    if (rest.size || inkIds.size) await removeNow(rest, inkIds)
  }, [removeNow, sheet.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const removeBlocks = useCallback((ids: Set<string>) => removeSelection(ids), [removeSelection])
  const addMade = useCallback((made: { blocks: SheetBlock[]; ink: SheetStroke[] }) => {
    const list: Change[] = [...made.blocks.map((block) => ({ kind: 'add' as const, block })), ...made.ink.map((stroke) => ({ kind: 'ink-add' as const, stroke }))]
    if (list.length) history.record(list.length === 1 ? list[0] : { kind: 'batch', changes: list })
  }, [history])
  const undo = useCallback(() => { const c = history.undo(); if (c) void applyChange(c) }, [history])
  const redo = useCallback(() => { const c = history.redo(); if (c) void applyChange(c) }, [history])
  const jumpTo = useCallback((p: { x: number; y: number }) => {
    const { size: s } = live.current
    setView((v) => ({ ...v, x: p.x - 48 / v.zoom, y: p.y - s.h / 4 / v.zoom }))
  }, [])
  const addBookmark = useCallback(async (at?: { x: number; y: number }) => {
    const label = await askName({ title: 'Name this bookmark', value: '', confirm: 'Add bookmark' })
    if (!label) return
    const c = at ?? middleCell()
    const b = await sheets.addBlock({ sheetId: sheet.id, x: c.x, y: c.y, w: 1, h: 1, kind: 'bookmark', data: { doc: null, label }, z: nextZ() })
    history.record({ kind: 'add', block: b })
    toast('Bookmark added', 'Jump to it from Contents', 'flag')
  }, [sheet.id, history]) // eslint-disable-line react-hooks/exhaustive-deps
  const addBoxAt = useCallback(async (at?: { x: number; y: number }) => {
    const c = at ?? freeSpot(live.current.shown, middleCell(), MAIN_BLOCK.w, 4)
    const b = await addBox(sheet.id, '', c)
    history.record({ kind: 'add', block: b })
    select([b.id])
  }, [sheet.id, history]) // eslint-disable-line react-hooks/exhaustive-deps

  // What the toolbar, dock and Insert can ask of the canvas.
  useEffect(() => {
    useSheetUI.setState({
      canvas: {
        newBlock: async (content, at) => {
          const c = at ?? freeSpot(live.current.shown, middleCell(), 16, 4)
          const b = await sheets.addBlock({ sheetId: sheet.id, x: c.x, y: c.y, w: 16, h: 1, kind: 'text', data: { doc: { type: 'doc', content: [...content, { type: 'paragraph' }] } }, z: nextZ() })
          history.record({ kind: 'add', block: b })
          setFocusId(b.id)
          return b.id
        },
        placeGroup: async (group, at) => {
          const g = (await listMyBlocks()).find((x) => x.group === group)
          if (!g) return
          const box = boundsOf(g.blocks) ?? { w: 1, h: 1 }
          const made = await placeMyBlock(g, sheet.id, at ?? freeSpot(live.current.shown, middleCell(), box.w, box.h))
          addMade(made)
          select(made.blocks.map((b) => b.id))
        },
        addBookmark,
        addBox: addBoxAt,
        jumpTo,
        undo,
        redo,
        removeBlock: (id) => removeBlocks(new Set([id])),
        cellAtClient: (cx, cy) => {
          const r = host.current?.getBoundingClientRect()
          if (!r || cx < r.left || cy < r.top || cx > r.right || cy > r.bottom) return null
          const { gx, gy } = cellAt(live.current.view, cx - r.left, cy - r.top, unit)
          return { x: gx, y: gy }
        },
      },
    })
  }) // re-registered every render so it always sees the latest page

  // A drag whose release never reached the paper (it ended over another window, say) is over all the same,
  // so its pan cursor can't stay behind.
  useEffect(() => {
    const done = (e: PointerEvent) => {
      if (host.current?.hasPointerCapture(e.pointerId) || !pointers.current.has(e.pointerId)) return
      pointers.current.delete(e.pointerId)
      if (pointers.current.size) return
      setGesture(null)
      // A stroke whose end never reached the paper isn't kept half-drawn.
      if (draftRef.current) { clearTimeout(hold.current.timer); draftRef.current = null; setDraft(null) }
      setLasso(null)
    }
    window.addEventListener('pointerup', done)
    window.addEventListener('pointercancel', done)
    return () => { window.removeEventListener('pointerup', done); window.removeEventListener('pointercancel', done) }
  }, [])

  // Keys that act on blocks. Inside a text block, the editor handles its own keys (including undo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || document.querySelector('[role=dialog]')) return
      // Space held over the paper pans, unless it's pressing a focused button or link.
      if (e.key === ' ' && !e.repeat && !(e.target as Element | null)?.closest?.('button, a, select, summary, [role=button], [role=menuitem]')) { setSpace(true); e.preventDefault() }
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
      else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); select(live.current.blocks.map((b) => b.id), live.current.strokes.map((x) => x.id)) }
      else if (mod && e.key.toLowerCase() === 'd' && (live.current.selected.size || live.current.selInk.size)) { e.preventDefault(); void duplicate(live.current.selected, live.current.selInk) }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && (live.current.selected.size || live.current.selInk.size)) { e.preventDefault(); void removeSelection(live.current.selected, live.current.selInk) }
      else if (e.key === 'Escape') { select([]); if (draftRef.current) cancelInk() }
    }
    const onUp = (e: KeyboardEvent) => { if (e.key === ' ') setSpace(false) }
    const onBlur = () => { setSpace(false); pointers.current.clear(); fingers.current.clear(); setGesture(null) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onUp); window.removeEventListener('blur', onBlur) }
  }, [undo, redo, removeSelection]) // eslint-disable-line react-hooks/exhaustive-deps

  const duplicate = async (ids: Set<string>, inkIds: Set<string> = new Set()) => {
    const made = await sheets.duplicateBlocks(live.current.blocks.filter((b) => ids.has(b.id)), live.current.strokes.filter((x) => inkIds.has(x.id)), unit)
    addMade(made)
    select(made.blocks.map((b) => b.id), made.ink.map((x) => x.id))
  }
  /** New colour for the selected strokes. */
  const recolor = async (color: string) => {
    const list = live.current.strokes.filter((x) => live.current.selInk.has(x.id) && x.color !== color)
    if (!list.length) return
    const changes: Change[] = list.map((before) => ({ kind: 'ink-update', before, after: { ...before, color } }))
    history.record(changes.length === 1 ? changes[0] : { kind: 'batch', changes })
    await inkData.putStrokes(list.map((x) => ({ ...x, color })))
  }
  const saveAsMine = async (ids: Set<string>) => {
    const list = live.current.shown.filter((b) => ids.has(b.id))
    if (!list.length) return
    const name = await askName({ title: 'Save as my block', value: list.map((b) => titleFrom(b.data.doc)).find(Boolean) ?? '', confirm: 'Save' })
    if (!name) return
    await saveMyBlock(name, list)
    toast('Saved to My blocks', 'Find it in Insert on any page', 'star')
  }
  /** Moves a block along the grid from the keyboard (its grip or bookmark focused): arrows a line, Shift+arrows four. */
  const keyMove = (b: SheetBlock, rename?: () => void) => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 4 : 1
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (d) {
      e.preventDefault(); e.stopPropagation()
      const after = { ...b, x: b.x + d[0], y: b.y + d[1] }
      history.record({ kind: 'update', before: b, after })
      void sheets.updateBlock(b.id, { x: after.x, y: after.y })
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); e.stopPropagation()
      if (rename) rename(); else select([b.id])
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); e.stopPropagation()
      void removeSelection(new Set([b.id]))
    }
  }
  /** A new name or colour for a bookmark (one undo puts it back). */
  const editMark = (b: SheetBlock, patch: { label?: string; color?: string }) => {
    const after = { ...b, data: { ...b.data, ...patch } }
    history.record({ kind: 'update', before: b, after })
    return sheets.updateBlock(b.id, { data: after.data })
  }
  const renameMark = async (b: SheetBlock) => { const label = await askName({ title: 'Rename bookmark', value: b.data.label ?? '', confirm: 'Rename' }); if (label && label !== b.data.label) await editMark(b, { label }) }
  // The main column's tallest measured height while being typed in.
  const pushedAt = useRef<Record<string, number>>({})
  /**
   * The main column changed height. Typing in it pushes the blocks under it (a box of pages, say) down
   * by what it grew. Otherwise (the page loading, an edit from another device) it only moves a box that
   * ended up inside the column, which happens to one made while its real height wasn't known.
   */
  const growMain = (b: SheetBlock, h: number) => {
    const from = pushedAt.current[b.id]
    pushedAt.current[b.id] = Math.max(from ?? h, h)
    const at = live.current.shown.find((x) => x.id === b.id) ?? b
    const typing = !!document.querySelector(`[data-block-id="${b.id}"]`)?.contains(document.activeElement)
    if (typing && from !== undefined) {
      if (h <= from) return
      const ids = pushBelow({ ...at, h: from }, h, live.current.shown).map((x) => x.id)
      if (ids.length) void sheets.shiftBlocks(ids, h - from)
    } else {
      const fix = clearUnder(at, h, live.current.shown)
      if (fix) void sheets.shiftBlocks(fix.ids, fix.dy)
    }
  }
  /** A box's title works like a bookmark's name: one undo puts it back. */
  const renameBox = (b: SheetBlock, label: string) => void editMark(b, { label })
  const toFront = (b: SheetBlock) => sheets.updateBlock(b.id, { z: nextZ() })
  const toBack = (b: SheetBlock) => sheets.updateBlock(b.id, { z: Math.min(0, ...live.current.blocks.map((x) => x.z)) - 1 })

  const local = (e: { clientX: number; clientY: number }) => {
    const r = host.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  // Right-click: blocks, bookmarks and empty paper each get their own menu.
  useContextItems((e, { target }) => {
    if (!target.closest('.sheet-host') || target.closest('.sbox-card')) return null // cards get the page menu
    const el = target.closest<HTMLElement>('[data-block-id]')
    const b = el && live.current.blocks.find((x) => x.id === el.dataset.blockId)
    if (b?.kind === 'bookmark') {
      return [
        { key: 'colors', custom: (close) => <MarkColors current={markColor(b)} onPick={(color) => { close(); void editMark(b, { color }) }} /> },
        { label: 'Rename bookmark…', icon: 'edit', onSelect: () => renameMark(b) },
        { label: 'Delete bookmark', icon: 'trash', danger: true, onSelect: () => removeBlocks(new Set([b.id])) },
      ]
    }
    if (b?.kind === 'box') {
      return [
        { label: 'New page in this box', icon: 'plus', onSelect: async () => nav(`/write/${await createSubPage(sheet.id, b.id, useSettings.getState().paperDefault ?? undefined)}`) },
        { label: 'Rename box…', icon: 'edit', onSelect: async () => { const label = await askName({ title: 'Rename box', value: b.data.label ?? '', confirm: 'Rename' }); if (label && label !== b.data.label) renameBox(b, label) } },
        { sep: true as const },
        { label: 'Delete box', icon: 'trash', danger: true, onSelect: () => removeSelection(new Set([b.id])) },
      ]
    }
    if (b) {
      const ids = live.current.selected.has(b.id) ? live.current.selected : new Set([b.id])
      const inkIds = live.current.selected.has(b.id) ? live.current.selInk : new Set<string>()
      const many = ids.size > 1
      return [
        { label: many ? `Duplicate ${ids.size} blocks` : 'Duplicate', icon: 'copy', kbd: 'Ctrl D', onSelect: () => duplicate(ids, inkIds) },
        { label: 'Save as my block…', icon: 'star', onSelect: () => saveAsMine(ids) },
        ...(!many ? [
          { label: 'Bring to front', icon: 'upload', onSelect: () => toFront(b) },
          { label: 'Send to back', icon: 'down', onSelect: () => toBack(b) },
        ] : []),
        { sep: true as const },
        b.role === 'main' && !many
          ? { label: "The main column can't be deleted", disabled: true, onSelect: () => {} }
          : { label: many ? `Delete ${ids.size} blocks` : 'Delete block', icon: 'trash', kbd: 'Del', danger: true, onSelect: () => removeSelection(ids, inkIds) },
      ]
    }
    const p = local(e)
    const { gx, gy } = cellAt(live.current.view, p.x, p.y, unit)
    return [
      { label: 'Write here', icon: 'text', onSelect: async () => { const nb = await sheets.addBlock({ sheetId: sheet.id, x: gx, y: gy, w: 12, h: 1, kind: 'text', data: { doc: EMPTY_PARAGRAPH }, z: nextZ() }); history.record({ kind: 'add', block: nb }); setFocusId(nb.id) } },
      { label: 'Insert here…', icon: 'plus', onSelect: () => useSheetUI.setState({ insertOpen: true }) },
      { label: 'Add a bookmark here', icon: 'flag', onSelect: () => addBookmark({ x: gx, y: gy }) },
      { label: 'Add a box of pages here', icon: 'page', onSelect: () => addBoxAt({ x: gx, y: gy }) },
      { sep: true as const },
      { label: 'Select all', kbd: 'Ctrl A', onSelect: () => select(live.current.blocks.map((x) => x.id), live.current.strokes.map((x) => x.id)) },
      { label: 'Recenter page', icon: 'reset', onSelect: () => setView(START) },
    ]
  })

  // Empty paper. Typing tool: drag pans, click starts a text block. Select tool: drag draws a selection box.
  // Pan tool, Space + drag and middle-drag pan. One finger uses the tool; two fingers pan and pinch-zoom.
  // Shift + drag always selects.
  const onPointerDown = (e: React.PointerEvent) => {
    useSheetUI.setState({ editor: null }) // the toolbar lets go of the block you were in
    const mouse = e.pointerType === 'mouse'
    if (e.pointerType === 'pen') seenPen = true
    if (mouse && e.button !== 0 && e.button !== 1) return // right-click opens the menu
    if (mouse && e.button === 1) e.preventDefault() // no autoscroll
    const inking = isInkTool(tool)
    const penOnly = prefs.penOnly === 'on' || (prefs.penOnly === 'auto' && seenPen)
    const fingerPans = inking && penOnly && e.pointerType === 'touch'
    // Palm rejection: while the pen is drawing, a hand resting on the screen does nothing.
    if (fingerPans && (gesture?.kind === 'draw' || gesture?.kind === 'erase' || gesture?.kind === 'lasso')) return
    try { host.current!.setPointerCapture(e.pointerId) } catch { /* a pointer the browser no longer tracks */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (e.pointerType === 'touch') {
      const now = performance.now()
      taps.current = pointers.current.size === 1 ? { t: now, n: 1, moved: false } : { ...taps.current, n: now - taps.current.t < 250 ? pointers.current.size : 0 }
    }
    const panOnly = (mouse && e.button === 1) || space || tool === 'pan' || fingerPans
    if (pointers.current.size === 2) startPinch()
    else if (inking && !panOnly) {
      startInk(e)
    } else if (!panOnly && (e.shiftKey || tool === 'select')) {
      const p = local(e), w = toWorld(view, p.x, p.y)
      setGesture({ kind: 'box', a: w, b: w })
    } else {
      // Pressing on empty paper takes focus away right now, so note whether a block was being edited.
      const active = document.activeElement
      setGesture({ kind: 'pan', sx: e.clientX, sy: e.clientY, moved: false, wasEditing: active instanceof HTMLElement && !!active.closest('.sblock'), click: !panOnly && tool === 'text' })
    }
  }
  /** A second finger: the two pan and zoom the page. A stroke the first one started is dropped. */
  const startPinch = () => {
    if (draftRef.current) cancelInk()
    setLasso(null)
    const [a, b] = [...pointers.current.values()]
    setGesture({ kind: 'pinch', view, from: [local({ clientX: a.x, clientY: a.y }), local({ clientX: b.x, clientY: b.y })] })
  }
  // Fingers on text count too: on a phone the main column covers most of the screen, so a finger that
  // landed on a block (which handles its own presses) still makes a two-finger pan when a second one lands.
  const onTouchDownCapture = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    if (!fingers.current.size) firstFinger.current = performance.now()
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (fingers.current.size !== 2) return
    // A pen or mouse in use: palm rejection in onPointerDown decides.
    if ([...pointers.current.keys()].some((id) => !fingers.current.has(id))) return
    e.preventDefault()
    e.stopPropagation()
    pointers.current = new Map(fingers.current)
    for (const id of fingers.current.keys()) { try { host.current!.setPointerCapture(id) } catch { /* gone already */ } }
    // Both down at once is a two-finger tap (undo) if they lift without moving.
    taps.current = { t: firstFinger.current, n: performance.now() - firstFinger.current < 250 ? 2 : 0, moved: false }
    startPinch()
  }
  const onTouchUpCapture = (e: React.PointerEvent) => { if (e.pointerType === 'touch') fingers.current.delete(e.pointerId) }
  const onPointerMove = (e: React.PointerEvent) => {
    if (tool === 'eraser' && e.pointerType !== 'touch') { const p = local(e); setEraserAt(toWorld(view, p.x, p.y)) }
    const prev = pointers.current.get(e.pointerId)
    if (!prev || !gesture) return
    if (e.pointerType === 'touch' && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) > 2) taps.current.moved = true
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (gesture.kind === 'draw') { extendDraft(e); return }
    if (gesture.kind === 'erase') { const p = local(e); eraseAt(gesture, toWorld(view, p.x, p.y)); return }
    if (gesture.kind === 'lasso') { const p = local(e), w = toWorld(view, p.x, p.y); setLasso((l) => (l ? [...l, [w.x, w.y]] : l)); return }
    if (gesture.kind === 'pinch' && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      setView(pinchView(gesture.view, gesture.from, [local({ clientX: a.x, clientY: a.y }), local({ clientX: b.x, clientY: b.y })]))
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
    if (!pointers.current.has(e.pointerId)) return // a palm the pen ignored
    pointers.current.delete(e.pointerId)
    try { host.current?.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    if (pointers.current.size) return
    // Two fingers tapped together: undo.
    if (e.pointerType === 'touch' && taps.current.n === 2 && !taps.current.moved && performance.now() - taps.current.t < 400) {
      taps.current.n = 0
      setGesture(null)
      undo()
      return
    }
    const g = gesture
    setGesture(null)
    if (g?.kind === 'erase') { finishErase(g); return }
    if (g?.kind === 'draw') { if (e.type === 'pointercancel') cancelInk(); else void finishDraw(); return }
    if (g?.kind === 'lasso') { finishLasso(); return }
    if (!g || e.type === 'pointercancel') return
    if (g.kind === 'box') {
      const x0 = Math.min(g.a.x, g.b.x), x1 = Math.max(g.a.x, g.b.x), y0 = Math.min(g.a.y, g.b.y), y1 = Math.max(g.a.y, g.b.y)
      select(blocksInRect(shown, { x: g.a.x / unit, y: g.a.y / unit }, { x: g.b.x / unit, y: g.b.y / unit }), strokes.filter((x) => {
        const pts = worldPoints(x, spots, unit)
        if (!pts) return false
        const r = strokeBounds(pts), cx = r.x + r.w / 2, cy = r.y + r.h / 2
        return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1
      }).map((x) => x.id))
      return
    }
    if (g.kind !== 'pan' || g.moved) return
    if (selected.size || selInk.size) { select([]); return }
    if (!g.click || g.wasEditing) return // the first click away just stops editing
    const p = local(e)
    const { gx, gy } = cellAt(view, p.x, p.y, unit)
    const block = await sheets.addBlock({ sheetId: sheet.id, x: gx, y: gy, w: 12, h: 1, kind: 'text', data: { doc: EMPTY_PARAGRAPH }, z: nextZ() })
    history.record({ kind: 'add', block })
    setFocusId(block.id)
  }

  // ---------- ink ----------
  const cancelInk = () => { clearTimeout(hold.current.timer); draftRef.current = null; setDraft(null); setLasso(null) }
  /** Hold still for a moment at the end of a pen stroke and it becomes a clean shape (Alt: off the grid). */
  const armHold = (cx: number, cy: number, alt: boolean) => {
    clearTimeout(hold.current.timer)
    hold.current = {
      x: cx, y: cy, timer: setTimeout(() => {
        const d = draftRef.current
        if (!d || d.shape || d.tool !== 'pen' || !live.current.prefs.shapes) return
        const shape = recogniseShape(d.pts, unit, !alt)
        if (shape) { const n = { ...d, pts: shape.pts, shape: true }; draftRef.current = n; setDraft(n) }
      }, 550),
    }
  }
  const pressureOf = (ev: PointerEvent | React.PointerEvent) => (ev.pointerType === 'pen' && prefs.pressure ? ev.pressure || 0.5 : 0.5)
  const startInk = (e: React.PointerEvent) => {
    const p = local(e), w = toWorld(view, p.x, p.y)
    if (tool === 'lasso') { select([]); setLasso([[w.x, w.y]]); setGesture({ kind: 'lasso' }); return }
    if (tool === 'eraser') {
      const g = { kind: 'erase' as const, work: new Map(strokes.map((x) => [x.id, x])), before: new Map<string, SheetStroke>(), added: new Map<string, SheetStroke>(), writes: Promise.resolve() }
      setGesture(g)
      eraseAt(g, w)
      return
    }
    const pen = tool === 'pen'
    const d: Draft = {
      tool: pen ? 'pen' : 'highlighter', pts: [[w.x, w.y, pressureOf(e)]], color: pen ? prefs.pens[prefs.pen] : prefs.highlighter,
      size: pen ? prefs.penSize : prefs.highlighterSize, shape: false, sim: pen && prefs.pressure && e.pointerType !== 'pen',
    }
    draftRef.current = d
    setDraft(d)
    setGesture({ kind: 'draw' })
    armHold(e.clientX, e.clientY, e.altKey)
  }
  const extendDraft = (e: React.PointerEvent) => {
    const d = draftRef.current
    if (!d || d.shape) return
    const r = host.current!.getBoundingClientRect()
    const evs = e.nativeEvent.getCoalescedEvents?.() ?? []
    const add: Pt[] = (evs.length ? evs : [e.nativeEvent]).map((ev) => {
      const w = toWorld(view, ev.clientX - r.left, ev.clientY - r.top)
      return [w.x, w.y, pressureOf(ev)]
    })
    const n = { ...d, pts: [...d.pts, ...add] }
    draftRef.current = n
    setDraft(n)
    if (Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 3) armHold(e.clientX, e.clientY, e.altKey)
  }
  /** The middle (world y) of the line of text a highlighter stroke went over, if any. */
  const highlightedLine = (pts: Pt[]) => {
    const r = host.current?.getBoundingClientRect()
    if (!r) return null
    const b = strokeBounds(pts), my = pts.reduce((s, p) => s + p[1], 0) / pts.length
    const a = toScreen(view, b.x, my), z = toScreen(view, b.x + b.w, my)
    for (const el of host.current!.querySelectorAll('.sblock .ProseMirror')) {
      const mid = textLineMid(el, r.left + a.x, r.left + z.x, r.top + a.y)
      if (mid !== null) return toWorld(view, 0, mid - r.top).y
    }
    return null
  }
  /** Saves the stroke: a highlighter along a line straightens onto it; one drawn mostly over a block is pinned to it. */
  const finishDraw = async () => {
    clearTimeout(hold.current.timer)
    const d = draftRef.current
    draftRef.current = null
    if (!d) return
    let pts = d.pts, shape = d.shape
    if (d.tool === 'highlighter' && !shape) { const st = straightenHighlight(pts, unit, highlightedLine(pts)); if (st) { pts = st; shape = true } }
    if (d.tool === 'highlighter' && pts.length < 2) { setDraft(null); return }
    const rects = live.current.shown.filter((b) => b.kind === 'text').map((b) => ({ id: b.id, x: b.x * unit, y: b.y * unit, w: b.w * unit, h: b.h * unit }))
    const blockId = anchorFor(pts, rects)
    const at = blockId ? rects.find((r) => r.id === blockId)! : null
    const own = at ? pts.map(([x, y, pr]): Pt => [x - at.x, y - at.y, pr]) : pts
    const row = await inkData.addStroke({
      sheetId: sheet.id, ...(blockId ? { blockId } : {}), tool: d.tool, color: d.color, size: d.size, pts: encodePoints(own),
      ...(shape ? { shape: true } : {}), ...(d.sim && !shape ? { sim: true } : {}),
    })
    landing.current = row.id
    history.record({ kind: 'ink-add', stroke: row })
  }
  /** Erases under (x, y): whole strokes, or just the part rubbed over (the rest stays as separate pieces). */
  const eraseAt = (g: Extract<Gesture, { kind: 'erase' }>, w: { x: number; y: number }) => {
    const { prefs: pr, spots: at, view: v } = live.current
    const r = pr.eraserSize / 2 / v.zoom
    const gone: string[] = [], made: SheetStroke[] = []
    for (const st of g.work.values()) {
      const pts = worldPoints(st, at, unit)
      if (!pts) continue
      const reach = r + st.size / 2
      if (pr.eraser === 'stroke') { if (distToStroke(pts, [w.x, w.y]) <= reach) gone.push(st.id); continue }
      const pieces = rubOut(pts, [w.x, w.y], reach)
      if (!pieces) continue
      gone.push(st.id)
      const b = st.blockId ? at.get(st.blockId) : null
      const ox = b ? b.x * unit : 0, oy = b ? b.y * unit : 0
      const now = Date.now()
      for (const piece of pieces) made.push({ ...st, id: crypto.randomUUID(), pts: encodePoints(piece.map(([x, y, pp]): Pt => [x - ox, y - oy, pp])), createdAt: now, updatedAt: now })
    }
    if (!gone.length) return
    for (const id of gone) {
      const st = g.work.get(id)!
      g.work.delete(id)
      if (g.added.has(id)) g.added.delete(id); else g.before.set(id, st)
    }
    for (const st of made) { g.work.set(st.id, st); g.added.set(st.id, st) }
    // In order: a piece made a moment ago may be rubbed out again before it's even saved.
    g.writes = g.writes.then(() => inkData.deleteStrokes(gone)).then(() => inkData.putStrokes(made))
  }
  const finishErase = (g: Extract<Gesture, { kind: 'erase' }>) => {
    const changes: Change[] = [...[...g.before.values()].map((stroke) => ({ kind: 'ink-remove' as const, stroke })), ...[...g.added.values()].map((stroke) => ({ kind: 'ink-add' as const, stroke }))]
    if (changes.length) history.record(changes.length === 1 ? changes[0] : { kind: 'batch', changes })
  }
  /** Selects the strokes mostly inside the lasso, and the blocks whose middle is. */
  const finishLasso = () => {
    const poly = lasso
    setLasso(null)
    if (!poly || poly.length < 3) return
    const inks = lassoPicks(strokes.map((x) => ({ id: x.id, pts: worldPoints(x, spots, unit) ?? [] })), poly)
    const inside = shown.filter((b) => insidePolygon([(b.x + b.w / 2) * unit, (b.y + Math.max(1, b.h) / 2) * unit], poly)).map((b) => b.id)
    select(inside, inks)
  }

  /**
   * Saves a block's text. A side block emptied without anyone in it (its only equation removed, say)
   * goes away instead of sitting there blank.
   */
  const onDoc = useCallback(async (b: SheetBlock, doc: unknown) => {
    const here = document.querySelector(`[data-block-id="${b.id}"]`)
    if (b.role !== 'main' && sheets.isEmptyDoc(doc) && !here?.contains(document.activeElement)) {
      const fresh = await sheets.getBlock(b.id)
      if (fresh && await sheets.pruneEmpty({ ...fresh, data: { doc } })) { history.record({ kind: 'remove', block: fresh }); return }
    }
    await sheets.saveBlockDoc(b.id, doc)
  }, [history])

  /** Leaving a block saves it; a side block left empty goes away (one undo brings it back). */
  const onBlockBlur = useCallback(async (b: SheetBlock, doc: unknown) => {
    setFocusId((f) => (f === b.id ? null : f))
    if (b.role !== 'main' && sheets.isEmptyDoc(doc)) {
      const fresh = await sheets.getBlock(b.id)
      if (fresh && await sheets.pruneEmpty({ ...fresh, data: { doc } })) history.record({ kind: 'remove', block: fresh })
      return
    }
    await onDoc(b, doc)
  }, [history, onDoc])

  /**
   * Moving and sizing. A grip moves its block (or the whole selection); the right edge sets width. Both snap
   * to the grid unless Alt is held. A click on a grip without moving selects that block (Shift adds to the
   * selection), so Delete, Duplicate and the rest apply to it.
   */
  const startDrag = (b: SheetBlock | null, what: 'move' | 'width') => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const moving = !b ? blocks.filter((x) => selected.has(x.id)) : what === 'move' && selected.has(b.id) ? blocks.filter((x) => selected.has(x.id)) : [b]
    const movingIds = new Set(moving.map((m) => m.id))
    // Selected strokes come along. Ones drawn on a block that moves ride on it already.
    const inkMoving = what === 'move' && (!b || selected.has(b.id)) ? strokes.filter((x) => selInk.has(x.id) && !(x.blockId && movingIds.has(x.blockId))) : []
    let shift = { dx: 0, dy: 0 }
    const sx = e.clientX, sy = e.clientY
    const el = e.currentTarget as HTMLElement
    try { el.setPointerCapture(e.pointerId) } catch { /* a pointer the browser no longer tracks */ }
    let latest = moving
    let moved = false
    let frame = 0
    let last: PointerEvent | null = null
    // At most once a frame: work out where everything lands and draw it there. Nothing is saved yet.
    const place = () => {
      frame = 0
      const ev = last
      if (!ev) return
      // Blocks snap to the grid (Alt: free); drawing on its own moves freely.
      const step = (px: number) => (ev.altKey || !moving.length ? px / unit : snapUnits(px, unit))
      const dx = step((ev.clientX - sx) / view.zoom), dy = step((ev.clientY - sy) / view.zoom)
      latest = moving.map((m) => (what === 'move' ? { ...m, x: m.x + dx, y: m.y + dy } : { ...m, w: Math.max(4, m.w + dx) }))
      setPlaced((p) => {
        const n = { ...p }
        for (const m of latest) n[m.id] = { x: m.x, y: m.y, w: m.w }
        return n
      })
      if (inkMoving.length) { shift = { dx: dx * unit, dy: dy * unit }; setInkShift({ ...shift, blocks: movingIds }) }
    }
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return
      moved = true
      last = ev
      if (!frame) frame = requestAnimationFrame(place)
    }
    // A second finger takes the pointer for a pan: keep what was moved, or just stop.
    const lost = (ev: PointerEvent) => { if (moved) up(ev); else stop() }
    const stop = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('lostpointercapture', lost)
    }
    const up = (ev: PointerEvent) => {
      if (frame) { cancelAnimationFrame(frame); place() }
      stop()
      if (!moved && b && what === 'move') {
        ;(document.activeElement as HTMLElement | null)?.blur?.()
        setSelected((s) => {
          if (!ev.shiftKey) return new Set([b.id])
          const n = new Set(s)
          if (n.has(b.id)) n.delete(b.id); else n.add(b.id)
          return n
        })
        return
      }
      if (!moved && !b) {
        // A click on the selection (not a drag) lets go of it and puts the cursor where you clicked.
        select([])
        const pm = document.elementsFromPoint(ev.clientX, ev.clientY).find((x) => x.classList.contains('ProseMirror')) as (Element & { editor?: Editor }) | undefined
        const ed = pm?.editor
        const at = ed?.view.posAtCoords({ left: ev.clientX, top: ev.clientY })
        if (ed && at) ed.chain().focus().setTextSelection(at.pos).run()
        return
      }
      const changes: Extract<Change, { kind: 'update' }>[] = moving
        .map((before, i) => ({ kind: 'update' as const, before, after: latest[i] }))
        .filter((c) => c.before.x !== c.after.x || c.before.y !== c.after.y || c.before.w !== c.after.w)
      const inkChanges: Extract<Change, { kind: 'ink-update' }>[] = shift.dx || shift.dy
        ? inkMoving.map((before) => ({ kind: 'ink-update' as const, before, after: { ...before, pts: shiftPoints(before.pts, shift.dx, shift.dy) } }))
        : []
      if (!changes.length && !inkChanges.length) { setPlaced((p) => settle(p, blocks)); setInkShift(null); return }
      const all: Change[] = [...changes, ...inkChanges]
      history.record(all.length === 1 ? all[0] : { kind: 'batch', changes: all })
      // One write for the whole drop. Patches, not whole rows: text may have changed meanwhile.
      void sheets.updateBlocks(changes.map((c) => ({ id: c.after.id, patch: what === 'move' ? { x: c.after.x, y: c.after.y } : { w: c.after.w } })))
      if (inkChanges.length) { shiftLanded.current = true; void inkData.updateStrokes(inkChanges.map((c) => ({ id: c.after.id, patch: { pts: c.after.pts } }))) }
      else setInkShift(null)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('lostpointercapture', lost)
  }

  // Insert tiles and My blocks dropped on the paper land in the cell under the pointer.
  const dragKind = (e: React.DragEvent) => (e.dataTransfer.types.includes(INSERT_DRAG) ? INSERT_DRAG : e.dataTransfer.types.includes(MYBLOCK_DRAG) ? MYBLOCK_DRAG : e.dataTransfer.types.includes('Files') ? 'Files' : null)
  const onDragOver = (e: React.DragEvent) => {
    if (!dragKind(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    const p = local(e)
    const { gx, gy } = cellAt(view, p.x, p.y, unit)
    setGhost((g) => (g && g.x === gx && g.y === gy ? g : { x: gx, y: gy }))
  }
  const onDrop = async (e: React.DragEvent) => {
    const kind = dragKind(e)
    setGhost(null)
    if (!kind) return
    e.preventDefault()
    const p = local(e)
    const { gx, gy } = cellAt(view, p.x, p.y, unit)
    if (kind === MYBLOCK_DRAG) { useSheetUI.setState({ insertOpen: false }); await useSheetUI.getState().canvas?.placeGroup(e.dataTransfer.getData(MYBLOCK_DRAG), { x: gx, y: gy }); return }
    if (kind === 'Files') {
      const nodes = await imageNodes(Array.from(e.dataTransfer.files), sheet.id)
      if (nodes.length) await useSheetUI.getState().canvas?.newBlock(nodes, { x: gx, y: gy })
      return
    }
    await insertNow(e.dataTransfer.getData(INSERT_DRAG) as InsertId, { x: gx, y: gy })
  }

  const zoomBy = (factor: number) => setView((v) => zoomAt(v, size.w / 2, size.h / 2, factor))
  const box = gesture?.kind === 'box' ? { a: toScreen(view, gesture.a.x, gesture.a.y), b: toScreen(view, gesture.b.x, gesture.b.y) } : null
  // The selection frame takes in selected strokes too (in grid units, shifted while they're dragged).
  const inkBoxes = strokes.filter((x) => selInk.has(x.id)).flatMap((x) => {
    const pts = worldPoints(x, spots, unit)
    if (!pts) return []
    const r = strokeBounds(pts), pad = x.size / 2
    const sh = inkShift && !(x.blockId && inkShift.blocks.has(x.blockId)) ? inkShift : null
    return [{ x: (r.x - pad + (sh?.dx ?? 0)) / unit, y: (r.y - pad + (sh?.dy ?? 0)) / unit, w: (r.w + pad * 2) / unit, h: (r.h + pad * 2) / unit }]
  })
  const mainShown = shown.find((b) => b.role === 'main')
  const selCount = selected.size + selInk.size
  const sel = selCount ? boundsOf([...shown.filter((b) => selected.has(b.id)), ...inkBoxes]) : null
  const many = selCount > 1
  const selMark = selCount === 1 && selected.size === 1 ? shown.find((b) => selected.has(b.id) && b.kind === 'bookmark') : undefined

  // Gemini on the selection: what's written there as text, what's drawn as a picture.
  const selBox = () => document.querySelector('.sheet-sel')?.getBoundingClientRect() ?? null
  const askAboutSel = async () => {
    const box = selBox()
    if (!box) return
    const { text, image } = await snap(box)
    openAi({
      id: `sheet:${sheet.id}:${Date.now()}`,
      title: `About your selection on ${sheet.title || 'this page'}`,
      pinned: { context: `Page: ${sheet.title || 'Untitled'}\n\nText in the selection:\n${text || '(none, just drawing)'}${image ? '\n\nA picture of the selection is attached: it shows the handwriting and drawings.' : ''}`, images: image ? [image] : [] },
    })
  }
  const [reading, setReading] = useState(false)
  const inkToText = async () => {
    const box = selBox(), key = await getKey()
    if (!box || !key || !sel || reading) return
    setReading(true)
    try {
      const img = await pictureIn(box)
      if (!img) throw new Error('There’s no ink in the selection to read.')
      const lines = await transcribe(key, img)
      if (!lines.length) throw new Error('Gemini couldn’t make out the writing.')
      const b = await sheets.addBlock({ sheetId: sheet.id, x: Math.floor(sel.x), y: Math.ceil(sel.y + sel.h) + 1, w: Math.max(12, Math.ceil(sel.w)), h: 1, kind: 'text', data: { doc: linesToDoc(lines) }, z: nextZ() })
      history.record({ kind: 'add', block: b })
      toast('Written out below', 'Your ink is still there to keep or delete')
    } catch (e) { toast('Couldn’t read it', e instanceof Error ? e.message : 'Try again', 'x') }
    finally { setReading(false) }
  }
  const panning = (gesture?.kind === 'pan' && gesture.moved) || gesture?.kind === 'pinch'
  const inking = isInkTool(tool) && !space
  const cursor = panning ? 'panning' : space || tool === 'pan' ? 'can-pan' : tool === 'select' ? 'can-select' : inking ? `inking ink-${tool}` : ''
  return (
    <div className="sheet-wrap">
      <Toolbar mainBlockId={main?.id} />
      <div className={`sheet-host ${cursor} ${theme}`} ref={host}
        style={{ ...(paged ? { backgroundColor: 'var(--desk)' } : paperStyle(sheet.paper, view)), '--page-font': fontCss(sheet.paper.font) } as React.CSSProperties}
        onPointerDownCapture={onTouchDownCapture} onPointerUpCapture={onTouchUpCapture} onPointerCancelCapture={onTouchUpCapture}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onMouseDown={(e) => { if (e.button === 1) e.preventDefault() }}
        onPointerLeave={() => setEraserAt(null)}
        onLostPointerCapture={(e) => { if (!pointers.current.has(e.pointerId)) return; pointers.current.delete(e.pointerId); if (!pointers.current.size && gesture?.kind !== 'draw' && gesture?.kind !== 'erase' && gesture?.kind !== 'lasso') setGesture(null) }}
        onDragOver={onDragOver} onDragLeave={(e) => { if (e.currentTarget === e.target) setGhost(null) }} onDrop={onDrop}>
        <div className="sheet-world" style={{ transform: `translate(${-view.x * view.zoom}px, ${-view.y * view.zoom}px) scale(${view.zoom})` }}>
          <div className="sheet-origin" aria-hidden="true" />
          {paged && mainShown && <Sheets main={mainShown} paper={sheet.paper} unit={unit} />}
          {blocks.map((b) => { const at = placed[b.id] ?? b; return b.kind === 'bookmark' ? (
            <div key={b.id} data-block-id={b.id} className={`sbookmark ${selected.has(b.id) ? 'selected' : ''}`} style={{ left: at.x * unit, top: at.y * unit, height: unit, zIndex: b.z, '--mark': markColor(b) } as React.CSSProperties}
              onPointerDown={startDrag(b, 'move')} onDoubleClick={() => void renameMark(b)}
              tabIndex={0} role="button" aria-label={`Bookmark: ${b.data.label}. Enter renames, arrows move it, Delete removes it.`} onKeyDown={keyMove(b, () => void renameMark(b))}
              title="Drag to move. Click for its name and colour">
              <Icon name="flag" size={14} /><span>{b.data.label}</span>
            </div>
          ) : b.kind === 'box' ? (
            <div key={b.id} data-block-id={b.id} className={`sblock sblock-box ${selected.has(b.id) ? 'selected' : ''} ${many && selected.has(b.id) ? 'in-group' : ''}`}
              style={{ left: at.x * unit, top: at.y * unit, width: at.w * unit, zIndex: b.z }}
              onPointerDown={(e) => { if (e.button !== 1 && !space && tool !== 'pan') e.stopPropagation() }}>
              <button className="sgrip" aria-label="Move box: arrow keys move it, Enter selects it, Delete removes it" title="Drag to move · click to select (then Delete)" onPointerDown={startDrag(b, 'move')} onKeyDown={keyMove(b)}><Icon name="grid" size={12} /></button>
              <BoxBlock block={b}
                onHeight={(px) => {
                  const h = Math.max(1, Math.ceil(px / unit))
                  setHeights((m) => (m[b.id] === h ? m : { ...m, [b.id]: h }))
                  if (h !== b.h) void sheets.updateBlock(b.id, { h })
                }}
                onRename={(label) => renameBox(b, label)} />
              <span className="swidth" aria-hidden="true" onPointerDown={startDrag(b, 'width')} />
            </div>
          ) : (
            <div key={b.id} data-block-id={b.id} className={`sblock ${focusId === b.id ? 'focus' : ''} ${selected.has(b.id) ? 'selected' : ''} ${many && selected.has(b.id) ? 'in-group' : ''}`}
              style={{ left: at.x * unit, top: at.y * unit, width: at.w * unit, zIndex: b.z }}
              onPointerDown={(e) => { if (e.button !== 1 && !space && tool !== 'pan') e.stopPropagation() }}>
              <button className="sgrip" aria-label="Move block: arrow keys move it, Enter selects it, Delete removes it" title="Drag to move · click to select (then Delete)" onPointerDown={startDrag(b, 'move')} onKeyDown={keyMove(b)}><Icon name="grid" size={12} /></button>
              <TextBlockMemo block={b} unit={unit} autoFocus={focusId === b.id} pages={b.role === 'main' ? breaks : null}
                onDoc={(doc) => onDoc(b, doc)}
                onHeight={(h) => {
                  setHeights((m) => (m[b.id] === h ? m : { ...m, [b.id]: h }))
                  if (b.role === 'main') growMain(b, h)
                  if (h !== b.h && focusId === b.id) void sheets.updateBlock(b.id, { h })
                }}
                onBlur={(doc) => onBlockBlur(b, doc)} />
              <span className="swidth" aria-hidden="true" onPointerDown={startDrag(b, 'width')} />
            </div>
          ) })}
          <InkLayer strokes={strokes} blocks={spots} unit={unit} selected={selInk} shift={inkShift} draft={draft} lasso={lasso}
            eraser={tool === 'eraser' && eraserAt ? { ...eraserAt, r: prefs.eraserSize / 2 / view.zoom } : null} />
          {sel && (
            <div className={`sheet-sel ${many ? 'many' : ''} ${selMark ? 'mark' : ''}`} style={{ left: sel.x * unit - 6, top: sel.y * unit - 6, width: sel.w * unit + 12, height: sel.h * unit + 12 }}
              onPointerDown={startDrag(null, 'move')} title="Drag to move · click to edit">
              {(many || !selected.size) && <button className="sel-grip" aria-label={`Move the ${selCount} selected things`} title="Drag to move them all" onPointerDown={startDrag(null, 'move')}><Icon name="grid" size={13} /></button>}
              <div className="sel-bar" onPointerDown={(e) => e.stopPropagation()} style={{ transform: `scale(${1 / view.zoom})` }}>
                <span className="n">{many ? `${selCount} selected` : selMark ? 'Bookmark' : 'Selected'}</span>
                {selMark && <>
                  <button onClick={() => void renameMark(selMark)} title="Rename  Enter"><Icon name="edit" size={14} />Rename</button>
                  <MarkColors current={markColor(selMark)} onPick={(color) => void editMark(selMark, { color })} />
                </>}
                {!selMark && <button onClick={() => duplicate(selected, selInk)} title="Duplicate  Ctrl+D"><Icon name="copy" size={14} />Duplicate</button>}
                {selected.size > 0 && !selMark && <button onClick={() => saveAsMine(selected)} title="Save to My blocks (with what's drawn on them)"><Icon name="star" size={14} />Save</button>}
                {selInk.size > 0 && (
                  <span className="sel-colors" role="group" aria-label="Colour">
                    {[...new Set([...prefs.pens, ...HIGHLIGHTERS])].map((c) => <button key={c} className="ink-swatch sm" style={{ '--c': inkColor(c) } as React.CSSProperties} aria-label={`Colour ${c === 'ink' ? 'like the text' : c}`} onClick={() => void recolor(c)} />)}
                  </span>
                )}
                {!selMark && <AiButton className="" onClick={() => void askAboutSel()} title="Ask Gemini about what you selected"><Icon name="spark" size={14} />Ask Gemini</AiButton>}
                {selInk.size > 0 && <AiButton className="" onClick={() => void inkToText()} disabled={reading} title="Write the handwriting out as text, maths as equations"><Icon name="text" size={14} />{reading ? 'Reading…' : 'To text'}</AiButton>}
                <button className="danger" disabled={!many && main !== undefined && selected.has(main.id)} onClick={() => removeSelection(selected, selInk)} title="Delete  Del"><Icon name="trash" size={14} />Delete</button>
              </div>
            </div>
          )}
          {ghost && <div className="sheet-ghost" style={{ left: ghost.x * unit, top: ghost.y * unit, width: 16 * unit, height: 3 * unit }} />}
        </div>
        {box && <div className="sheet-box" style={{ left: Math.min(box.a.x, box.b.x), top: Math.min(box.a.y, box.b.y), width: Math.abs(box.a.x - box.b.x), height: Math.abs(box.a.y - box.b.y) }} />}
      </div>
      <div className="sheet-zoom">
        <button className="btn sm" onClick={() => setView(START)} aria-label="Recenter page" title="Back to where the page starts, at 100%"><Icon name="reset" size={14} /><span className="zl">Recenter page</span></button>
        <div className="zoomctl">
          <button aria-label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>−</button>
          <button className="pct" onClick={() => zoomBy(1 / view.zoom)} title="Back to 100%">{Math.round(view.zoom * 100)}%</button>
          <button aria-label="Zoom in" onClick={() => zoomBy(1.25)}>+</button>
        </div>
      </div>
      <Dock />
      {blocks.length > 0 && size.w > 0 && (
        <Minimap blocks={shown} unit={unit} view={view} size={size}
          onJump={(wx, wy) => setView((v) => ({ ...v, x: wx - size.w / 2 / v.zoom, y: wy - size.h / 2 / v.zoom }))} />
      )}
      <PagePickerHost exclude={sheet.id} />
      <TableSizeHost />
    </div>
  )
}

/** The sheets of paper behind the main column in Pages layout, each with the page's lines. */
function Sheets({ main, paper, unit }: { main: SheetBlock; paper: SheetRow['paper']; unit: number }) {
  const f = sheetFrame(main, paper.size ?? 'a4', unit)
  const n = pageCount(main.h, f.perPage)
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const top = f.top + i * f.pitch
        return (
          <div key={i} className="sheet-page" aria-hidden="true" style={{ left: f.left, top, width: f.width, height: f.height, ...paperStyle({ ...paper, margin: false }, { x: f.left, y: top, zoom: 1 }) }}>
            {paper.pageNumbers && <span className="sheet-page-n">{i + 1}</span>}
          </div>
        )
      })}
    </>
  )
}

/** Every block as a box, bookmarks as dots, the current view, and the start. Click to jump there. */
function Minimap({ blocks, unit, view, size, onJump }: { blocks: SheetBlock[]; unit: number; view: View; size: { w: number; h: number }; onJump: (wx: number, wy: number) => void }) {
  const vw = { x: view.x / unit, y: view.y / unit, w: size.w / view.zoom / unit, h: size.h / view.zoom / unit }
  const b = boundsOf([...blocks, vw, { x: 0, y: 0, w: 0, h: 0 }])!
  const W = 200, H = 132, pad = 6
  const k = Math.min((W - pad * 2) / Math.max(b.w, 1), (H - pad * 2) / Math.max(b.h, 1))
  const at = (x: number, y: number) => ({ left: pad + (x - b.x) * k, top: pad + (y - b.y) * k })
  return (
    <button className="sheet-minimap" aria-label="Map of the whole page. Click to jump there." onClick={(e) => {
      const r = e.currentTarget.getBoundingClientRect()
      onJump(((e.clientX - r.left - pad) / k + b.x) * unit, ((e.clientY - r.top - pad) / k + b.y) * unit)
    }}>
      {blocks.map((bl) => bl.kind === 'bookmark'
        ? <b key={bl.id} className="mm-mark" style={{ ...at(bl.x, bl.y), background: markColor(bl) }} title={bl.data.label} />
        : <i key={bl.id} style={{ ...at(bl.x, bl.y), width: Math.max(2, bl.w * k), height: Math.max(2, bl.h * k) }} />)}
      <span className="mm-view" style={{ ...at(vw.x, vw.y), width: vw.w * k, height: vw.h * k }} />
      <span className="mm-start" style={at(0, 0)} />
    </button>
  )
}
