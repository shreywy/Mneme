import { getStroke } from 'perfect-freehand'

// Ink maths. A point is [x, y, pressure] in px: world px for strokes on the paper, px from the block's
// top-left for strokes anchored to a block. Nothing here touches the DOM, so it's all unit-tested.

export type Pt = [number, number, number]
type Rect = { x: number; y: number; w: number; h: number }

const Q = 4 // a quarter pixel
const QP = 64 // pressure steps

/**
 * Points as small whole numbers: each value quantised (0.25 px, 1/64 pressure), the first point as it
 * is and every later one as the difference from the one before. A typical stroke is a few hundred bytes.
 */
export function encodePoints(pts: Pt[]): number[] {
  const out: number[] = []
  let px = 0, py = 0, pp = 0
  for (const [x, y, p] of pts) {
    const qx = Math.round(x * Q), qy = Math.round(y * Q), qp = Math.round(Math.min(1, Math.max(0, p)) * QP)
    out.push(qx - px, qy - py, qp - pp)
    px = qx; py = qy; pp = qp
  }
  return out
}

export function decodePoints(enc: number[]): Pt[] {
  const out: Pt[] = []
  let x = 0, y = 0, p = 0
  for (let i = 0; i + 2 < enc.length; i += 3) {
    x += enc[i]; y += enc[i + 1]; p += enc[i + 2]
    out.push([x / Q, y / Q, p / QP])
  }
  return out
}

/** The same stroke moved by (dx, dy) px: only the first point is stored as a position. */
export function shiftPoints(enc: number[], dx: number, dy: number): number[] {
  if (enc.length < 3) return enc
  const out = enc.slice()
  out[0] += Math.round(dx * Q)
  out[1] += Math.round(dy * Q)
  return out
}

export function strokeBounds(pts: Pt[]): Rect {
  if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

const inRect = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

/** The block a stroke belongs to: the one holding at least 60% of its points (most wins), or null for the paper. */
export function anchorFor(pts: Pt[], rects: (Rect & { id: string })[]): string | null {
  if (!pts.length) return null
  let best: string | null = null, most = 0
  for (const r of rects) {
    const n = pts.filter(([x, y]) => inRect(r, x, y)).length
    if (n > most) { most = n; best = r.id }
  }
  return most >= pts.length * 0.6 ? best : null
}

/**
 * A sideways highlighter stroke becomes a straight bar: through `textMid` (the middle of the line of text
 * it was drawn over, when there is one), otherwise where it was drawn. Strokes that go up or down the page
 * (circling, underlining a block) are left as drawn.
 */
export function straightenHighlight(pts: Pt[], unit: number, textMid?: number | null): Pt[] | null {
  const b = strokeBounds(pts)
  if (pts.length < 2 || b.h > unit * 0.9 || b.w < Math.max(unit * 0.5, b.h * 2)) return null
  const mid = textMid ?? pts.reduce((s, p) => s + p[1], 0) / pts.length
  return [[b.x, mid, 0.5], [b.x + b.w, mid, 0.5]]
}

/**
 * The middle (client px) of the line of text inside `root` at height `y` that overlaps x0..x1, or null.
 * Reads the text's own line boxes, so it works for any font size (a heading isn't one grid row tall).
 */
export function textLineMid(root: Element, x0: number, x1: number, y: number): number | null {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let top = Infinity, bottom = -Infinity
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.textContent?.trim()) continue
    range.selectNodeContents(n)
    for (const r of range.getClientRects()) {
      if (y >= r.top && y <= r.bottom && r.right > x0 && r.left < x1) { top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom) }
    }
  }
  return top < bottom ? (top + bottom) / 2 : null
}

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1])
const pathLength = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0)

/** Evenly spaced points along a stroke, at most `step` px apart, pressure carried along. */
export function resample(pts: Pt[], step: number): Pt[] {
  if (pts.length < 2) return pts.slice()
  const out: Pt[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const n = Math.max(1, Math.ceil(dist(a, b) / step))
    for (let k = 1; k <= n; k++) {
      const t = k / n
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
    }
  }
  return out
}

export type Shape = { kind: 'line' | 'rect' | 'ellipse' | 'triangle'; pts: Pt[] }

/**
 * Hold at the end of a stroke and it becomes the shape it looks like, with its corners on the grid.
 * Nearly straight: a line. Closed and filling its box: a rectangle; round: an ellipse; about half its
 * box: a triangle. Anything else stays as drawn (null).
 */
