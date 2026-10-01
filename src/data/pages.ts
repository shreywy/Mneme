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
 * Inside a unit, notes come before decks, then by title. `sort` can reorder pages inside each group.
 */
export function groupByUnit(pages: Page[], sort?: (a: Page, b: Page) => number): { unit?: string; pages: Page[] }[] {
  const groups = new Map<string, { unit?: string; pages: Page[] }>()
  for (const p of pages) {
    const key = p.unit?.trim().toLowerCase() ?? ''
    const g = groups.get(key) ?? { ...(p.unit?.trim() ? { unit: p.unit.trim() } : {}), pages: [] }
    g.pages.push(p)
    groups.set(key, g)
  }
  const within = sort ?? ((a: Page, b: Page) => (a.kind === b.kind ? a.title.localeCompare(b.title, undefined, { numeric: true }) : a.kind === 'note' ? -1 : 1))
  return [...groups.values()].sort((a, b) => compareUnits(a.unit, b.unit)).map((g) => ({ ...g, pages: g.pages.sort(within) }))
}
