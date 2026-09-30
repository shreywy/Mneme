import { describe, expect, it } from 'vitest'
import { gradeNumeric, gradeTyped, normalizeAnswer, parseCloze, parseNumber, gradeCloze } from './grading'

describe('normalizeAnswer', () => {
  it('ignores case, accents, articles and punctuation', () => {
    expect(normalizeAnswer('  The Matching Principle. ')).toBe('matching principle')
    expect(normalizeAnswer('Café')).toBe('cafe')
    expect(normalizeAnswer('A/R')).toBe('a r')
  })
})

describe('gradeTyped', () => {
  it('accepts exact matches against any accepted answer', () => {
    expect(gradeTyped('matching', ['Matching principle', 'matching']).correct).toBe(true)
  })
  it('accepts a small typo and reports what it matched', () => {
    const r = gradeTyped('depreciaton', ['Depreciation'])
    expect(r.correct).toBe(true)
    expect(r.close).toBe('Depreciation')
  })
  it('rejects a different term that shares words', () => {
    expect(gradeTyped('Accounts payable', ['Accounts receivable']).correct).toBe(false)
  })
  it('requires exact matches for very short answers', () => {
    expect(gradeTyped('AP', ['AR']).correct).toBe(false)
  })
  it('rejects empty input', () => {
    expect(gradeTyped('   ', ['Asset']).correct).toBe(false)
  })
})

describe('numbers', () => {
  it('parses money, thousands separators, k suffix and negatives', () => {
    expect(parseNumber('$2,000')).toBe(2000)
    expect(parseNumber('2000.00')).toBe(2000)
    expect(parseNumber('2k')).toBe(2000)
    expect(parseNumber('(450)')).toBe(-450)
    expect(parseNumber('−12')).toBe(-12)
    expect(parseNumber('abc')).toBeNull()
  })
  it('grades within tolerance', () => {
    expect(gradeNumeric('$2,000', 2000, 0)).toBe(true)
    expect(gradeNumeric('2001', 2000, 0)).toBe(false)
    expect(gradeNumeric('2001', 2000, 1)).toBe(true)
  })
})

describe('cloze', () => {
  it('splits a prompt into text and blanks with alternatives', () => {
    const c = parseCloze('Assets = {{Liabilities}} + {{Equity|Owner\'s equity}}')
    expect(c.blanks).toEqual([['Liabilities'], ['Equity', "Owner's equity"]])
    expect(c.parts.filter((p) => typeof p === 'string')).toEqual(['Assets = ', ' + '])
  })
  it('grades each blank separately', () => {
    const c = parseCloze('A = {{L}} + {{E|Equity}}')
    expect(gradeCloze(['l', 'equity'], c)).toEqual([true, true])
    expect(gradeCloze(['x', 'e'], c)).toEqual([false, true])
  })
})
