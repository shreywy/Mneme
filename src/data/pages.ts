import type { DeckRow, NoteRow } from './db'
import { compareUnits } from './notes'

// A "page" is either a deck or a notes page. The library, sidebar and search show them together.

export type Page =
  | { kind: 'deck'; id: string; title: string; unit?: string; folderId: string | null; deck: DeckRow }
  | { kind: 'note'; id: string; title: string; unit?: string; folderId: string | null; note: NoteRow }

export function pagesOf(decks: DeckRow[], notes: NoteRow[]): Page[] {
  return [
    ...decks.map((d): Page => ({ kind: 'deck', id: d.id, title: d.title, unit: d.unit, folderId: d.folderId, deck: d })),
    ...notes.map((n): Page => ({ kind: 'note', id: n.id, title: n.title, unit: n.unit, folderId: n.folderId, note: n })),
  ]
}

export const pageUrl = (p: Pick<Page, 'kind' | 'id'>) => (p.kind === 'deck' ? `/deck/${p.id}` : `/notes/${p.id}`)

/** When the page was last used: studied for decks, opened for notes. */
export const pageTime = (p: Page) => (p.kind === 'deck' ? p.deck.lastStudiedAt ?? p.deck.updatedAt : p.note.lastOpenedAt ?? p.note.updatedAt)

/**
 * Group pages by unit label ("Chapter 2" before "Chapter 10", case-insensitive), pages without a unit last.
 * Inside a unit: the order the user dragged them into, else alphabetical (a notes page before a deck of the same title).
 * `sort` replaces that order.
 */
export function groupByUnit(pages: Page[], sort?: (a: Page, b: Page) => number): { unit?: string; pages: Page[] }[] {
  const groups = new Map<string, { unit?: string; pages: Page[] }>()
  for (const p of pages) {
    const key = p.unit?.trim().toLowerCase() ?? ''
    const g = groups.get(key) ?? { ...(p.unit?.trim() ? { unit: p.unit.trim() } : {}), pages: [] }
    g.pages.push(p)
    groups.set(key, g)
  }
  const within = sort ?? byHandThenTitle
  return [...groups.values()].sort((a, b) => compareUnits(a.unit, b.unit)).map((g) => ({ ...g, pages: g.pages.sort(within) }))
}

const rankOf = (p: Page) => (p.kind === 'deck' ? p.deck.rank : p.note.rank)
/** Hand-ordered pages first, in their order; the rest alphabetically, notes before a deck of the same title. */
export function byHandThenTitle(a: Page, b: Page): number {
  const ra = rankOf(a), rb = rankOf(b)
  if (ra !== undefined || rb !== undefined) {
    if (ra === undefined) return 1
    if (rb === undefined) return -1
    if (ra !== rb) return ra - rb
  }
  const t = a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
  return t || (a.kind === b.kind ? 0 : a.kind === 'note' ? -1 : 1)
}
