import { describe, expect, it } from 'vitest'
import { anchorFor, decodePoints, distToStroke, encodePoints, insidePolygon, lassoPicks, recogniseShape, rubOut, shiftPoints, straightenHighlight, strokeBounds, strokePath, type Pt } from './ink'

const line = (x0: number, y0: number, x1: number, y1: number, n = 20, wobble = 0): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n + (i % 2 ? wobble : -wobble), 0.5])
const trace = (corners: [number, number][], per = 12): Pt[] => {
  const out: Pt[] = []
  for (let i = 0; i < corners.length; i++) {
    const [a, b] = [corners[i], corners[(i + 1) % corners.length]]
    for (let k = 0; k < per; k++) out.push([a[0] + ((b[0] - a[0]) * k) / per, a[1] + ((b[1] - a[1]) * k) / per, 0.5])
  }
  out.push([corners[0][0] + 2, corners[0][1] + 1, 0.5])
  return out
}

describe('stroke encoding', () => {
  it('round-trips points to a quarter pixel', () => {
    const pts: Pt[] = [[10.13, 20.4, 0.5], [11.9, 19.77, 0.62], [-3.3, 400.01, 1]]
    const back = decodePoints(encodePoints(pts))
    back.forEach((p, i) => {
      expect(Math.abs(p[0] - pts[i][0])).toBeLessThanOrEqual(0.125)
      expect(Math.abs(p[1] - pts[i][1])).toBeLessThanOrEqual(0.125)
      expect(Math.abs(p[2] - pts[i][2])).toBeLessThanOrEqual(1 / 128)
    })
  })
  it('stores small whole numbers, so a page of ink stays small', () => {
    const enc = encodePoints(line(100, 100, 140, 104, 40))
    expect(enc.every(Number.isInteger)).toBe(true)
    expect(Math.max(...enc.slice(3).map(Math.abs))).toBeLessThan(10)
  })
  it('moves a whole stroke by shifting its first point', () => {
    const pts = line(0, 0, 10, 10, 4)
    const moved = decodePoints(shiftPoints(encodePoints(pts), 5, -2))
    moved.forEach((p, i) => { expect(p[0]).toBeCloseTo(pts[i][0] + 5, 1); expect(p[1]).toBeCloseTo(pts[i][1] - 2, 1) })
  })
  it('measures bounds', () => {
    expect(strokeBounds([[1, 5, 0], [9, 2, 0], [4, 7, 0]])).toEqual({ x: 1, y: 2, w: 8, h: 5 })
  })
})

describe('anchoring', () => {
  const rects = [{ id: 'a', x: 0, y: 0, w: 100, h: 50 }, { id: 'b', x: 150, y: 0, w: 200, h: 50 }]
  it('anchors a stroke drawn mostly over a block to it', () => {
    expect(anchorFor(line(10, 10, 120, 20), rects)).toBe('a')
  })
  it('leaves a stroke mostly on the paper on the paper', () => {
    expect(anchorFor(line(90, 60, 190, 140), rects)).toBeNull()
  })
  it('picks the block holding most of the stroke', () => {
    expect(anchorFor(line(70, 10, 300, 10), rects)).toBe('b')
  })
})

describe('highlighter', () => {
  it('straightens a wobbly sideways stroke onto the line of text it was drawn over', () => {
    const out = straightenHighlight(line(30, 40, 200, 43, 30, 3), 28, 47)!
    expect(out).toHaveLength(2)
    expect(out[0][1]).toBe(47)
    expect(out[1][1]).toBe(47)
    expect(out[0][0]).toBeCloseTo(30, 0)
    expect(out[1][0]).toBeCloseTo(200, 0)
  })
  it('keeps the bar where it was drawn when there is no text under it, not on a grid row', () => {
    // Drawn across a grid line (28): the bar stays at about 29, not in the middle of a row (42 or 14).
    const out = straightenHighlight(line(30, 27, 200, 31, 30, 1), 28)!
    expect(out[0][1]).toBeCloseTo(29, 0)
  })
  it('leaves strokes that are not along a line alone', () => {
    expect(straightenHighlight(line(30, 40, 60, 160), 28)).toBeNull()
  })
})