export function recogniseShape(pts: Pt[], unit: number, snap = true): Shape | null {
  if (pts.length < 3) return null
  const s = (v: number) => (snap ? Math.round(v / unit) * unit : v)
  const P = (x: number, y: number): Pt => [s(x), s(y), 0.5]
  const first = pts[0], last = pts[pts.length - 1]
  const length = pathLength(pts), chord = dist(first, last)
  if (length < unit * 0.6) return null
  // Straight enough: nothing strays far from the line between the ends (a shaky hand is fine).
  const stray = Math.max(...pts.map((p) => distToStroke([first, last], p)))
  if (chord > unit * 0.6 && stray < Math.max(4, chord * 0.08)) return { kind: 'line', pts: [P(first[0], first[1]), P(last[0], last[1])] }

  const b = strokeBounds(pts)
  if (chord > Math.max(b.w, b.h) * 0.25 || Math.min(b.w, b.h) < unit * 0.5) return null
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], c = pts[(i + 1) % pts.length]
    area += a[0] * c[1] - c[0] * a[1]
  }
  const fill = Math.abs(area / 2) / (b.w * b.h)
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2
  const roundness = pts.reduce((sum, [x, y]) => sum + Math.abs(Math.hypot((x - cx) / (b.w / 2), (y - cy) / (b.h / 2)) - 1), 0) / pts.length

  if (fill > 0.86) {
    let x0 = s(b.x), y0 = s(b.y), x1 = s(b.x + b.w), y1 = s(b.y + b.h)
    if (x1 <= x0) x1 = x0 + unit
    if (y1 <= y0) y1 = y0 + unit
    return { kind: 'rect', pts: [[x0, y0, 0.5], [x1, y0, 0.5], [x1, y1, 0.5], [x0, y1, 0.5], [x0, y0, 0.5]] }
  }
  if (fill > 0.66 && roundness < 0.12) {
    const x0 = s(b.x), y0 = s(b.y), rx = Math.max(unit / 2, (s(b.x + b.w) - x0) / 2), ry = Math.max(unit / 2, (s(b.y + b.h) - y0) / 2)
    const out: Pt[] = Array.from({ length: 65 }, (_, i) => {
      const t = (i / 64) * Math.PI * 2
      return [x0 + rx + rx * Math.cos(t), y0 + ry + ry * Math.sin(t), 0.5]
    })
    return { kind: 'ellipse', pts: out }
  }
  if (fill > 0.34 && fill < 0.66) {
    // Corners: the two points furthest apart, then the point furthest from the line between them.
    const r = resample(pts, Math.max(4, length / 120))
    let a = r[0], c = r[1], far = -1
    for (let i = 0; i < r.length; i += 2) for (let j = i + 1; j < r.length; j += 2) {
      const d = dist(r[i], r[j])
      if (d > far) { far = d; a = r[i]; c = r[j] }
    }
    const off = (p: Pt) => Math.abs((c[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (c[1] - a[1])) / (far || 1)
    const apex = r.reduce((m, p) => (off(p) > off(m) ? p : m), r[0])
    return { kind: 'triangle', pts: [P(a[0], a[1]), P(apex[0], apex[1]), P(c[0], c[1]), P(a[0], a[1])] }
  }
  return null
}

/** Distance from a point to the nearest part of a stroke's centre line. */
export function distToStroke(pts: Pt[], p: number[]): number {
  if (!pts.length) return Infinity
  if (pts.length === 1) return dist(pts[0], p)
  let best = Infinity
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0
    best = Math.min(best, Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]))
  }
  return best
}

/**
 * Rubs out the part of a stroke within `r` of `c`. Returns what's left as separate pieces (none when it's
 * all gone), or null when the eraser didn't touch it.
 */
export function rubOut(pts: Pt[], c: number[], r: number): Pt[][] | null {
  if (distToStroke(pts, c) > r) return null
  const pieces: Pt[][] = []
  let cur: Pt[] = []
  for (const p of resample(pts, Math.max(0.5, r / 2))) {
    if (dist(p, c) <= r) { if (cur.length > 1) pieces.push(cur); cur = [] }
    else cur.push(p)
  }
  if (cur.length > 1) pieces.push(cur)
  return pieces
}

/** Point in polygon (even-odd rule). */
export function insidePolygon(p: number[], poly: number[][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Strokes with at least 60% of their points inside the lasso. */
export function lassoPicks(items: { id: string; pts: Pt[] }[], poly: number[][]): string[] {
  return items.filter((it) => it.pts.length && it.pts.filter((p) => insidePolygon(p, poly)).length >= it.pts.length * 0.6).map((it) => it.id)
}

const r2 = (v: number) => Math.round(v * 100) / 100

export type DrawOpts = { size: number; pressure?: boolean; smoothing?: number; simulate?: boolean; shape?: boolean; highlighter?: boolean }

/**
 * SVG path data for a stroke. A pen or highlighter stroke is an outline (filled), from perfect-freehand;
 * a shape is a clean line through its corners (stroked).
 */
export function strokePath(pts: Pt[], o: DrawOpts): string {
  if (o.shape) return pts.map((p, i) => `${i ? 'L' : 'M'}${r2(p[0])} ${r2(p[1])}`).join('')
  const smoothing = o.smoothing ?? 0.5
  const outline = getStroke(pts, {
    size: o.size,
    thinning: o.highlighter || o.pressure === false ? 0 : 0.55,
    smoothing,
    streamline: 0.25 + smoothing * 0.5,
    simulatePressure: !!o.simulate && o.pressure !== false,
    last: true,
  })
  if (outline.length < 4) return outline.length ? `M${outline.map((p) => `${r2(p[0])} ${r2(p[1])}`).join('L')}Z` : ''
  const avg = (a: number, b: number) => r2((a + b) / 2)
  let d = `M${r2(outline[0][0])} ${r2(outline[0][1])}Q${r2(outline[1][0])} ${r2(outline[1][1])} ${avg(outline[1][0], outline[2][0])} ${avg(outline[1][1], outline[2][1])}T`
  for (let i = 2; i < outline.length - 1; i++) d += `${avg(outline[i][0], outline[i + 1][0])} ${avg(outline[i][1], outline[i + 1][1])} `
  return `${d}Z`
}
