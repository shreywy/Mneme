import { describe, expect, it } from 'vitest'
import { ancestors, parentsOf, rootOf, subtree, wouldCycle } from './tree'

const rows = [
  { id: 'cps' },
  { id: 'ch1', parentId: 'cps' },
  { id: 'ch3', parentId: 'cps' },
  { id: 'ps3', parentId: 'ch3' },
  { id: 'lost', parentId: 'gone' },
]

describe('page tree', () => {
  it('maps each page to a parent that exists', () => {
    const p = parentsOf(rows)
    expect(p.get('ch1')).toBe('cps')
    expect(p.get('ps3')).toBe('ch3')
    expect(p.has('cps')).toBe(false)
    expect(p.has('lost')).toBe(false) // parent missing: top level
  })

  it('pages in a loop are all top level, and a page hanging off the loop keeps its parent', () => {
    const p = parentsOf([{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }, { id: 'c', parentId: 'a' }])
    expect(p.has('a')).toBe(false)
    expect(p.has('b')).toBe(false)
    expect(p.get('c')).toBe('a')
  })

  it('finds the top page and the ancestors, nearest first', () => {
    const p = parentsOf(rows)
    expect(rootOf('ps3', p)).toBe('cps')
    expect(rootOf('cps', p)).toBe('cps')
    expect(ancestors('ps3', p)).toEqual(['ch3', 'cps'])
  })

  it('lists every page below one', () => {
    expect(subtree('cps', rows).sort()).toEqual(['ch1', 'ch3', 'ps3'])
    expect(subtree('ch1', rows)).toEqual([])
  })

  it('subtree stops on a loop', () => {
    expect(subtree('a', [{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }])).toEqual(['b'])
  })

  it('refuses a move under itself or one of its own sub-pages', () => {
    expect(wouldCycle('cps', 'cps', rows)).toBe(true)
    expect(wouldCycle('cps', 'ps3', rows)).toBe(true)
    expect(wouldCycle('ps3', 'ch1', rows)).toBe(false)
  })
})
