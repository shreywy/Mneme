import { describe, expect, it } from 'vitest'
import { splitByTerms } from './keyterms'

describe('splitByTerms', () => {
  it('marks whole-word, case-insensitive matches, longest term first', () => {
    const used = new Set<string>()
    const parts = splitByTerms('Contribution margin pays the fixed costs; the margin of safety is separate.', ['margin', 'Contribution margin', 'margin of safety'], used)
    expect(parts.filter((p) => p.term).map((p) => [p.text, p.term])).toEqual([
      ['Contribution margin', 'Contribution margin'],
      ['margin of safety', 'margin of safety'],
    ])
    expect(parts.map((p) => p.text).join('')).toBe('Contribution margin pays the fixed costs; the margin of safety is separate.')
  })
  it('marks each term once per block', () => {
    const used = new Set<string>()
    const a = splitByTerms('Demand rises. Demand falls.', ['demand'], used)
    expect(a.filter((p) => p.term)).toHaveLength(1)
    expect(splitByTerms('Demand again.', ['demand'], used).filter((p) => p.term)).toHaveLength(0)
  })
  it('does not match inside other words', () => {
    expect(splitByTerms('Demanding work', ['demand'], new Set()).some((p) => p.term)).toBe(false)
  })
  it('handles terms with regex characters', () => {
    expect(splitByTerms('Use P/E (ratio) here', ['P/E (ratio)'], new Set()).some((p) => p.term)).toBe(true)
  })
})
