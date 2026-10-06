import type { CSSProperties } from 'react'
import type { Paper } from './types'

// Canvas maths. World coordinates are px from the start (0, 0); blocks store grid units (one unit = the
// paper's line spacing). A view is the world point at the screen's top-left corner, plus the zoom.

export type View = { x: number; y: number; zoom: number }
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export const toWorld = (v: View, sx: number, sy: number) => ({ x: v.x + sx / v.zoom, y: v.y + sy / v.zoom })
export const toScreen = (v: View, wx: number, wy: number) => ({ x: (wx - v.x) * v.zoom, y: (wy - v.y) * v.zoom })

/** The grid cell under a screen point. */
export function cellAt(v: View, sx: number, sy: number, unit: number) {
  const w = toWorld(v, sx, sy)
  return { gx: Math.floor(w.x / unit), gy: Math.floor(w.y / unit) }
}
/** A distance in px to the nearest whole number of grid units. */
export const snapUnits = (px: number, unit: number) => Math.round(px / unit) || 0
/** A height in px as whole lines, at least one. */
export const linesFor = (px: number, unit: number) => Math.max(1, Math.ceil(px / unit - 0.01))

/** Zoom by `factor`, keeping the world point under (sx, sy) where it is on screen. */
export function zoomAt(v: View, sx: number, sy: number, factor: number): View {
  const zoom = clampZoom(v.zoom * factor)
  const w = toWorld(v, sx, sy)
  return { zoom, x: w.x - sx / zoom, y: w.y - sy / zoom }
}

type XY = { x: number; y: number }
/**
 * Two fingers moved from `from` to `to` (screen px, relative to the canvas): the page under the point
 * between them at the start stays under that point now (a pan), scaled by how far they spread (a zoom).
 */
export function pinchView(start: View, from: [XY, XY], to: [XY, XY]): View {
  const mid = (p: [XY, XY]) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 })
  const gap = (p: [XY, XY]) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1
  const m0 = mid(from), m1 = mid(to), w = toWorld(start, m0.x, m0.y)
  const zoom = clampZoom(start.zoom * gap(to) / gap(from))
  return { zoom, x: w.x - m1.x / zoom, y: w.y - m1.y / zoom }
}

export function boundsOf(blocks: { x: number; y: number; w: number; h: number }[]) {
  if (!blocks.length) return null
  const x = Math.min(...blocks.map((b) => b.x)), y = Math.min(...blocks.map((b) => b.y))
  const r = Math.max(...blocks.map((b) => b.x + b.w)), btm = Math.max(...blocks.map((b) => b.y + b.h))
  return { x, y, w: r - x, h: btm - y }
}

/** Ids of blocks that overlap the box between two corners (grid units, any order). */
export function blocksInRect(blocks: { id: string; x: number; y: number; w: number; h: number }[], a: { x: number; y: number }, b: { x: number; y: number }): string[] {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y)
  return blocks.filter((k) => k.x < x1 && k.x + k.w > x0 && k.y < y1 && k.y + k.h > y0).map((k) => k.id)
}

/** Where a new w×h block can go: `at` if nothing is there, else the first clear spot below, a line under what's in the way. */
export function freeSpot(blocks: { x: number; y: number; w: number; h: number }[], at: { x: number; y: number }, w: number, h: number) {
  let y = at.y
  for (let guard = 0; guard < 500; guard++) {
    const hit = blocks.find((b) => b.x < at.x + w && b.x + b.w > at.x && b.y < y + h && b.y + b.h > y)
    if (!hit) break
    y = hit.y + hit.h + 1
  }
  return { x: at.x, y }
}

export type Place = { x: number; y: number; w: number }
/** Positions shown while dragging, minus those the saved blocks now match (the drag has landed). */
export function settle(over: Record<string, Place>, blocks: { id: string; x: number; y: number; w: number }[]): Record<string, Place> {
  const left: Record<string, Place> = {}
  for (const b of blocks) {
    const o = over[b.id]
    if (o && (o.x !== b.x || o.y !== b.y || o.w !== b.w)) left[b.id] = o
  }
  return left
}

const MAIN_COLUMN_X = 3
const MARGIN_RED = 'color-mix(in oklab, #C0503A 55%, transparent)'
const lineColor = (p: Paper, boost = 1) => `color-mix(in oklab, ${p.color ?? 'var(--ink)'} ${Math.min(100, Math.round((6 + p.strength * 22) * boost))}%, transparent)`

/** CSS background for the paper, tied to the world origin so it pans and zooms with the content. */
export function paperStyle(p: Paper, v: View): CSSProperties {
  const s = p.spacing * v.zoom
  const ox = -v.x * v.zoom
  // Lines fall between rows, so each line of text sits in the middle of its row.
  const oy = -v.y * v.zoom
  const c = lineColor(p)
  const images: string[] = [], sizes: string[] = [], positions: string[] = [], repeats: string[] = []
  const layer = (image: string, size: string, position: string, repeat = 'repeat') => { images.push(image); sizes.push(size); positions.push(position); repeats.push(repeat) }
  if (p.margin) layer(`linear-gradient(to right, ${MARGIN_RED}, ${MARGIN_RED})`, '1.5px 100%', `${(MAIN_COLUMN_X * p.spacing - p.spacing / 2 - v.x) * v.zoom}px 0px`, 'repeat-y')
  if (p.lines === 'ruled') layer(`linear-gradient(to bottom, ${c} 0 1px, transparent 1px)`, `100% ${s}px`, `0px ${oy}px`)
  if (p.lines === 'squares') {
    layer(`linear-gradient(to bottom, ${c} 0 1px, transparent 1px)`, `${s}px ${s}px`, `${ox}px ${oy}px`)
    layer(`linear-gradient(to right, ${c} 0 1px, transparent 1px)`, `${s}px ${s}px`, `${ox}px ${oy}px`)
  }
  if (p.lines === 'dots') layer(`radial-gradient(circle, ${lineColor(p, 2)} 1.1px, transparent 1.7px)`, `${s}px ${s}px`, `${ox - s / 2}px ${oy - s / 2}px`)
  return {
    backgroundColor: p.paperColor ?? 'var(--bg)',
    backgroundImage: images.length ? images.join(', ') : 'none',
    backgroundSize: sizes.join(', ') || undefined,
    backgroundPosition: positions.join(', ') || undefined,
    backgroundRepeat: repeats.join(', ') || undefined,
  }
}
