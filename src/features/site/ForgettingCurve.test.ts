import { describe, expect, it } from 'vitest'
import { interval, recall } from './ForgettingCurve'

describe('forgetting curve', () => {
  it('is at 90% after exactly one stability', () => {
    expect(recall(7, 7)).toBeCloseTo(0.9, 6)
    expect(recall(0, 7)).toBe(1)
  })
  it('schedules the review for when recall reaches the target', () => {
    expect(interval(10, 0.9)).toBeCloseTo(10, 6)
    expect(recall(interval(10, 0.8), 10)).toBeCloseTo(0.8, 6)
    expect(interval(10, 0.95)).toBeLessThan(interval(10, 0.85))
  })
})
