import { memo, useMemo, useState } from 'react'
import { decodePoints, strokePath, type Pt } from '../../sheets/ink'
import type { SheetStroke } from '../../sheets/types'
import { DEFAULT_INK, useSettings, type InkPrefs } from '../../settings/store'
import { ColorPicker } from '../../ui/ColorPicker'
import { Icon } from '../../ui/Icons'
import { Seg, Toggle } from '../../ui/controls'
import { useSheetUI } from './store'

export const inkColor = (c: string) => (c === 'ink' ? 'var(--ink)' : c)
export const HIGHLIGHTERS = ['#F2CF3D', '#8FD175', '#F59AB8', '#7EC4F2']
export const useInk = (): InkPrefs => ({ ...DEFAULT_INK, ...useSettings((s) => s.ink) })
export const setInk = (patch: Partial<InkPrefs>) => { const s = useSettings.getState(); s.set({ ink: { ...DEFAULT_INK, ...s.ink, ...patch } }) }

// Points are decoded once per stored stroke (rows are replaced, never changed in place).
const decoded = new WeakMap<number[], Pt[]>()
export function pointsOf(s: SheetStroke): Pt[] {
  let p = decoded.get(s.pts)
  if (!p) { p = decodePoints(s.pts); decoded.set(s.pts, p) }
  return p
}
type Spot = { x: number; y: number }
/** A stroke's points in world px (anchored strokes are stored relative to their block), or null when its block is gone. */
export function worldPoints(s: SheetStroke, blocks: Map<string, Spot>, unit: number): Pt[] | null {
  const pts = pointsOf(s)
  if (!s.blockId) return pts
  const b = blocks.get(s.blockId)
  if (!b) return null
  const ox = b.x * unit, oy = b.y * unit
  return pts.map(([x, y, p]) => [x + ox, y + oy, p])
}

const StrokeView = memo(function StrokeView({ s, selected }: { s: SheetStroke; selected: boolean }) {
  const d = useMemo(() => strokePath(pointsOf(s), { size: s.size, shape: s.shape, highlighter: s.tool === 'highlighter', simulate: s.sim }), [s])
  const c = inkColor(s.color)
  const cls = `${s.tool === 'highlighter' ? 'ink-hl' : ''} ${selected ? 'ink-sel' : ''}`
  return s.shape
    ? <path d={d} className={cls} fill="none" stroke={c} strokeWidth={s.size} strokeLinecap={s.tool === 'highlighter' ? 'butt' : 'round'} strokeLinejoin="round" />
    : <path d={d} className={cls} fill={c} />
})

export type Draft = { tool: 'pen' | 'highlighter'; pts: Pt[]; color: string; size: number; shape: boolean; sim: boolean }
/** Selected strokes being dragged: drawn shifted by (dx, dy) px, except those riding on a block that moves too. */
export type InkShift = { dx: number; dy: number; blocks: Set<string> }

/**
 * Both ink layers of a page, inside the canvas world: highlighter behind the text, pen in front.
 * Also draws the stroke being drawn, the lasso and the eraser.
 */
export function InkLayer({ strokes, blocks, unit, selected, shift, draft, lasso, eraser }: {
  strokes: SheetStroke[]; blocks: Map<string, Spot>; unit: number; selected: Set<string>; shift: InkShift | null
  draft: Draft | null; lasso: number[][] | null; eraser: { x: number; y: number; r: number } | null
}) {
  const layer = (under: boolean) => strokes.filter((s) => (s.tool === 'highlighter') === under).map((s) => {
    let tx = 0, ty = 0
    if (s.blockId) {
      const b = blocks.get(s.blockId)
      if (!b) return null
      tx = b.x * unit; ty = b.y * unit
    }
    if (shift && selected.has(s.id) && !(s.blockId && shift.blocks.has(s.blockId))) { tx += shift.dx; ty += shift.dy }
    return <g key={s.id} transform={tx || ty ? `translate(${tx} ${ty})` : undefined}><StrokeView s={s} selected={selected.has(s.id)} /></g>
  })
  const live = draft && draft.pts.length > 0 && (
    draft.shape
      ? <path d={strokePath(draft.pts, { size: draft.size, shape: true })} className={draft.tool === 'highlighter' ? 'ink-hl' : 'ink-snap'} fill="none" stroke={inkColor(draft.color)} strokeWidth={draft.size} strokeLinecap="round" strokeLinejoin="round" />
      : <path d={strokePath(draft.pts, { size: draft.size, highlighter: draft.tool === 'highlighter', simulate: draft.sim })} className={draft.tool === 'highlighter' ? 'ink-hl' : ''} fill={inkColor(draft.color)} />
  )
  return (
    <>
      <svg className="ink-layer under" aria-hidden="true">{layer(true)}{draft?.tool === 'highlighter' && live}</svg>
      <svg className="ink-layer over" aria-hidden="true">
        {layer(false)}
        {draft?.tool === 'pen' && live}
        {lasso && lasso.length > 1 && <polyline className="ink-lasso" points={lasso.map((p) => `${p[0]},${p[1]}`).join(' ')} />}
        {eraser && <circle className="ink-eraser" cx={eraser.x} cy={eraser.y} r={eraser.r} />}
      </svg>
    </>
  )
}

