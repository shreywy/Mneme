import { describe, expect, it } from 'vitest'
import { INSERTS, byLetter, searchInserts } from './insert'

describe('insert list', () => {
  it('every tile letter is unique and one key long', () => {
    const letters = INSERTS.filter((i) => i.letter).map((i) => i.letter!)
    expect(new Set(letters).size).toBe(letters.length)
    expect(letters.every((l) => /^[A-Z]$/.test(l))).toBe(true)
  })

  it('a letter finds its block', () => {
    expect(byLetter('e')?.id).toBe('equation')
    expect(byLetter('P')?.id).toBe('plot')
    expect(byLetter('Z')).toBeUndefined()
  })

  it('typing filters, best match first: /plo jumps to Plot, /h2 to Heading 2, words in the middle count too', () => {
    expect(searchInserts('plo')[0].id).toBe('plot')
    expect(searchInserts('h2')[0].id).toBe('heading2')
    expect(searchInserts('eq')[0].id).toBe('equation')
    expect(searchInserts('list').map((i) => i.id)).toEqual(expect.arrayContaining(['bullet', 'numbered', 'checklist']))
    expect(searchInserts('zzz')).toEqual([])
    expect(searchInserts('')).toHaveLength(INSERTS.length)
  })
  it('has a box of pages on B', () => {
    expect(byLetter('B')?.id).toBe('box')
    expect(searchInserts('sub-page')[0].id).toBe('box')
  })
})
