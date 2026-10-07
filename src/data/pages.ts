import type { DeckRow, NoteRow } from './db'
import { compareUnits } from './notes'
import type { SheetRow } from '../sheets/types'
import { parentsOf, rootOf } from '../sheets/tree'

// A "page" is a deck, a notes page, or a page the user writes (a sheet). The library, sidebar and search show them together.

export type Page =
  | { kind: 'deck'; id: string; title: string; unit?: string; folderId: string | null; deck: DeckRow }
  | { kind: 'note'; id: string; title: string; unit?: string; folderId: string | null; note: NoteRow }
  | { kind: 'sheet'; id: string; title: string; unit?: string; folderId: string | null; sheet: SheetRow; parentId?: string }
export type PageKind = Page['kind']

/** What a page carries when it's dragged (sidebar rows, box cards). */
export const PAGE_DRAG = 'application/x-mneme-page'

export function pagesOf(decks: DeckRow[], notes: NoteRow[], sheets: SheetRow[] = []): Page[] {
  // Sub-pages live in their top page's folder. A page whose parent isn't here (missing, deleted, a loop) is top level, with no folder.
  const parents = parentsOf(sheets)
  const byId = new Map(sheets.map((s) => [s.id, s]))
  const sheetPage = (s: SheetRow): Page => {
    const parentId = parents.get(s.id)
    if (!parentId) return { kind: 'sheet', id: s.id, title: s.title, unit: s.unit, folderId: s.parentId ? null : s.folderId, sheet: s }
    return { kind: 'sheet', id: s.id, title: s.title, unit: undefined, folderId: byId.get(rootOf(s.id, parents))!.folderId, sheet: s, parentId }
  }
  return [
    ...decks.map((d): Page => ({ kind: 'deck', id: d.id, title: d.title, unit: d.unit, folderId: d.folderId, deck: d })),
    ...notes.map((n): Page => ({ kind: 'note', id: n.id, title: n.title, unit: n.unit, folderId: n.folderId, note: n })),
    ...sheets.map(sheetPage),
  ]
}

/** Pages that aren't under another page: what folders and the library list. */
export const topLevel = (pages: Page[]) => pages.filter((p) => !(p.kind === 'sheet' && p.parentId))

/** Titles of the pages above this one, top first. */
export function pagePath(p: Page, pages: Page[]): string[] {
  const byId = new Map(pages.filter((x) => x.kind === 'sheet').map((x) => [x.id, x]))
  const out: string[] = []
  for (let x = p.kind === 'sheet' ? p.parentId : undefined; x; ) {
    const up = byId.get(x)
    if (!up || up.kind !== 'sheet') break
    out.unshift(up.title)
    x = up.parentId
  }
  return out
}

export const pageUrl = (p: Pick<Page, 'kind' | 'id'>) => (p.kind === 'deck' ? `/deck/${p.id}` : p.kind === 'note' ? `/notes/${p.id}` : `/write/${p.id}`)
export const pageIcon = (k: PageKind) => (k === 'deck' ? 'cards' : k === 'note' ? 'notes' : 'page')

/** When the page was last used: studied for decks, opened for notes and pages. */
export const pageTime = (p: Page) => (p.kind === 'deck' ? p.deck.lastStudiedAt ?? p.deck.updatedAt : p.kind === 'note' ? p.note.lastOpenedAt ?? p.note.updatedAt : p.sheet.lastOpenedAt ?? p.sheet.updatedAt)

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

const rankOf = (p: Page) => (p.kind === 'deck' ? p.deck.rank : p.kind === 'note' ? p.note.rank : p.sheet.rank)
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