/** Drawn on a block in Read view and print: the block's own strokes, at the block's top-left. */
export function BlockInk({ strokes }: { strokes: SheetStroke[] }) {
  if (!strokes.length) return null
  return (
    <svg className="ink-layer block" aria-hidden="true">
      {strokes.map((s) => <StrokeView key={s.id} s={s} selected={false} />)}
    </svg>
  )
}

const SIZES = { pen: [1.5, 2.5, 4.5], highlighter: [12, 18, 26], eraser: [8, 16, 32] } as const

/** Settings for the ink tool in use, just above the dock. */
export function InkBar() {
  const tool = useSheetUI((s) => s.tool)
  const p = useInk()
  const [more, setMore] = useState(false)
  if (tool !== 'pen' && tool !== 'highlighter' && tool !== 'eraser' && tool !== 'lasso') return null
  const sizes = tool === 'lasso' ? [] : SIZES[tool]
  const size = tool === 'pen' ? p.penSize : tool === 'highlighter' ? p.highlighterSize : p.eraserSize
  const setSize = (v: number) => setInk(tool === 'pen' ? { penSize: v } : tool === 'highlighter' ? { highlighterSize: v } : { eraserSize: v })
  return (
    <div className="ink-bar" onPointerDown={(e) => e.stopPropagation()} role="toolbar" aria-label={`${tool} settings`}>
      {tool === 'pen' && p.pens.map((c, i) => (
        <span key={i} className={`ink-slot ${p.pen === i ? 'on' : ''}`}>
          <button className="ink-swatch" style={{ '--c': inkColor(c) } as React.CSSProperties} aria-label={`Pen colour ${i + 1}`} aria-pressed={p.pen === i}
            title={p.pen === i ? 'In use. Change it with the picker beside it.' : 'Use this colour'} onClick={() => setInk({ pen: i as 0 | 1 | 2 })} />
          {p.pen === i && <ColorPicker value={c === 'ink' ? null : c} fallback="#2D6CDF" active={false} label={`Change pen colour ${i + 1}`}
            onChange={(hex) => { const pens = [...p.pens] as InkPrefs['pens']; pens[i] = hex; setInk({ pens }) }} />}
        </span>
      ))}
      {tool === 'highlighter' && HIGHLIGHTERS.map((c) => (
        <button key={c} className={`ink-swatch hl ${p.highlighter === c ? 'on' : ''}`} style={{ '--c': c } as React.CSSProperties} aria-label={`Highlighter colour ${c}`} aria-pressed={p.highlighter === c} onClick={() => setInk({ highlighter: c })} />
      ))}
      {tool === 'eraser' && <Seg value={p.eraser} onChange={(eraser) => setInk({ eraser })} options={[{ value: 'stroke', label: 'Whole strokes' }, { value: 'rub', label: 'Rub out' }]} />}
      {tool === 'lasso' && <span className="ink-hint">Draw around ink and blocks to select them</span>}
      {sizes.length > 0 && <i className="dk-sep" />}
      {sizes.map((v, i) => (
        <button key={v} className={`ink-size ${size === v ? 'on' : ''}`} aria-label={['Thin', 'Medium', 'Thick'][i]} aria-pressed={size === v} onClick={() => setSize(v)}>
          <i style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
        </button>
      ))}
      {tool === 'pen' && (
        <span className="ink-more">
          <button className={`iconbtn ${more ? 'on' : ''}`} aria-label="Pen settings" aria-expanded={more} onClick={() => setMore((m) => !m)}><Icon name="gear" size={16} /></button>
          {more && (
            <div className="ink-pop" role="dialog" aria-label="Pen settings">
              <label className="ink-row"><span>Thickness</span><input type="range" min={0.8} max={10} step={0.1} value={p.penSize} onChange={(e) => setInk({ penSize: Number(e.target.value) })} /></label>
              <label className="ink-row"><span>Smoothing</span><input type="range" min={0} max={1} step={0.05} value={p.smoothing} onChange={(e) => setInk({ smoothing: Number(e.target.value) })} /></label>
              <div className="ink-row"><span>Pressure</span><Toggle on={p.pressure} onChange={(pressure) => setInk({ pressure })} label="Pen pressure changes thickness" /></div>
              <div className="ink-row"><span>Hold to make a shape</span><Toggle on={p.shapes} onChange={(shapes) => setInk({ shapes })} label="Hold at the end of a stroke to make a shape" /></div>
              <div className="ink-row col"><span>Only the pen draws, fingers move the page</span>
                <Seg value={p.penOnly} onChange={(penOnly) => setInk({ penOnly })} options={[{ value: 'auto', label: 'Once I use a pen' }, { value: 'on', label: 'Always' }, { value: 'off', label: 'Never' }]} />
              </div>
            </div>
          )}
        </span>
      )}
    </div>
  )
}
