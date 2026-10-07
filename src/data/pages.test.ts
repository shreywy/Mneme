import { describe, expect, it } from 'vitest'
import type { DeckRow, NoteRow } from './db'
import { groupByUnit, pagePath, pagesOf, pageUrl, topLevel } from './pages'
import { DEFAULT_PAPER, type SheetRow } from '../sheets/types'

const deck = (id: string, title: string, unit?: string): DeckRow => ({ id, title, unit, folderId: 'f', sources: [], topics: [], termCount: 1, questionCount: 0, createdAt: 1, updatedAt: 1 })
const sheet = (id: string, title: string, unit?: string): SheetRow => ({ id, title, unit, folderId: 'f', titleAuto: false, paper: DEFAULT_PAPER, createdAt: 1, updatedAt: 1 })
const note = (id: string, title: string, unit?: string): NoteRow => ({ id, title, unit, folderId: 'f', topics: [], blocks: [], position: 0, createdAt: 1, updatedAt: 1 })

describe('pages', () => {
  it('turns decks and notes into pages with their own links', () => {
    const ps = pagesOf([deck('d', 'D')], [note('n', 'N')])
    expect(ps.map((p) => `${p.kind}:${pageUrl(p)}`)).toEqual(['deck:/deck/d', 'note:/notes/n'])
  })

  it('pages of your own get /write links and sort with the rest', () => {
    const ps = pagesOf([deck('d', 'B')], [note('n', 'C')], [sheet('s', 'A', 'Week 1')])
    expect(ps.map((p) => `${p.kind}:${pageUrl(p)}`)).toContain('sheet:/write/s')
    expect(groupByUnit(ps)[0]).toMatchObject({ unit: 'Week 1' })
  })

  it('groups by unit in natural order, alphabetical inside a unit, no unit last', () => {
    const ps = pagesOf(
      [deck('d10', 'Ch 10 deck', 'Chapter 10'), deck('mid', 'Midterm review'), deck('d2', 'Ch 2 deck', 'Chapter 2')],
      [note('n2', 'Ch 2 notes', 'Chapter 2'), note('n10', 'Ch 10 notes', 'chapter 10')],
    )
    const groups = groupByUnit(ps)
    expect(groups.map((g) => [g.unit ?? null, g.pages.map((p) => p.id)])).toEqual([
      ['Chapter 2', ['d2', 'n2']],
      ['Chapter 10', ['d10', 'n10']],
      [null, ['mid']],
    ])
  })

  it('a notes page and a deck with the same title: notes first', () => {
    const groups = groupByUnit(pagesOf([deck('d', 'Week 3')], [note('n', 'Week 3')]))
    expect(groups[0].pages.map((p) => p.id)).toEqual(['n', 'd'])
  })

  it('a hand-made order wins over the alphabet', () => {
    const groups = groupByUnit(pagesOf([{ ...deck('a', 'Apple'), rank: 1 }, { ...deck('b', 'Banana'), rank: 0 }, deck('c', 'Cherry')], []))
    expect(groups[0].pages.map((p) => p.id)).toEqual(['b', 'a', 'c'])
  })

  it('a folder with no units is one unlabelled group', () => {
    const groups = groupByUnit(pagesOf([deck('a', 'A'), deck('b', 'B')], []))
    expect(groups).toHaveLength(1)
    expect(groups[0].unit).toBeUndefined()
  })
})

const sub = (id: string, more: Partial<SheetRow> = {}): SheetRow =>
  ({ id, folderId: null, title: id, titleAuto: false, paper: DEFAULT_PAPER, createdAt: 0, updatedAt: 0, ...more })

describe('sub-pages in page lists', () => {
  const rows = [
    sub('cps', { folderId: 'fall', unit: 'Year 2' }),
    sub('ch3', { parentId: 'cps', box: 'w2', folderId: null, unit: 'stale' }),
    sub('ps3', { parentId: 'ch3', box: 'b' }),
    sub('lost', { parentId: 'gone', folderId: 'fall' }),
  ]
  const pages = pagesOf([], [], rows)
  const get = (id: string) => pages.find((p) => p.id === id)!

  it('a sub-page takes its top page folder and no unit', () => {
    expect(get('ps3')).toMatchObject({ folderId: 'fall', unit: undefined, parentId: 'ch3' })
    expect(get('ch3')).toMatchObject({ folderId: 'fall', unit: undefined, parentId: 'cps' })
  })

  it('a page whose parent is missing is top level with no folder', () => {
    expect(get('lost')).toMatchObject({ folderId: null })
    expect('parentId' in get('lost')).toBe(false)
  })

  it('topLevel leaves sub-pages out', () => {
    expect(topLevel(pages).map((p) => p.id).sort()).toEqual(['cps', 'lost'])
  })

  it('pagePath lists the pages above, top first', () => {
    expect(pagePath(get('ps3'), pages)).toEqual(['cps', 'ch3'])
    expect(pagePath(get('cps'), pages)).toEqual([])
  })
})
