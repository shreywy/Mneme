import { describe, expect, it } from 'vitest'
import { autoRange, plotBlock } from './plot'
import { niceTicks } from '../features/notes/figures'

describe('plot helpers', () => {
  it('fits the y range to the formulas, with a little room, on round numbers', () => {
    const r = autoRange(['x^2'], 0, 10)
    expect(r.min).toBeLessThanOrEqual(0)
    expect(r.max).toBeGreaterThanOrEqual(100)
    expect(r.max).toBeLessThanOrEqual(120)
  })

  it('ignores formulas that do not parse and values that blow up', () => {
    const r = autoRange(['1/x', 'nonsense((('], -5, 5)
    expect(Number.isFinite(r.min) && Number.isFinite(r.max)).toBe(true)
    expect(r.max - r.min).toBeLessThan(1000)
  })

  it('falls back to -5..5 with nothing to draw', () => {
    expect(autoRange([], 0, 10)).toEqual({ min: -5, max: 5 })
  })

  it('turns what you typed into the notes plot shape', () => {
    const b = plotBlock({ fns: ['100 / x', ''], xMin: 1, xMax: 20, xLabel: 'r', yLabel: 'a' })
    expect(b.type).toBe('plot')
    expect(b.lines).toEqual([{ fn: '100 / x' }])
    expect(b.x).toEqual({ min: 1, max: 20, label: 'r' })
    expect(b.y.label).toBe('a')
  })

  it('a y range set the wrong way round (or empty) is ignored in favour of the automatic one', () => {
    const b = plotBlock({ fns: ['x'], xMin: 0, xMax: 10, yMin: 5, yMax: 5 })
    expect(b.y.max).toBeGreaterThan(b.y.min)
    const c = plotBlock({ fns: ['x'], xMin: 0, xMax: 10, yMin: 8, yMax: 2 })
    expect(c.y.max).toBeGreaterThan(c.y.min)
  })

  it('tick marks stop even for ranges too fine to divide (huge numbers)', () => {
    const t = niceTicks(1e16, 1e16 + 4)
    expect(t.length).toBeLessThan(1000)
    expect(niceTicks(3, 3).length).toBeLessThan(1000)
  })
})
