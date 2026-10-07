import { describe, expect, it } from 'vitest'
import { INSERTS, byLetter, searchInserts, searchTitles } from './insert'

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

describe('[[ page search', () => {
  const rows = [{ id: '1', title: 'Week 10 recap' }, { id: '2', title: 'Ch 3 Prolog basics' }, { id: '3', title: 'Practice set 3' }, { id: '4', title: 'Week 2' }]
  it('puts titles that start with it first, then ones with a word starting with it, then the rest', () => {
    expect(searchTitles(rows, 'pr').map((r) => r.id)).toEqual(['3', '2'])
    expect(searchTitles(rows, 'week').map((r) => r.id)).toEqual(['4', '1'])
    expect(searchTitles(rows, 'set 3').map((r) => r.id)).toEqual(['3'])
  })
  it('lists everything, by title, with nothing typed', () => {
    expect(searchTitles(rows, '').map((r) => r.id)).toEqual(['2', '3', '4', '1'])
  })
})
