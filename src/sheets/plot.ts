import { compileExpr } from '../content/expr'
import { niceTicks } from '../features/notes/figures'
import type { Block } from '../notes-format/types'

/** What a plot node stores: the formulas and ranges you typed. y is worked out unless you set it. */
export type PlotSpec = { fns: string[]; xMin: number; xMax: number; yMin?: number; yMax?: number; xLabel?: string; yLabel?: string }

/** A y range that shows the formulas between xMin and xMax, rounded out to tick values. */
export function autoRange(fns: string[], xMin: number, xMax: number): { min: number; max: number } {
  const ys: number[] = []
  for (const src of fns) {
    let f: ((x: number) => number) | null = null
    try { f = src.trim() ? compileExpr(src) : null } catch { f = null }
    if (!f) continue
    for (let k = 0; k <= 200; k++) {
      const y = f(xMin + ((xMax - xMin) * k) / 200)
      if (Number.isFinite(y)) ys.push(y)
    }
  }
  if (!ys.length) return { min: -5, max: 5 }
  // Drop the extreme 2% each side so an asymptote doesn't flatten everything else.
  ys.sort((a, b) => a - b)
  const lo = ys[Math.floor(ys.length * 0.02)], hi = ys[Math.ceil(ys.length * 0.98) - 1]
  const span = hi - lo || Math.abs(hi) || 1
  const ticks = niceTicks(lo - span * 0.05, hi + span * 0.05, 5)
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : span
  return { min: Math.min(ticks[0], Math.floor(lo / step) * step), max: Math.max(ticks[ticks.length - 1], Math.ceil(hi / step) * step) }
}

/** The notes renderer's plot block for a spec. */
export function plotBlock(s: PlotSpec): Extract<Block, { type: 'plot' }> {
  const fns = s.fns.map((f) => f.trim()).filter(Boolean)
  const auto = autoRange(fns, s.xMin, s.xMax)
  return {
    type: 'plot',
    x: { min: s.xMin, max: s.xMax, ...(s.xLabel ? { label: s.xLabel } : {}) },
    y: { min: s.yMin ?? auto.min, max: s.yMax ?? auto.max, ...(s.yLabel ? { label: s.yLabel } : {}) },
    lines: fns.map((fn) => ({ fn })),
  }
}
