import { describe, expect, it } from 'vitest'
import { autoRange, plotBlock } from './plot'

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
})
