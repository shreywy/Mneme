import { describe, expect, it } from 'vitest'
import type { DeckRow, NoteRow } from './db'
import { groupByUnit, pagesOf, pageUrl } from './pages'

const deck = (id: string, title: string, unit?: string): DeckRow => ({ id, title, unit, folderId: 'f', sources: [], topics: [], termCount: 1, questionCount: 0, createdAt: 1, updatedAt: 1 })
const note = (id: string, title: string, unit?: string): NoteRow => ({ id, title, unit, folderId: 'f', topics: [], blocks: [], position: 0, createdAt: 1, updatedAt: 1 })

describe('pages', () => {
  it('turns decks and notes into pages with their own links', () => {
    const ps = pagesOf([deck('d', 'D')], [note('n', 'N')])
    expect(ps.map((p) => `${p.kind}:${pageUrl(p)}`)).toEqual(['deck:/deck/d', 'note:/notes/n'])
  })

  it('groups by unit in natural order; notes before decks inside a unit; no unit last', () => {
    const ps = pagesOf(
      [deck('d10', 'Ch 10 deck', 'Chapter 10'), deck('mid', 'Midterm review'), deck('d2', 'Ch 2 deck', 'Chapter 2')],
      [note('n2', 'Ch 2 notes', 'Chapter 2'), note('n10', 'Ch 10 notes', 'chapter 10')],
    )
    const groups = groupByUnit(ps)
    expect(groups.map((g) => [g.unit ?? null, g.pages.map((p) => p.id)])).toEqual([
      ['Chapter 2', ['n2', 'd2']],
      ['Chapter 10', ['n10', 'd10']],
      [null, ['mid']],
    ])
  })

  it('a folder with no units is one unlabelled group', () => {
    const groups = groupByUnit(pagesOf([deck('a', 'A'), deck('b', 'B')], []))
    expect(groups).toHaveLength(1)
    expect(groups[0].unit).toBeUndefined()
  })
})