describe('hold to shape', () => {
  it('turns a nearly straight stroke into a line snapped to the grid', () => {
    const s = recogniseShape(line(29, 27, 141, 85, 30, 1.5), 28)!
    expect(s.kind).toBe('line')
    expect(s.pts.map((p) => [p[0], p[1]])).toEqual([[28, 28], [140, 84]])
  })
  it('turns a closed boxy stroke into a rectangle', () => {
    const s = recogniseShape(trace([[30, 30], [170, 28], [168, 110], [29, 112]]), 28)!
    expect(s.kind).toBe('rect')
    expect(s.pts.map((p) => [p[0], p[1]])).toEqual([[28, 28], [168, 28], [168, 112], [28, 112], [28, 28]])
  })
  it('turns a round stroke into an ellipse', () => {
    const circle: Pt[] = Array.from({ length: 60 }, (_, i) => [100 + 56 * Math.cos((i / 58) * Math.PI * 2), 100 + 56 * Math.sin((i / 58) * Math.PI * 2), 0.5])
    expect(recogniseShape(circle, 28)!.kind).toBe('ellipse')
  })
  it('turns a three-cornered stroke into a triangle', () => {
    const s = recogniseShape(trace([[28, 140], [112, 30], [196, 141]]), 28)!
    expect(s.kind).toBe('triangle')
    expect(s.pts).toHaveLength(4)
  })
  it('leaves a scribble as it is', () => {
    const scribble: Pt[] = Array.from({ length: 40 }, (_, i) => [50 + (i % 7) * 13, 50 + ((i * 5) % 11) * 9, 0.5])
    expect(recogniseShape(scribble, 28)).toBeNull()
  })
})

describe('eraser', () => {
  const stroke = line(0, 0, 100, 0, 10)
  it('measures how far a point is from a stroke', () => {
    expect(distToStroke(stroke, [50, 6])).toBeCloseTo(6)
  })
  it('rubs a gap out of the middle, leaving two pieces', () => {
    const pieces = rubOut(stroke, [50, 0], 10)!
    expect(pieces).toHaveLength(2)
    expect(Math.max(...pieces[0].map((p) => p[0]))).toBeLessThanOrEqual(41)
    expect(Math.min(...pieces[1].map((p) => p[0]))).toBeGreaterThanOrEqual(59)
  })
  it('rubs through a long straight segment too', () => {
    expect(rubOut([[0, 0, 0.5], [100, 0, 0.5]], [50, 0], 8)).toHaveLength(2)
  })
  it('says when the eraser missed', () => {
    expect(rubOut(stroke, [50, 40], 10)).toBeNull()
  })
  it('removes a stroke rubbed out completely', () => {
    expect(rubOut(line(0, 0, 6, 0, 3), [3, 0], 10)).toEqual([])
  })
})

describe('lasso', () => {
  const square: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]]
  it('knows what is inside', () => {
    expect(insidePolygon([50, 50], square)).toBe(true)
    expect(insidePolygon([150, 50], square)).toBe(false)
  })
  it('picks strokes that are mostly inside', () => {
    const picks = lassoPicks([{ id: 'in', pts: line(10, 10, 90, 90) }, { id: 'out', pts: line(120, 10, 190, 90) }, { id: 'half', pts: line(60, 50, 160, 50) }], square)
    expect(picks).toEqual(['in'])
  })
})

describe('drawing', () => {
  it('outlines a pen stroke as an SVG path', () => {
    expect(strokePath(line(0, 0, 50, 20), { size: 3 })).toMatch(/^M/)
  })
  it('draws a shape as a clean line through its corners', () => {
    expect(strokePath([[0, 0, 0.5], [28, 0, 0.5]], { size: 3, shape: true })).toBe('M0 0L28 0')
  })
})
