# Sub-pages, phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pages (sheets) can hold sub-pages at any depth, grouped by "box" blocks on the parent's canvas, shown as a tree in the sidebar, with delete, archive and restore working on whole trees.

**Architecture:** Two optional fields on `SheetRow` (`parentId`, `box`) carry the tree; a new canvas block kind `'box'` shows its sub-pages by live query, so nothing is copied between rows. A sub-page's folder is resolved from its top page in `pagesOf`, so every existing folder view, count and search scope keeps working once lists filter to top-level pages. Pure tree logic lives in `src/sheets/tree.ts`; database operations in `src/data/subpages.ts`.

**Tech Stack:** React 19, TypeScript, Dexie 4 (+ dexie-react-hooks), zustand, Vitest with fake-indexeddb, React Router 8.

**Spec:** [docs/superpowers/specs/2026-10-07-subpages-and-drive-import-design.md](../specs/2026-10-07-subpages-and-drive-import-design.md), sections 1–3. Sections 4–6 are phases 2 and 3.

## Global Constraints

- Only sheets (Pages) nest. Decks and notes pages never get `parentId` and can't be dropped onto a page.
- No server migration: new fields ride inside the synced `doc` JSON. Dexie gets version 7 for an index only.
- A move that would put a page under itself or one of its sub-pages is refused in the data layer (`moveIntoBox` returns `false`) and the UI shows a toast.
- Missing parent → the page is top-level with no folder. Missing box → the page still shows under its parent.
- User-facing text follows the "no AI-sounding copy" rules: plain short sentences, no em-dash chains, no title case, no emoji.
- Install nothing. If a package is ever needed, use `npx npm@10.9.2 install`.
- Commits are Shrey's identity only, with no AI attribution anywhere.
- Shell heredocs on this machine eat backslashes: write test files with the editor, not `cat <<EOF`.

## Review Focus

1. **Two devices make a loop** (A moved under B on one device, B under A on the other). Expect both pages to show at the top level, nothing hidden, and no hang. Covered by a `parentsOf` loop test in Task 1.
2. **Deleting a page that has sub-pages, then Undo.** Expect the whole tree to come back under the same parent, and Recently deleted to list only the top page with a count. Covered by trash tests in Task 4.
3. **Purging after 5 days removes sub-pages too.** `listTrash` now returns only tree tops, so a purge that only looked at tops would leave orphans. Covered by a purge test in Task 4.
4. **Dragging a sidebar page onto its own sub-page.** Expect a refusal toast and no change. Covered by a `moveIntoBox` cycle test in Task 3.
5. **A sub-page whose box was deleted on another device.** Expect it still listed under the parent in the sidebar, and moved into a box when the parent is next opened (after a minute). Covered by `adoptOrphans` tests in Task 3.

---

### Task 1: Data fields and tree helpers

**Files:**
- Modify: `src/sheets/types.ts` (SheetRow, SheetBlock.kind)
- Modify: `src/data/db.ts` (version 7)
- Create: `src/sheets/tree.ts`
- Test: `src/sheets/tree.test.ts`

**Interfaces:**
- Produces:
  - `SheetRow.parentId?: string`, `SheetRow.box?: string`
  - `SheetBlock.kind: 'text' | 'bookmark' | 'box'`
  - `parentsOf(rows: TreeRow[]): Map<string, string>`, where `TreeRow = { id: string; parentId?: string }`
  - `rootOf(id: string, parents: Map<string, string>): string`
  - `ancestors(id: string, parents: Map<string, string>): string[]` (nearest first)
  - `subtree(id: string, rows: TreeRow[]): string[]` (all descendants by raw `parentId`, not including `id`)
  - `wouldCycle(id: string, newParent: string, rows: TreeRow[]): boolean`

- [ ] **Step 1: Add the fields**

In `src/sheets/types.ts`, inside `SheetRow` after `hidden?: boolean`:

```ts
  /** The page this one sits under (sub-pages). Unset: a top-level page in `folderId`. */
  parentId?: string
  /** The box block on the parent page that shows this page. */
  box?: string
```

Change `SheetBlock.kind` to `kind: 'text' | 'bookmark' | 'box'` and extend its doc comment: "a box holds sub-page cards (its pages are the sheets whose `box` is its id; `data.label` is its title)".

In `src/data/db.ts`, after the version 6 block:

```ts
    // v7: sub-pages. An index on parentId so a page's sub-pages are one query.
    this.version(7).stores({
      sheets: 'id, folderId, updatedAt, parentId',
    })
```

- [ ] **Step 2: Write the failing tests**

`src/sheets/tree.test.ts`:

```ts
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
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run src/sheets/tree.test.ts`
Expected: FAIL, cannot find module `./tree`.

- [ ] **Step 4: Implement**

`src/sheets/tree.ts`:

```ts
// Pages under pages. A page's `parentId` names the page it sits under. Rows sync one by one, so the
// tree can arrive broken: a parent not here yet, or a loop when two devices moved pages at once.
// Such pages show at the top level until it's sorted out; nothing is hidden.

export type TreeRow = { id: string; parentId?: string }

/** Each page whose parent is in `rows`, mapped to that parent. Pages in a loop are left out (top level). */
export function parentsOf(rows: TreeRow[]): Map<string, string> {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const out = new Map<string, string>()
  for (const r of rows) {
    if (!r.parentId || !byId.has(r.parentId)) continue
    // Walk up. Coming back to this page means it's in a loop.
    const seen = new Set([r.id])
    let p: string | undefined = r.parentId
    while (p && byId.has(p) && !seen.has(p)) { seen.add(p); p = byId.get(p)!.parentId }
    if (p !== r.id) out.set(r.id, r.parentId)
  }
  return out
}

export function rootOf(id: string, parents: Map<string, string>): string {
  let x = id
  while (parents.has(x)) x = parents.get(x)!
  return x
}

/** The pages above `id`, nearest first. */
export function ancestors(id: string, parents: Map<string, string>): string[] {
  const out: string[] = []
  for (let x = parents.get(id); x; x = parents.get(x)) out.push(x)
  return out
}

/** Every page below `id`, by raw parentId (archived and deleted ones too, when they're in `rows`). */
export function subtree(id: string, rows: TreeRow[]): string[] {
  const kids = new Map<string, string[]>()
  for (const r of rows) if (r.parentId) kids.set(r.parentId, [...(kids.get(r.parentId) ?? []), r.id])
  const out: string[] = []
  const seen = new Set([id])
  const stack = [...(kids.get(id) ?? [])]
  while (stack.length) {
    const x = stack.pop()!
    if (seen.has(x)) continue
    seen.add(x)
    out.push(x)
    stack.push(...(kids.get(x) ?? []))
  }
  return out
}

/** True when putting `id` under `newParent` would make a loop. */
export const wouldCycle = (id: string, newParent: string, rows: TreeRow[]) => newParent === id || subtree(id, rows).includes(newParent)
```

`parentsOf` with no loop in `rows` terminates because every step adds to `seen`; `rootOf` and `ancestors` only follow `parents`, which has no loops.

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run src/sheets/tree.test.ts && npx tsc --noEmit -p .`
Expected: PASS. If `tsc` reports a `switch` over `SheetBlock['kind']` that is now non-exhaustive, leave it for Task 5 only if it's in a file Task 5 edits. Otherwise make the new kind fall into the existing non-text branch.

- [ ] **Step 6: Commit**

```bash
git add src/sheets/types.ts src/data/db.ts src/sheets/tree.ts src/sheets/tree.test.ts
git commit -m "Page tree fields (parentId, box) and pure tree helpers with loop handling"
```

---

### Task 2: Resolve folders through the tree; lists show top-level pages only

**Files:**
- Modify: `src/data/pages.ts`
- Modify: `src/data/pages.test.ts`
- Modify: `src/features/library/LibraryPage.tsx` (`here`, `stats`, search path)
- Modify: `src/app/Shell.tsx` (`groupOf`, folder `ps`, `loose`)

**Interfaces:**
- Consumes: `parentsOf`, `rootOf` (Task 1)
- Produces:
  - The sheet variant of `Page` gains `parentId?: string`. For a sub-page, `folderId` is its top page's folder and `unit` is `undefined`.
  - `topLevel(pages: Page[]): Page[]`
  - `pagePath(p: Page, pages: Page[]): string[]` (ancestor titles, top first)
  - `PAGE_DRAG = 'application/x-mneme-page'`, moved here from Shell so the canvas can use it

- [ ] **Step 1: Write the failing tests**

Append to `src/data/pages.test.ts`. Reuse that file's existing row factories if it has them; otherwise use these:

```ts
import { pagePath, pagesOf, topLevel } from './pages'
import { DEFAULT_PAPER, type SheetRow } from '../sheets/types'

const sheet = (id: string, more: Partial<SheetRow> = {}): SheetRow =>
  ({ id, folderId: null, title: id, titleAuto: false, paper: DEFAULT_PAPER, createdAt: 0, updatedAt: 0, ...more })

describe('sub-pages in page lists', () => {
  const rows = [
    sheet('cps', { folderId: 'fall', unit: 'Year 2' }),
    sheet('ch3', { parentId: 'cps', box: 'w2', folderId: null, unit: 'stale' }),
    sheet('ps3', { parentId: 'ch3', box: 'b' }),
    sheet('lost', { parentId: 'gone', folderId: 'fall' }),
  ]
  const pages = pagesOf([], [], rows)
  const get = (id: string) => pages.find((p) => p.id === id)!

  it('a sub-page takes its top page folder and no unit', () => {
    expect(get('ps3')).toMatchObject({ folderId: 'fall', unit: undefined, parentId: 'ch3' })
    expect(get('ch3')).toMatchObject({ folderId: 'fall', unit: undefined, parentId: 'cps' })
  })

  it('a page whose parent is missing is top level with no folder', () => {
    expect(get('lost')).toMatchObject({ folderId: null, parentId: undefined })
  })

  it('topLevel leaves sub-pages out', () => {
    expect(topLevel(pages).map((p) => p.id).sort()).toEqual(['cps', 'lost'])
  })

  it('pagePath lists the pages above, top first', () => {
    expect(pagePath(get('ps3'), pages)).toEqual(['cps', 'ch3'])
    expect(pagePath(get('cps'), pages)).toEqual([])
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/data/pages.test.ts`
Expected: FAIL (`topLevel` is not exported).

- [ ] **Step 3: Implement in `src/data/pages.ts`**

Change the sheet member of `Page` to:

```ts
  | { kind: 'sheet'; id: string; title: string; unit?: string; folderId: string | null; sheet: SheetRow; parentId?: string }
```

Replace `pagesOf` and add the helpers:

```ts
import { parentsOf, rootOf } from '../sheets/tree'

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
```

`pagePath` follows `parentId` values that `pagesOf` already checked, so it can't loop.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/data/pages.test.ts`
Expected: PASS

- [ ] **Step 5: Use it in the library**

In `src/features/library/LibraryPage.tsx`, inside `Browser`:
- Import `topLevel, pagePath` from `../../data/pages`.
- `const here = topLevel(pages).filter((p) => p.folderId === parentId)`
- In `stats`, count sheets through `pages` so sub-pages count: `const ss = pages.filter((p) => p.kind === 'sheet' && p.folderId && ids.has(p.folderId))`.
- Search already uses `pages`, so sub-pages are found. To show where they sit, pass `pages` into `Pages` (add a `all: Page[]` prop) and give `SheetCard` its path. In `Pages`, for a sheet: `folder={showFolder ? [folderName(p.folderId), ...pagePath(p, all)].filter(Boolean).join(' › ') || undefined : undefined}`. Do the same in the list view's `muted` line. Pass `all={pages}` at the three `<Pages` call sites.

- [ ] **Step 6: Use it in the sidebar**

In `src/app/Shell.tsx`:
- Import `topLevel` and `PAGE_DRAG` from `../data/pages`, delete the local `DRAG_TYPE` const and rename its uses to `PAGE_DRAG`.
- `groupOf`: `groupByUnit(topLevel(pages).filter((x) => x.folderId === folderId))…`
- In `Node`: `const ps = topLevel(pages).filter((p) => p.folderId === f.id)`
- `const loose = topLevel(pages).filter((p) => !p.folderId)`
- `count` stays on `pages`, so folder counts include sub-pages.

- [ ] **Step 7: Typecheck, run all tests, commit**

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: PASS (all existing tests still pass).

```bash
git add src/data/pages.ts src/data/pages.test.ts src/features/library/LibraryPage.tsx src/app/Shell.tsx
git commit -m "Sub-pages take their top page's folder; folder lists show top-level pages; search shows a sub-page's path"
```

---

### Task 3: Sub-page and box operations

**Files:**
- Create: `src/data/subpages.ts`
- Test: `src/data/subpages.test.ts`
- Modify: `src/data/arrange.ts` (placing a sheet at folder level clears `parentId` and `box`)

**Interfaces:**
- Consumes: `createSheet`, `addBlock`, `blocksFor`, `deleteBlock` (`src/data/sheets.ts`); `subtree`, `wouldCycle` (Task 1)
- Produces:
  - `boxesOf(sheetId: string): Promise<SheetBlock[]>` (kind `'box'`, sorted by y then x)
  - `addBox(sheetId: string, label?: string, at?: { x: number; y: number }): Promise<SheetBlock>`
  - `ensureBox(sheetId: string): Promise<string>` (the last box's id, or a new "Pages" box)
  - `kidsOf(sheetId: string): Promise<SheetRow[]>` (live sub-pages: not archived, not deleted)
  - `createSubPage(parentId: string, boxId: string, paper?: Paper): Promise<string>`
  - `moveIntoBox(pageId: string, parentId: string, boxId: string, order?: string[]): Promise<boolean>` (false = refused, a loop)
  - `moveOutALevel(pageId: string): Promise<void>`
  - `liftChildren(pageId: string): Promise<void>`
  - `deleteBox(boxId: string, withPages: boolean): Promise<void>`
  - `adoptOrphans(sheetId: string, now?: number): Promise<number>`

- [ ] **Step 1: Write the failing tests**

`src/data/subpages.test.ts`:

```ts
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import * as sheets from './sheets'
import * as sub from './subpages'

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

const row = (id: string) => db.sheets.get(id)

describe('sub-pages', () => {
  it('ensureBox makes a "Pages" box below everything once, then reuses the last box', async () => {
    const cps = await sheets.createSheet({ folderId: 'fall' })
    const a = await sub.ensureBox(cps)
    const box = (await sheets.blocksFor(cps)).find((b) => b.id === a)!
    expect(box).toMatchObject({ kind: 'box', data: { label: 'Pages' } })
    expect(box.y).toBeGreaterThan(2) // under the main column
    expect(await sub.ensureBox(cps)).toBe(a)
  })

  it('a new sub-page sits in the box, after the ones already there, with no folder of its own', async () => {
    const cps = await sheets.createSheet({ folderId: 'fall' })
    const box = (await sub.addBox(cps, 'Week 1')).id
    const ch1 = await sub.createSubPage(cps, box)
    const ch2 = await sub.createSubPage(cps, box)
    expect(await row(ch2)).toMatchObject({ parentId: cps, box, folderId: null })
    expect((await row(ch2))!.rank!).toBeGreaterThan((await row(ch1))!.rank!)
    expect((await sub.kidsOf(cps)).map((s) => s.id)).toEqual([ch1, ch2])
  })

  it('moving into a box takes the order given, and clears a unit', async () => {
    const cps = await sheets.createSheet()
    const box = (await sub.addBox(cps, 'Week 1')).id
    const a = await sub.createSubPage(cps, box)
    const loose = await sheets.createSheet({ unit: 'Old unit' })
    expect(await sub.moveIntoBox(loose, cps, box, [loose, a])).toBe(true)
    expect(await row(loose)).toMatchObject({ parentId: cps, box, rank: 0, folderId: null })
    expect((await row(loose))!.unit).toBeUndefined()
    expect((await row(a))!.rank).toBe(1)
  })

  it('refuses a move under its own sub-page', async () => {
    const cps = await sheets.createSheet()
    const ch3 = await sub.createSubPage(cps, await sub.ensureBox(cps))
    expect(await sub.moveIntoBox(cps, ch3, await sub.ensureBox(ch3))).toBe(false)
    expect((await row(cps))!.parentId).toBeUndefined()
  })

  it('moving out a level goes into the parent\'s place; from the top it lands in the top page\'s folder', async () => {
    const cps = await sheets.createSheet({ folderId: 'fall' })
    const ch3 = await sub.createSubPage(cps, await sub.ensureBox(cps))
    const ps3 = await sub.createSubPage(ch3, await sub.ensureBox(ch3))
    await sub.moveOutALevel(ps3)
    expect(await row(ps3)).toMatchObject({ parentId: cps, box: (await row(ch3))!.box })
    await sub.moveOutALevel(ps3)
    const top = (await row(ps3))!
    expect(top.parentId).toBeUndefined()
    expect(top.box).toBeUndefined()
    expect(top.folderId).toBe('fall')
  })

  it('liftChildren moves sub-pages into their parent\'s place', async () => {
    const cps = await sheets.createSheet({ folderId: 'fall', unit: 'Y2' })
    const kid = await sub.createSubPage(cps, await sub.ensureBox(cps))
    await sub.liftChildren(cps)
    expect(await row(kid)).toMatchObject({ folderId: 'fall', unit: 'Y2' })
    expect((await row(kid))!.parentId).toBeUndefined()
  })

  it('deleting a box and keeping its pages moves them to another box, or a new one', async () => {
    const cps = await sheets.createSheet()
    const w1 = (await sub.addBox(cps, 'Week 1')).id
    const kid = await sub.createSubPage(cps, w1)
    await sub.deleteBox(w1, false)
    const now = (await row(kid))!
    expect(now.parentId).toBe(cps)
    expect(now.box).not.toBe(w1)
    expect((await sheets.blocksFor(cps)).some((b) => b.id === now.box && b.kind === 'box')).toBe(true)
  })

  it('deleting a box with its pages sends them to Recently deleted', async () => {
    const cps = await sheets.createSheet()
    const w1 = (await sub.addBox(cps, 'Week 1')).id
    const kid = await sub.createSubPage(cps, w1)
    await sub.deleteBox(w1, true)
    expect((await row(kid))!.deletedAt).toBeTypeOf('number')
    expect((await sheets.blocksFor(cps)).some((b) => b.id === w1)).toBe(false)
  })

  it('adoptOrphans moves sub-pages whose box is gone into a box, but only after a minute', async () => {
    const cps = await sheets.createSheet()
    const kid = await sub.createSubPage(cps, 'gone-box')
    expect(await sub.adoptOrphans(cps)).toBe(0) // fresh: the box may still be on its way
    expect(await sub.adoptOrphans(cps, Date.now() + 61_000)).toBe(1)
    const box = (await row(kid))!.box!
    expect((await sheets.blocksFor(cps)).some((b) => b.id === box && b.kind === 'box')).toBe(true)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/data/subpages.test.ts`
Expected: FAIL, cannot find module `./subpages`.

- [ ] **Step 3: Implement `src/data/subpages.ts`**

```ts
import { db } from './db'
import { addBlock, blocksFor, createSheet, deleteBlock } from './sheets'
import { trashPage } from './trash'
import { MAIN_BLOCK, type Paper, type SheetBlock, type SheetRow } from '../sheets/types'
import { wouldCycle } from '../sheets/tree'

// Pages under pages. A sub-page has `parentId` (the page) and `box` (the box block on that page that
// shows it). Boxes don't list their pages: they read them, so the canvas and the sidebar always agree.

const live = (s: SheetRow) => !s.archived && !s.deletedAt
const byRank = (a: SheetRow, b: SheetRow) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.title.localeCompare(b.title, undefined, { numeric: true })

export async function boxesOf(sheetId: string): Promise<SheetBlock[]> {
  return (await blocksFor(sheetId)).filter((b) => b.kind === 'box').sort((a, b) => a.y - b.y || a.x - b.x)
}

/** A box on the page, by default under everything else, as wide as the main column. */
export async function addBox(sheetId: string, label = '', at?: { x: number; y: number }): Promise<SheetBlock> {
  const blocks = await blocksFor(sheetId)
  const spot = at ?? { x: MAIN_BLOCK.x, y: Math.max(MAIN_BLOCK.y, ...blocks.map((b) => b.y + b.h)) + 1 }
  const z = Math.max(0, ...blocks.map((b) => b.z)) + 1
  return addBlock({ sheetId, ...spot, w: MAIN_BLOCK.w, h: 4, kind: 'box', data: { doc: null, label }, z })
}

export async function ensureBox(sheetId: string): Promise<string> {
  return (await boxesOf(sheetId)).at(-1)?.id ?? (await addBox(sheetId, 'Pages')).id
}

export async function kidsOf(sheetId: string): Promise<SheetRow[]> {
  return (await db.sheets.where('parentId').equals(sheetId).toArray()).filter(live).sort(byRank)
}

const nextRank = async (parentId: string, boxId: string) =>
  Math.max(-1, ...(await kidsOf(parentId)).filter((s) => s.box === boxId).map((s) => s.rank ?? -1)) + 1

export async function createSubPage(parentId: string, boxId: string, paper?: Paper): Promise<string> {
  const id = await createSheet({ folderId: null, paper })
  await db.sheets.update(id, { parentId, box: boxId, rank: await nextRank(parentId, boxId) })
  return id
}

/** Puts a page in a box (at the end, or in `order`'s place). Refuses, returning false, if it would be under itself. */
export async function moveIntoBox(pageId: string, parentId: string, boxId: string, order?: string[]): Promise<boolean> {
  const all = await db.sheets.toArray()
  if (wouldCycle(pageId, parentId, all)) return false
  const rank = order ? order.indexOf(pageId) : await nextRank(parentId, boxId)
  await db.transaction('rw', db.sheets, async () => {
    await db.sheets.where('id').equals(pageId).modify((s) => {
      s.parentId = parentId; s.box = boxId; s.folderId = null; s.rank = rank; s.updatedAt = Date.now()
      delete s.unit
    })
    if (order) for (const [i, id] of order.entries()) if (id !== pageId) await db.sheets.update(id, { rank: i })
  })
  return true
}

/** The folder a page lives in: its top page's. */
async function folderOf(id: string): Promise<string | null> {
  const seen = new Set<string>()
  let s = await db.sheets.get(id)
  while (s?.parentId && !seen.has(s.id)) {
    seen.add(s.id)
    const up = await db.sheets.get(s.parentId)
    if (!up) return null
    s = up
  }
  return s?.folderId ?? null
}

/** Makes a page top level in a folder (and unit). */
async function toTop(pageId: string, folderId: string | null, unit?: string) {
  await db.sheets.where('id').equals(pageId).modify((s) => {
    delete s.parentId; delete s.box; delete s.rank
    s.folderId = folderId; s.updatedAt = Date.now()
    if (unit) s.unit = unit; else delete s.unit
  })
}

export async function moveOutALevel(pageId: string): Promise<void> {
  const s = await db.sheets.get(pageId)
  const parent = s?.parentId ? await db.sheets.get(s.parentId) : undefined
  if (!s || !parent) return
  if (parent.parentId) await moveIntoBox(pageId, parent.parentId, parent.box ?? await ensureBox(parent.parentId))
  else await toTop(pageId, await folderOf(parent.id), parent.unit)
}

/** Moves a page's sub-pages into its own place (before it's deleted or archived without them). */
export async function liftChildren(pageId: string): Promise<void> {
  const s = await db.sheets.get(pageId)
  if (!s) return
  const folder = await folderOf(pageId)
  for (const k of await kidsOf(pageId)) {
    if (s.parentId) await moveIntoBox(k.id, s.parentId, s.box ?? await ensureBox(s.parentId))
    else await toTop(k.id, folder, s.unit)
  }
}

/** Deletes a box. Its pages go to Recently deleted with it, or move into another box on the page. */
export async function deleteBox(boxId: string, withPages: boolean): Promise<void> {
  const box = await db.sheetBlocks.get(boxId)
  if (!box) return
  const pages = (await kidsOf(box.sheetId)).filter((s) => s.box === boxId)
  if (withPages) for (const p of pages) await trashPage('sheet', p.id)
  else if (pages.length) {
    const other = (await boxesOf(box.sheetId)).filter((b) => b.id !== boxId).at(-1)?.id ?? (await addBox(box.sheetId, 'Pages')).id
    for (const p of pages) await moveIntoBox(p.id, box.sheetId, other)
  }
  await deleteBlock(boxId)
}

/**
 * Sub-pages whose box is gone (deleted on another device) move into the page's last box. Only ones
 * unchanged for a minute: a box made on another device may still be syncing in. Returns how many moved.
 */
export async function adoptOrphans(sheetId: string, now = Date.now()): Promise<number> {
  const boxes = new Set((await boxesOf(sheetId)).map((b) => b.id))
  const lost = (await kidsOf(sheetId)).filter((s) => !s.box || !boxes.has(s.box)).filter((s) => s.updatedAt < now - 60_000)
  if (!lost.length) return 0
  const into = await ensureBox(sheetId)
  for (const s of lost) await moveIntoBox(s.id, sheetId, into)
  return lost.length
}
```

`trashPage('sheet', id)` gains a `withKids` argument in Task 4. Its default is `true`, so this call already trashes each page's whole tree.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/data/subpages.test.ts`
Expected: PASS. The "with its pages" test only checks that the page itself is marked deleted. Task 4 adds the sub-tree checks.

- [ ] **Step 5: Folder-level drops clear the tree fields**

In `src/data/arrange.ts`, in the `r.kind === 'sheet'` branch, strip `parentId` and `box` too when it's the page being placed:

```ts
        const { unit: _u, parentId: _p, box: _b, ...rest } = s
        await db.sheets.put(isPage ? { ...rest, folderId: to.folderId, ...(to.unit ? { unit: to.unit } : {}), rank } : { ...s, rank })
```

Add a test to the existing arrange tests (create `src/data/arrange.test.ts` if there is none, with the fake-indexeddb header used above). It should check that placing a sub-page at folder level clears `parentId` and `box`:

```ts
it('placing a sub-page in a folder makes it top level', async () => {
  const cps = await sheets.createSheet()
  const kid = await sub.createSubPage(cps, await sub.ensureBox(cps))
  await placePage({ kind: 'sheet', id: kid }, { folderId: 'fall', unit: null }, [{ kind: 'sheet', id: kid }])
  const s = (await db.sheets.get(kid))!
  expect(s.parentId).toBeUndefined()
  expect(s.box).toBeUndefined()
  expect(s.folderId).toBe('fall')
})
```

- [ ] **Step 6: Run all tests, commit**

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: PASS

```bash
git add src/data/subpages.ts src/data/subpages.test.ts src/data/arrange.ts src/data/arrange.test.ts
git commit -m "Sub-page and box operations: new sub-page, move into a box (no loops), move out a level, delete a box, adopt pages whose box went missing"
```

---

### Task 4: Delete, archive and restore whole trees

**Files:**
- Modify: `src/data/trash.ts`
- Modify: `src/data/sheets.ts` (`setSheetArchived`)
- Modify: `src/data/repo.ts` (`listArchive`)
- Modify: `src/data/trash.test.ts`, `src/data/sheets.test.ts`
- Modify: `src/ui/confirm.tsx` (`chooseAction`)
- Modify: `src/app/trash.ts` (`deleteWithUndo`, new `archiveSheet`)
- Modify: `src/app/Shell.tsx` (`PageMenu` archive and delete)
- Modify: `src/features/sheet/SheetPage.tsx` (the ⋯ menu's Archive and Delete)
- Modify: `src/features/library/LibraryPage.tsx` (`ArchivePage`: counts)

**Interfaces:**
- Consumes: `subtree` (Task 1), `liftChildren` (Task 3)
- Produces:
  - `trashPage(kind, id, withKids = true)`. For a sheet with `withKids`, the sub-tree is marked with the same `deletedAt`. With `withKids` false, `liftChildren` runs first.
  - `restorePage(kind, id)`. For a sheet, it restores every row in its sub-tree with the same `deletedAt`.
  - `deleteForGood('sheet', id)` removes the sub-tree rows that share its `deletedAt`.
  - `listTrash()` and `listArchive()` return only tree tops in `sheets`, plus a new `sheetKids: Record<string, number>`.
  - `setSheetArchived(id, archived, withKids = true)`, working the same way with `archivedAt`.
  - `chooseAction<T extends string>(o: { title: string; body?: string; choices: { value: T; label: string; danger?: boolean }[] }): Promise<T | null>`
  - `deleteWithUndo(kind, id): Promise<boolean>` (false when the user cancelled)
  - `archiveSheet(id): Promise<boolean>`

- [ ] **Step 1: Write the failing tests**

Append to `src/data/trash.test.ts`. Add `import * as sub from './subpages'` to its imports.

```ts
describe('recently deleted with sub-pages', () => {
  const tree = async () => {
    const cps = await sheets.createSheet()
    const ch3 = await sub.createSubPage(cps, await sub.ensureBox(cps))
    const ps3 = await sub.createSubPage(ch3, await sub.ensureBox(ch3))
    return { cps, ch3, ps3 }
  }

  it('deleting a page takes its sub-pages; the bin shows only the top with a count', async () => {
    const { cps } = await tree()
    await trash.trashPage('sheet', cps)
    expect(await sheets.listSheets()).toEqual([])
    const t = await trash.listTrash()
    expect(t.sheets.map((s) => s.id)).toEqual([cps])
    expect(t.sheetKids[cps]).toBe(2)
  })

  it('restoring brings the whole tree back in place', async () => {
    const { cps, ch3, ps3 } = await tree()
    await trash.trashPage('sheet', cps)
    await trash.restorePage('sheet', cps)
    expect((await sheets.listSheets()).map((s) => s.id).sort()).toEqual([cps, ch3, ps3].sort())
    expect((await db.sheets.get(ps3))!.parentId).toBe(ch3)
  })

  it('a sub-page deleted earlier on its own stays deleted when its parent is restored', async () => {
    const { cps, ps3 } = await tree()
    await trash.trashPage('sheet', ps3, true, Date.now() - 1000)
    await trash.trashPage('sheet', cps)
    await trash.restorePage('sheet', cps)
    expect((await db.sheets.get(ps3))!.deletedAt).toBeTypeOf('number')
  })

  it('keeping the sub-pages moves them up before the page goes', async () => {
    const { cps, ch3, ps3 } = await tree()
    await trash.trashPage('sheet', ch3, false)
    expect((await db.sheets.get(ps3))!.parentId).toBe(cps)
    expect((await db.sheets.get(ps3))!.deletedAt).toBeUndefined()
  })

  it('purging removes the sub-pages too', async () => {
    const { cps, ch3, ps3 } = await tree()
    await trash.trashPage('sheet', cps, true, Date.now() - 6 * DAY)
    await trash.purgeTrash()
    expect(await db.sheets.bulkGet([cps, ch3, ps3])).toEqual([undefined, undefined, undefined])
  })
})
```

Append to `src/data/sheets.test.ts`. Add `import * as sub from './subpages'`.

```ts
it('archiving a page archives its sub-pages; the archive lists the top with a count; restoring brings them all back', async () => {
  const cps = await sheets.createSheet()
  const kid = await sub.createSubPage(cps, await sub.ensureBox(cps))
  await sheets.setSheetArchived(cps, true)
  expect(await sheets.listSheets()).toEqual([])
  const a = await repo.listArchive()
  expect(a.sheets.map((s) => s.id)).toEqual([cps])
  expect(a.sheetKids[cps]).toBe(1)
  await sheets.setSheetArchived(cps, false)
  expect((await sheets.listSheets()).map((s) => s.id).sort()).toEqual([cps, kid].sort())
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/data/trash.test.ts src/data/sheets.test.ts`
Expected: FAIL (`sheetKids` undefined, sub-pages still listed).

- [ ] **Step 3: Implement the trash changes in `src/data/trash.ts`**

Add the imports `import { subtree } from '../sheets/tree'` and `import { liftChildren } from './subpages'`. Then:

```ts
/** A sheet and the sub-pages that were deleted (or archived) with it: same stamp, same tree. */
export async function sameStamp(id: string, key: 'deletedAt' | 'archivedAt'): Promise<string[]> {
  const all = await db.sheets.toArray()
  const stamp = all.find((s) => s.id === id)?.[key]
  if (stamp === undefined) return [id]
  return [id, ...subtree(id, all).filter((x) => all.find((s) => s.id === x)?.[key] === stamp)]
}

/** Tree tops among `rows` (their parent isn't also in `rows` with the same stamp), with how many sub-pages went with each. */
export function tops(rows: SheetRow[], all: SheetRow[], key: 'deletedAt' | 'archivedAt'): { sheets: SheetRow[]; sheetKids: Record<string, number> } {
  const byId = new Map(all.map((s) => [s.id, s]))
  const inTree = (s: SheetRow) => { const p = s.parentId ? byId.get(s.parentId) : undefined; return !!p && p[key] === s[key] && p[key] !== undefined }
  const top = rows.filter((s) => !inTree(s))
  const sheetKids: Record<string, number> = {}
  for (const t of top) sheetKids[t.id] = subtree(t.id, all).filter((x) => byId.get(x)?.[key] === t[key]).length
  return { sheets: top, sheetKids }
}

export async function trashPage(kind: TrashKind, id: string, withKids = true, now = Date.now()) {
  if (kind !== 'sheet') return mark(kind, id, { archived: true, archivedAt: now, deletedAt: now })
  if (!withKids) await liftChildren(id)
  const all = await db.sheets.toArray()
  const ids = [id, ...(withKids ? subtree(id, all).filter((x) => !all.find((s) => s.id === x)?.deletedAt) : [])]
  for (const x of ids) await mark('sheet', x, { archived: true, archivedAt: now, deletedAt: now })
}

export async function restorePage(kind: TrashKind, id: string) {
  if (kind !== 'sheet') return mark(kind, id, { archived: false })
  for (const x of await sameStamp(id, 'deletedAt')) await mark('sheet', x, { archived: false })
}
```

In `deleteForGood`'s sheet branch, loop over the tree:

```ts
  else {
    for (const x of await sameStamp(id, 'deletedAt')) {
      await forgetPageImages(x, (await db.sheetBlocks.where('sheetId').equals(x).toArray()).map((b) => b.data.doc))
      await deleteSheet(x)
    }
  }
```

`listTrash` returns `{ decks, notes, ...tops(sheets.filter((s) => s.deletedAt).sort(by), sheets, 'deletedAt') }`, and its return type gains `sheetKids: Record<string, number>`.

`purgeTrash` needs no change: it iterates tops, and `deleteForGood` takes their trees. A sub-page deleted on its own is its own top, because its parent isn't deleted with the same stamp.

There's an import cycle: `subpages.ts` imports `trash.ts`, and `trash.ts` imports `subpages.ts`. ES modules allow it because both only use each other inside functions. If Vitest reports a function as undefined at import time, move `liftChildren`'s import in `trash.ts` to a dynamic `await import('./subpages')` inside `trashPage`.

- [ ] **Step 4: Implement archive in `src/data/sheets.ts` and `src/data/repo.ts`**

`src/data/sheets.ts`:

```ts
export async function setSheetArchived(id: string, archived: boolean, withKids = true) {
  if (archived) {
    if (!withKids) await (await import('./subpages')).liftChildren(id)
    const now = Date.now()
    const all = await db.sheets.toArray()
    const ids = [id, ...(withKids ? subtree(id, all).filter((x) => !all.find((s) => s.id === x)?.archived) : [])]
    for (const x of ids) await db.sheets.update(x, { archived: true, archivedAt: now })
  } else {
    const { sameStamp } = await import('./trash')
    for (const x of await sameStamp(id, 'archivedAt')) await db.sheets.update(x, { archived: false })
  }
}
```

(Import `subtree` from `../sheets/tree`. The dynamic imports avoid a cycle with `subpages.ts`, which imports `sheets.ts`.)

`src/data/repo.ts`, `listArchive`: sheets become `...tops(sheets.filter(kept).sort(by), sheets, 'archivedAt')`, imported from `./trash`. Add `sheetKids` to the return type.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/data`
Expected: PASS, including the Task 3 "with its pages" test.

- [ ] **Step 6: Add `chooseAction` to `src/ui/confirm.tsx`**

```ts
type Choice = { value: string; label: string; danger?: boolean }
type Choose = { title: string; body?: string; choices: Choice[]; resolve: (v: string | null) => void }
const useChoose = create<{ ask: Choose | null }>(() => ({ ask: null }))

/** A question with several answers as buttons. Resolves to the picked value, or null on Cancel. */
export function chooseAction<T extends string>(o: { title: string; body?: string; choices: { value: T; label: string; danger?: boolean }[] }): Promise<T | null> {
  return new Promise((resolve) => useChoose.setState({ ask: { ...o, resolve: resolve as (v: string | null) => void } }))
}

function ChooseHost() {
  const ask = useChoose((s) => s.ask)
  if (!ask) return null
  const done = (v: string | null) => { useChoose.setState({ ask: null }); ask.resolve(v) }
  return (
    <Sheet onClose={() => done(null)} label={ask.title} width={460}>
      <h2 style={{ fontSize: 22, paddingRight: 30 }}>{ask.title}</h2>
      {ask.body && <p className="lede" style={{ fontSize: 14 }}>{ask.body}</p>}
      <div className="actions">
        <button className="btn ghost" onClick={() => done(null)}>Cancel</button>
        {ask.choices.map((c, i) => (
          <button key={c.value} className={`btn ${c.danger ? 'danger-solid' : i === ask.choices.length - 1 ? 'primary' : ''}`} autoFocus={i === 0} onClick={() => done(c.value)}>{c.label}</button>
        ))}
      </div>
    </Sheet>
  )
}
```

Render `<ChooseHost />` from `ConfirmHost` next to the existing hosts: `if (!ask) return <><AskNameHost /><ChooseHost /></>`.

- [ ] **Step 7: Ask before deleting or archiving a page with sub-pages**

`src/app/trash.ts`:

```ts
import { db } from '../data/db'
import { setSheetArchived } from '../data/sheets'
import { subtree } from '../sheets/tree'
import { chooseAction } from '../ui/confirm'
import { toast } from '../ui/toasts'

/** How many live pages sit below a page. */
async function under(id: string) {
  return subtree(id, (await db.sheets.toArray()).filter((s) => !s.archived && !s.deletedAt)).length
}
const pagesWord = (n: number) => `${n} sub-page${n === 1 ? '' : 's'}`

/** Deletes a deck, notes page or page into Recently deleted, with Undo on the toast. A page with sub-pages asks first. Returns false if cancelled. */
export async function deleteWithUndo(kind: TrashKind, id: string): Promise<boolean> {
  let withKids = true
  if (kind === 'sheet') {
    const n = await under(id)
    if (n) {
      const c = await chooseAction({ title: 'Delete its sub-pages too?', body: `This page has ${pagesWord(n)}. Kept ones move up to where this page was.`, choices: [{ value: 'keep', label: 'Keep them' }, { value: 'all', label: `Delete all ${n + 1}`, danger: true }] })
      if (!c) return false
      withKids = c === 'all'
    }
  }
  await trashPage(kind, id, withKids)
  toastAction(`${NOUN[kind]} deleted`, { label: 'Undo', run: () => { void restorePage(kind, id) } }, 'trash')
  return true
}

/** Archives a page; with sub-pages, asks whether they go too. Returns false if cancelled. */
export async function archiveSheet(id: string): Promise<boolean> {
  let withKids = true
  const n = await under(id)
  if (n) {
    const c = await chooseAction({ title: 'Archive its sub-pages too?', body: `This page has ${pagesWord(n)}. Kept ones move up to where this page was.`, choices: [{ value: 'keep', label: 'Keep them' }, { value: 'all', label: `Archive all ${n + 1}` }] })
    if (!c) return false
    withKids = c === 'all'
  }
  await setSheetArchived(id, true, withKids)
  toast('Page archived', 'Find it under Archive in the sidebar', 'archive')
  return true
}
```

Wire it in:
- **`src/app/Shell.tsx` `PageMenu`:**
  - Archive: for a sheet call `archiveSheet(id)`; decks and notes are unchanged.
  - Delete: `if (await deleteWithUndo(kind, id) && location.pathname.startsWith(url)) nav('/')`. This navigates only after a confirmed delete.
- **`src/features/sheet/SheetPage.tsx` ⋯ menu:**
  - Archive: `if (await archiveSheet(sheet.id)) nav('/')`, replacing the direct `setSheetArchived` plus toast.
  - Delete: check how it calls `deleteWithUndo` and navigate only when it returns true.

- [ ] **Step 8: Counts in the Archive page**

In `ArchivePage` (`src/features/library/LibraryPage.tsx`):
- Recently deleted rows for sheets: after the title, `{bin.sheetKids[x.id] ? <span className="muted"> and {bin.sheetKids[x.id]} sub-page{bin.sheetKids[x.id] === 1 ? '' : 's'}</span> : null}`. Keep the existing `deleted` list, and look the count up by id when `x.kind === 'sheet'`.
- Archived pages rows: the same with `data.sheetKids[s.id]`.

- [ ] **Step 9: Typecheck, all tests, commit**

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: PASS

```bash
git add src/data src/ui/confirm.tsx src/app/trash.ts src/app/Shell.tsx src/features/sheet/SheetPage.tsx src/features/library/LibraryPage.tsx
git commit -m "Delete, archive and restore take a page's sub-pages along (or keep them, moved up); Recently deleted and Archive list the top page with a count; purge removes whole trees"
```

---

### Task 5: The box block on the canvas

**Files:**
- Create: `src/features/sheet/BoxBlock.tsx`
- Modify: `src/features/sheet/Canvas.tsx` (render branch, context menu, `addBox` on the canvas API, delete asks, adopt on open)
- Modify: `src/features/sheet/store.ts` (`CanvasApi.addBox`)
- Modify: `src/sheets/history.ts` (a box's label undoes)
- Modify: `src/sheets/insert.ts`, `src/features/sheet/editor/commands.ts`, `src/features/sheet/Dock.tsx` (Insert "Box of pages")
- Modify: `src/features/sheet/editor/nodes.tsx` (`pickPage` options: kinds and exclude)
- Modify: `src/sheets/insert.test.ts`
- Modify: `src/styles/sheet.css`

**Interfaces:**
- Consumes: `addBox`, `kidsOf`, `createSubPage`, `moveIntoBox`, `deleteBox`, `adoptOrphans` (Task 3); `PAGE_DRAG` (Task 2); `chooseAction` (Task 4)
- Produces:
  - `CanvasApi.addBox(at?: { x: number; y: number }): Promise<void>`
  - `pickPage(opts?: { kinds?: PageKind[]; exclude?: string[]; title?: string }): Promise<{ kind: PageKind; id: string } | null>`
  - `InsertId` gains `'box'` (label "Box of pages", letter `B`, group `'Other'`)

- [ ] **Step 1: Insert list test first**

In `src/sheets/insert.test.ts`, add:

```ts
it('has a box of pages on B', () => {
  expect(byLetter('B')?.id).toBe('box')
  expect(searchInserts('sub')[0].id).toBe('box')
})
```

Run: `npx vitest run src/sheets/insert.test.ts`. Expected: FAIL.

Add `'box'` to `InsertId`, and this entry before `link` in `INSERTS`:

```ts
  { id: 'box', label: 'Box of pages', letter: 'B', group: 'Other', words: ['sub-page', 'subpage', 'pages', 'section', 'week', 'container', 'folder'] },
```

Run the test again. Expected: PASS. If "sub" ranks something else first, put `'sub-pages'` first in `words`. The scorer ranks label prefix, then word prefix.

- [ ] **Step 2: Route the insert to the canvas**

- `src/features/sheet/store.ts`: add to `CanvasApi`:
  ```ts
  /** A box of sub-pages at a grid cell (default: a free spot in the middle of the view). */
  addBox: (at?: { x: number; y: number }) => Promise<void>
  ```
- `src/features/sheet/Dock.tsx` `insertNow`: as the first line after closing the panel, add `if (id === 'box') { await canvas?.addBox(at); return }`. Read `canvas` from `useSheetUI.getState()` before that line.
- `src/features/sheet/editor/commands.ts`:
  - In `nodeFor`, add `case 'box': return null`.
  - In `runInsert`, start with `if (id === 'box') { await useSheetUI.getState().canvas?.addBox(); return }`, so the `/` menu works too.

- [ ] **Step 3: `pickPage` options**

In `src/features/sheet/editor/nodes.tsx`, change the picker store to carry options:

```ts
type PickOpts = { kinds?: PageKind[]; exclude?: string[]; title?: string }
const usePick = create<{ resolve: ((t: Target | null) => void) | null; opts: PickOpts }>(() => ({ resolve: null, opts: {} }))
export const pickPage = (opts: PickOpts = {}) => new Promise<Target | null>((resolve) => usePick.setState({ resolve, opts }))
```

In `PagePickerHost`, read `opts` and filter hits with `(!opts.kinds || opts.kinds.includes(p.kind)) && !opts.exclude?.includes(p.id)`. Use `opts.title ?? 'Link a deck or page'` for the heading and label. Existing callers pass nothing, so they behave as before.

- [ ] **Step 4: Undo restores a box's title**

In `src/sheets/history.ts` `applyChange`, change the bookmark-only data line to cover boxes:

```ts
  // A bookmark's or box's name undoes too (a text block's doc never does: newer typing would be lost).
  else if (c.kind === 'update') await updateBlock(c.after.id, { x: c.after.x, y: c.after.y, w: c.after.w, ...(c.after.kind !== 'text' ? { data: c.after.data } : {}) })
```

Add to `src/sheets/history.test.ts`, following its existing update test: record an `update` whose before and after differ only in `data.label` on a `kind: 'box'` block, undo it, and expect the stored label to be the old one.

- [ ] **Step 5: `BoxBlock.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { createSubPage, kidsOf, moveIntoBox } from '../../data/subpages'
import { PAGE_DRAG } from '../../data/pages'
import { parentsOf, ancestors } from '../../sheets/tree'
import type { SheetBlock } from '../../sheets/types'
import { Icon } from '../../ui/Icons'
import { toast } from '../../ui/toasts'
import { useSettings } from '../../settings/store'
import { pickPage } from './editor/nodes'

/** First line of text in a TipTap doc, for a card's preview. */
function firstLine(doc: unknown): string {
  type N = { type?: string; text?: string; content?: N[] }
  const lines: string[] = []
  const walk = (n: N, acc: string[]) => { if (n.text) acc.push(n.text); n.content?.forEach((c) => walk(c, acc)) }
  for (const block of ((doc as N | null)?.content ?? [])) {
    if (block.type === 'heading' && lines.length === 0) continue // the title is already on the card
    const acc: string[] = []; walk(block, acc)
    if (acc.join('').trim()) { lines.push(acc.join('')); break }
  }
  return lines[0] ?? ''
}

/**
 * A box of sub-pages on a page. Its cards are the pages whose `box` is this block, read live, so the
 * sidebar and the box always agree. Drag cards to reorder, between boxes, or in from the sidebar.
 */
export function BoxBlock({ block, onHeight, onRename }: { block: SheetBlock; onHeight: (px: number) => void; onRename: (label: string) => void }) {
  const nav = useNavigate()
  const sheetId = block.sheetId
  const data = useLiveQuery(async () => {
    const kids = (await kidsOf(sheetId)).filter((s) => s.box === block.id)
    const ids = kids.map((k) => k.id)
    const mains = ids.length ? await db.sheetBlocks.where('sheetId').anyOf(ids).filter((b) => b.role === 'main').toArray() : []
    const grand = ids.length ? await db.sheets.where('parentId').anyOf(ids).filter((s) => !s.archived && !s.deletedAt).toArray() : []
    return kids.map((k) => ({ s: k, line: firstLine(mains.find((m) => m.sheetId === k.id)?.data.doc), n: grand.filter((g) => g.parentId === k.id).length }))
  }, [sheetId, block.id])
  const [label, setLabel] = useState(block.data.label ?? '')
  useEffect(() => setLabel(block.data.label ?? ''), [block.data.label])
  const el = useRef<HTMLDivElement>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  // The canvas passes a new onHeight every render; observe once and call the latest.
  const heightCb = useRef(onHeight)
  heightCb.current = onHeight
  useEffect(() => {
    if (!el.current) return
    const ro = new ResizeObserver(() => heightCb.current(el.current!.offsetHeight))
    ro.observe(el.current)
    return () => ro.disconnect()
  }, [])

  const cards = data ?? []
  const newPage = async () => nav(`/write/${await createSubPage(sheetId, block.id, useSettings.getState().paperDefault ?? undefined)}`)
  const addExisting = async () => {
    const all = await db.sheets.toArray()
    const t = await pickPage({ kinds: ['sheet'], exclude: [sheetId, ...ancestors(sheetId, parentsOf(all)), ...cards.map((c) => c.s.id)], title: 'Put a page in this box' })
    if (!t) return
    if (!await moveIntoBox(t.id, sheetId, block.id)) toast("Can't put a page inside its own sub-page")
  }
  // Where a drop lands: before the card under the pointer's middle, else at the end.
  const indexAt = (y: number) => {
    const rows = [...(el.current?.querySelectorAll<HTMLElement>('.sbox-card') ?? [])]
    const i = rows.findIndex((r) => { const b = r.getBoundingClientRect(); return y < b.top + b.height / 2 })
    return i === -1 ? rows.length : i
  }
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(PAGE_DRAG)) return
    e.preventDefault(); e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDropAt(indexAt(e.clientY))
  }
  const onDrop = async (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(PAGE_DRAG)
    setDropAt(null)
    if (!raw) return
    e.preventDefault(); e.stopPropagation()
    const { kind, id } = JSON.parse(raw) as { kind: string; id: string }
    if (kind !== 'sheet') { toast('Only pages you write can go in a box'); return }
    const order = cards.map((c) => c.s.id).filter((x) => x !== id)
    order.splice(Math.min(indexAt(e.clientY), order.length), 0, id)
    if (!await moveIntoBox(id, sheetId, block.id, order)) toast("Can't put a page inside its own sub-page")
  }

  return (
    <div ref={el} className="sbox" onDragOver={onDragOver} onDragLeave={(e) => { if (e.currentTarget === e.target) setDropAt(null) }} onDrop={onDrop}>
      <div className="sbox-head">
        <input className="sbox-label" value={label} placeholder="Pages" aria-label="Box title"
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => { if (label.trim() !== (block.data.label ?? '')) onRename(label.trim()) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
        <span className="sbox-n">{cards.length}</span>
      </div>
      {cards.map((c, i) => (
        <Link key={c.s.id} to={`/write/${c.s.id}`} className={`sbox-card ${dropAt === i ? 'drop-before' : ''}`} draggable
          data-page-kind="sheet" data-page-id={c.s.id} data-page-title={c.s.title} data-page-parent={sheetId} data-page-box={block.id}
          onDragStart={(e) => { e.dataTransfer.setData(PAGE_DRAG, JSON.stringify({ kind: 'sheet', id: c.s.id })); e.dataTransfer.effectAllowed = 'move' }}>
          <b>{c.s.title}</b>
          <small>{[c.line || 'Empty page', c.n ? `${c.n} sub-page${c.n === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</small>
        </Link>
      ))}
      {dropAt === cards.length && cards.length > 0 && <div className="sbox-drop" />}
      {!cards.length && <p className="sbox-empty">Drag pages here, or add one.</p>}
      <div className="sbox-add">
        <button type="button" onClick={() => void newPage()}><Icon name="plus" size={13} />New page</button>
        <button type="button" onClick={() => void addExisting()}><Icon name="page" size={13} />Add existing</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Render boxes in `Canvas.tsx`**

- **Imports:** `BoxBlock`; `adoptOrphans`, `addBox`, `deleteBox`, `kidsOf` from `../../data/subpages`; `chooseAction` from `../../ui/confirm`.
- **Adopt on open:** next to `pruneLeftovers` at line 143, add `useEffect(() => { void adoptOrphans(sheet.id) }, [sheet.id])`.
- **`addBox` callback,** beside `addBookmark`:
  ```ts
  const addBoxAt = useCallback(async (at?: { x: number; y: number }) => {
    const c = at ?? freeSpot(live.current.shown, middleCell(), MAIN_BLOCK.w, 4)
    const b = await addBox(sheet.id, '', c)
    history.record({ kind: 'add', block: b })
    select([b.id])
  }, [sheet.id, history]) // eslint-disable-line react-hooks/exhaustive-deps
  ```
  Add `addBox: addBoxAt` to the `canvas` object in the `useSheetUI.setState` effect. Import `MAIN_BLOCK` if it isn't already.
- **Render branch:** in `blocks.map`, make the ternary three-way. Before the text-block branch, add:
  ```tsx
  b.kind === 'box' ? (
    <div key={b.id} data-block-id={b.id} className={`sblock sblock-box ${selected.has(b.id) ? 'selected' : ''} ${many && selected.has(b.id) ? 'in-group' : ''}`}
      style={{ left: at.x * unit, top: at.y * unit, width: at.w * unit, zIndex: b.z }}
      onPointerDown={(e) => { if (e.button !== 1 && !space && tool !== 'pan') e.stopPropagation() }}>
      <button className="sgrip" aria-label="Move box: arrow keys move it, Enter selects it, Delete removes it" title="Drag to move · click to select (then Delete)" onPointerDown={startDrag(b, 'move')} onKeyDown={keyMove(b)}><Icon name="grid" size={12} /></button>
      <BoxBlock block={b}
        onHeight={(px) => {
          const h = Math.max(1, Math.ceil(px / unit))
          setHeights((m) => (m[b.id] === h ? m : { ...m, [b.id]: h }))
          if (h !== b.h) void sheets.updateBlock(b.id, { h })
        }}
        onRename={(label) => { const after = { ...b, data: { ...b.data, label } }; history.record({ kind: 'update', before: b, after }); void sheets.updateBlock(b.id, { data: after.data }) }} />
      <span className="swidth" aria-hidden="true" onPointerDown={startDrag(b, 'width')} />
    </div>
  ) : …text block…
  ```
  The text branch's `onHeight` takes lines. Check what `TextBlock` passes to `onHeight`. If it's lines, keep the box's conversion from px to lines as above. Either way, `heights` must hold lines.
- **Delete asks about pages:** wrap `removeSelection` so that a selection containing boxes with pages asks first:
  ```ts
  const removeWithBoxes = useCallback(async (ids: Set<string>, inkIds: Set<string> = new Set()) => {
    const boxes = live.current.blocks.filter((x) => ids.has(x.id) && x.kind === 'box')
    const kids = (await kidsOf(sheet.id)).filter((s) => boxes.some((bx) => bx.id === s.box))
    if (kids.length) {
      const c = await chooseAction({ title: kids.length === 1 ? 'Delete the page in this box too?' : `Delete the ${kids.length} pages in ${boxes.length === 1 ? 'this box' : 'these boxes'} too?`, body: 'Kept pages move into another box on this page.', choices: [{ value: 'keep', label: 'Keep them' }, { value: 'all', label: 'Delete them', danger: true }] })
      if (!c) return
      for (const bx of boxes) await deleteBox(bx.id, c === 'all')
      const rest = new Set([...ids].filter((x) => !boxes.some((bx) => bx.id === x)))
      if (rest.size || inkIds.size) await removeSelection(rest, inkIds)
      return
    }
    await removeSelection(ids, inkIds)
  }, [removeSelection, sheet.id])
  ```
  Use `removeWithBoxes` wherever the UI deletes a selection: the Delete key handler, the selection bar's Delete button, the block context menu's delete item and `removeBlocks`. `grep -n "removeSelection(" src/features/sheet/Canvas.tsx` finds each call. A box deleted with pages can't be brought back by Undo (its pages went to Recently deleted, or into another box). That is accepted for this phase.
- **Box context menu:** in the `useContextItems` handler, after the bookmark case:
  ```ts
  if (b?.kind === 'box') {
    return [
      { label: 'New page in this box', icon: 'plus', onSelect: async () => nav(`/write/${await createSubPage(sheet.id, b.id)}`) },
      { label: 'Rename box…', icon: 'edit', onSelect: async () => { const label = await askName({ title: 'Rename box', value: b.data.label ?? '', confirm: 'Rename' }); if (label !== null && label !== b.data.label) { const after = { ...b, data: { ...b.data, label } }; history.record({ kind: 'update', before: b, after }); await sheets.updateBlock(b.id, { data: after.data }) } } },
      { sep: true as const },
      { label: 'Delete box', icon: 'trash', danger: true, onSelect: () => removeWithBoxes(new Set([b.id])) },
    ]
  }
  ```
  A right-click on a card inside the box is caught first by `PageMenu` (`[data-page-id]`), so cards get Open, Rename, Archive and Delete for free. Make sure this handler returns null for targets inside `.sbox-card`: add `if (target.closest('.sbox-card')) return null` at its top. `nav` is `useNavigate()`; add it if `Canvas` doesn't have it.
- **Empty-paper menu:** add `{ label: 'Add a box of pages here', icon: 'page', onSelect: () => addBoxAt({ x: gx, y: gy }) }` after "Add a bookmark here".
- **Pointer events in the box:** cards are links and buttons inside a block wrapper that stops pointerdown propagation, so the canvas doesn't start a selection or pan. Check in the browser that dragging a card doesn't move the canvas.

- [ ] **Step 7: Styles in `src/styles/sheet.css`**

```css
/* A box of sub-pages */
.sbox { border: 1.5px solid var(--line); border-radius: 10px; background: color-mix(in oklab, var(--surface) 70%, var(--surface2)); padding: 10px; display: grid; gap: 7px; font-family: var(--sans); }
.sbox-head { display: flex; align-items: center; gap: 8px; }
.sbox-label { flex: 1; border: 0; background: none; font: 600 12.5px var(--sans); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); padding: 2px 4px; border-radius: 5px; min-width: 0; }
.sbox-label:focus { outline: 1.5px solid var(--accent); color: var(--ink); }
.sbox-n { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.sbox-card { display: grid; gap: 1px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); text-decoration: none; position: relative; transition: transform .15s var(--ease), box-shadow .15s; }
.sbox-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0, 0, 0, .08); }
.sbox-card b { font: 500 1.05rem var(--serif); }
.sbox-card small { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sbox-card::after { content: ''; position: absolute; top: -1px; right: -1px; width: 12px; height: 12px; border-bottom-left-radius: 3px; background: linear-gradient(225deg, color-mix(in oklab, var(--surface) 70%, var(--surface2)) 50%, color-mix(in oklab, var(--line) 80%, var(--ink)) 50%); opacity: .7; }
.sbox-card.drop-before { box-shadow: 0 -3px 0 var(--accent); }
.sbox-drop { height: 3px; border-radius: 2px; background: var(--accent); }
.sbox-empty { margin: 0; font-size: 13px; color: var(--muted); padding: 4px; }
.sbox-add { display: flex; gap: 6px; }
.sbox-add button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 1px dashed var(--line); background: none; border-radius: 7px; padding: 5px; color: var(--muted); font-size: 13px; }
.sbox-add button:hover { color: var(--accent); border-color: var(--accent); }
```

Check it on light, dark and one other palette (Sand). Nothing should use a literal colour that only reads in one theme.

- [ ] **Step 8: Typecheck, tests, try it, commit**

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: PASS

In the browser (`npm run dev`, about 1100×680):
1. Make a page and insert "Box of pages" (B). Name it Week 1, add two new pages, go back, then add an existing page.
2. Drag cards to reorder them. Drag a sidebar page into the box.
3. Right-click the box, then a card. Delete the box and choose Keep: the pages should move to a new "Pages" box.
4. Undo and redo a box rename.

```bash
git add src/features/sheet src/sheets src/styles/sheet.css
git commit -m "Box of pages on the canvas: cards read live from the sub-pages, new or existing page, drag to reorder or in from the sidebar, rename with undo, delete asks about its pages"
```

---

### Task 6: Boxes in Read view, print and shares

**Files:**
- Create: `src/sheets/box.ts`
- Test: `src/sheets/box.test.ts`
- Modify: `src/features/sheet/SheetPage.tsx` (print and share get boxes as text)
- Modify: `src/features/sheet/ReadView.tsx` (boxes as a heading and a list of links)

**Interfaces:**
- Produces: `boxesAsText(blocks: SheetBlock[], kids: { id: string; title: string; box?: string; rank?: number }[]): SheetBlock[]`. Each box becomes a `kind: 'text'` block with the same position: a heading (level 3) with the label (or "Pages"), then a bullet list of page titles in rank order. Other blocks are unchanged.

- [ ] **Step 1: Write the failing test**

`src/sheets/box.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { boxesAsText } from './box'
import type { SheetBlock } from './types'

const block = (over: Partial<SheetBlock>): SheetBlock => ({ id: 'b', sheetId: 's', x: 3, y: 10, w: 24, h: 4, kind: 'text', data: { doc: null }, z: 0, createdAt: 0, updatedAt: 0, ...over })

describe('boxes as text', () => {
  it('a box becomes its title and its pages, in order, at the same spot', () => {
    const out = boxesAsText([block({ id: 'w1', kind: 'box', data: { doc: null, label: 'Week 1' } })], [
      { id: 'b', title: 'Ch 2', box: 'w1', rank: 1 }, { id: 'a', title: 'Ch 1', box: 'w1', rank: 0 }, { id: 'c', title: 'Other', box: 'w2' },
    ])
    expect(out[0]).toMatchObject({ id: 'w1', kind: 'text', x: 3, y: 10, w: 24 })
    expect(out[0].data.doc).toEqual({ type: 'doc', content: [
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Week 1' }] },
      { type: 'bulletList', content: ['Ch 1', 'Ch 2'].map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })) },
    ] })
  })

  it('an empty unnamed box says Pages and has no list; other blocks pass through', () => {
    const text = block({ id: 't' })
    const out = boxesAsText([text, block({ id: 'x', kind: 'box', data: { doc: null } })], [])
    expect(out[0]).toBe(text)
    expect(out[1].data.doc).toEqual({ type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Pages' }] }] })
  })
})
```

Run: `npx vitest run src/sheets/box.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implement `src/sheets/box.ts`**

```ts
import type { SheetBlock } from './types'

type Kid = { id: string; title: string; box?: string; rank?: number }

/**
 * Boxes as plain text blocks (title, then the page titles as a list), for printing and sharing: those
 * only know text blocks, and a share doesn't carry the sub-pages themselves.
 */
export function boxesAsText(blocks: SheetBlock[], kids: Kid[]): SheetBlock[] {
  return blocks.map((b) => {
    if (b.kind !== 'box') return b
    const titles = kids.filter((k) => k.box === b.id)
      .sort((x, y) => (x.rank ?? Infinity) - (y.rank ?? Infinity) || x.title.localeCompare(y.title, undefined, { numeric: true }))
      .map((k) => k.title)
    const text = (t: string) => [{ type: 'text', text: t }]
    const content: object[] = [{ type: 'heading', attrs: { level: 3 }, content: text(b.data.label || 'Pages') }]
    if (titles.length) content.push({ type: 'bulletList', content: titles.map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: text(t) }] })) })
    return { ...b, kind: 'text', data: { doc: { type: 'doc', content } } }
  })
}
```

Run the test. Expected: PASS.

- [ ] **Step 3: Use it for print and share**

In `src/features/sheet/SheetPage.tsx`, load the sub-pages with a live query:
`const kids = useLiveQuery(() => kidsOf(id), [id]) ?? []`. Use whatever variable already holds the sheet id, and import `kidsOf` from `../../data/subpages` and `boxesAsText` from `../../sheets/box`. Then:
- `PrintView`: pass `blocks={boxesAsText(blocks, kids)}`.
- `pagePayload(sheet, boxesAsText(blocks, kids), strokes, …)`.

Ink anchored to a box keeps its `blockId`, and the converted block keeps the same id, so it prints and shares with it.

- [ ] **Step 4: Read view**

In `src/features/sheet/ReadView.tsx`, render boxes in reading order with the text blocks:
- Replace `readingOrder(blocks.filter((b) => b.kind === 'text'))` with `readingOrder(blocks.filter((b) => b.kind !== 'bookmark'))`.
- In the map, render a `b.kind === 'box'` block as `<BoxRead key={b.id} block={b} />`:

```tsx
function BoxRead({ block }: { block: SheetBlock }) {
  const kids = useLiveQuery(async () => (await kidsOf(block.sheetId)).filter((s) => s.box === block.id), [block.sheetId, block.id]) ?? []
  return (
    <section className="rblock rbox">
      <h3>{block.data.label || 'Pages'}</h3>
      <ul>{kids.map((k) => <li key={k.id}><Link to={`/write/${k.id}`} data-page-kind="sheet" data-page-id={k.id} data-page-title={k.title}>{k.title}</Link></li>)}</ul>
    </section>
  )
}
```

Check `readingOrder`'s signature in `src/sheets/order.ts`. If it only accepts text blocks, it still only reads x and y, so passing boxes is fine. Add to `sheet.css`:
`.rbox h3 { font: 600 12.5px var(--sans); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 18px 0 6px; } .rbox ul { margin: 0; padding-left: 20px; } .rbox a { color: var(--accent); }`.

- [ ] **Step 5: Typecheck, tests, try it, commit**

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: PASS

In the browser:
1. Ctrl+P on a page with a box: it should show the title and the list.
2. Make a share link, open it signed out, and check that the box shows as text.
3. With a phone-size viewport, check that Read view shows the box as links that open the sub-pages.

```bash
git add src/sheets/box.ts src/sheets/box.test.ts src/features/sheet/SheetPage.tsx src/features/sheet/ReadView.tsx src/styles/sheet.css
git commit -m "Boxes print and share as their title and page list; Read view lists a box's pages as links"
```

---

### Task 7: The sidebar tree

**Files:**
- Modify: `src/app/Shell.tsx` (`FolderTree`, `PageMenu`)
- Modify: `src/styles/components.css`

**Interfaces:**
- Consumes: `topLevel`, `PAGE_DRAG` (Task 2); `ensureBox`, `createSubPage`, `moveIntoBox`, `moveOutALevel` (Task 3); `ancestors`, `parentsOf` (Task 1)
- Produces: no new exports. Sidebar rows carry `data-page-parent` and `data-page-box` when they're sub-pages.

- [ ] **Step 1: Load the boxes of pages that have sub-pages**

In `FolderTree`'s `useLiveQuery`, add:

```ts
const sheetsNow = await listSheets()
const parents = [...new Set(sheetsNow.map((s) => s.parentId).filter((x): x is string => !!x))]
const boxes = parents.length ? (await db.sheetBlocks.where('sheetId').anyOf(parents).toArray()).filter((b) => b.kind === 'box') : []
return { ...(await listLibrary()), notes: await listNotes(), sheets: sheetsNow, boxes, archived: await listArchive(), trashed: t.decks.length + t.notes.length + t.sheets.length }
```

Import `db` from `../data/db`.

- [ ] **Step 2: Keep the open page's ancestors expanded**

After `forced` is built:

```ts
const parentMap = parentsOf(data.sheets)
if (activePage?.kind === 'sheet') for (const a of ancestors(activePage.id, parentMap)) forced.add(a)
```

`isOpen` and `toggle` already use `openFolders`, and page ids go in the same list.

- [ ] **Step 3: Render sub-pages under their page**

Replace `PageLink` with a version that nests:

```tsx
const kidsOfPage = (id: string) => pages.filter((x) => x.kind === 'sheet' && x.parentId === id)
const boxesOfPage = (id: string) => data.boxes.filter((b) => b.sheetId === id).sort((a, b) => a.y - b.y || a.x - b.x)
const rankSort = (a: Page, b: Page) => ((a.kind === 'sheet' ? a.sheet.rank : 0) ?? Infinity) - ((b.kind === 'sheet' ? b.sheet.rank : 0) ?? Infinity) || a.title.localeCompare(b.title, undefined, { numeric: true })

const PageLink = ({ p, pad }: { p: Page; pad: number }) => {
  const kids = p.kind === 'sheet' ? kidsOfPage(p.id) : []
  const open = kids.length > 0 && isOpen(p.id)
  const link = (
    <Link to={pageUrl(p)} className={`tdeck ${isActive(p) ? 'active' : ''}`} style={{ paddingLeft: kids.length ? 0 : pad }} title={p.kind === 'note' ? `Notes: ${p.title}` : p.title}
      data-page-kind={p.kind} data-page-id={p.id} data-page-title={p.title}
      data-page-folder={p.folderId ?? ''} data-page-unit={p.unit ?? ''}
      {...(p.kind === 'sheet' && p.parentId ? { 'data-page-parent': p.parentId, 'data-page-box': p.sheet.box ?? '' } : {})}
      draggable onDragStart={(e) => { e.dataTransfer.setData(PAGE_DRAG, JSON.stringify({ kind: p.kind, id: p.id })); e.dataTransfer.effectAllowed = 'move' }}
      {...dropOnPage(p)}>
      <Icon name={pageIcon(p.kind)} size={13} /><span className="t">{p.title}</span>
    </Link>
  )
  if (!kids.length) return link
  const boxes = boxesOfPage(p.id)
  const known = new Set(boxes.map((b) => b.id))
  const groups = [
    ...boxes.map((b) => ({ box: b as typeof b | null, list: kids.filter((k) => k.kind === 'sheet' && k.sheet.box === b.id).sort(rankSort) })),
    { box: null, list: kids.filter((k) => k.kind === 'sheet' && !(k.sheet.box && known.has(k.sheet.box))).sort(rankSort) },
  ].filter((g) => g.list.length)
  return (
    <div className="tsub">
      <div className="tsubrow" style={{ paddingLeft: pad - 18 }}>
        <button className={`twist ${open ? 'open' : ''}`} onClick={() => toggle(p.id)} aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open}><Icon name="down2" size={13} /></button>
        {link}
      </div>
      <Collapse open={open}>
        <>{groups.map((g) => (
          <div key={g.box?.id ?? '-'}>
            {g.box?.data.label && <div className="tunit" style={{ paddingLeft: pad + 16 }} {...dropIntoBox(p.id, g.box.id)}>{g.box.data.label}</div>}
            {g.list.map((k) => <PageLink key={k.id} p={k} pad={pad + 14} />)}
          </div>
        ))}</>
      </Collapse>
    </div>
  )
}
```

Define `PageLink` as a plain function called as a component (as now). Its recursion goes through JSX, which is fine.

- [ ] **Step 4: Drops**

Add `dropIntoBox`:

```ts
const dropIntoBox = (parentId: string, boxId: string) => ({
  onDragOver: (e: React.DragEvent) => { if (allowDrop(e)) (e.currentTarget as HTMLElement).classList.add('drop-over') },
  onDragLeave: (e: React.DragEvent) => clear(e.currentTarget as HTMLElement),
  onDrop: async (e: React.DragEvent) => {
    clear(e.currentTarget as HTMLElement)
    const page = dragged(e)
    if (!page) return
    e.preventDefault()
    if (page.kind !== 'sheet') { toast('Only pages you write can go under a page'); return }
    if (!await moveIntoBox(page.id, parentId, boxId)) toast("Can't put a page inside its own sub-page")
  },
})
```

Rework `dropOnPage(target)`:
- **`onDragOver`:** if the dragged item is a sheet and the target is a sheet, split the row into thirds: top third is `drop-before`, bottom third is `drop-after`, middle is `drop-over` ("put inside"). Otherwise keep halves as now. `dataTransfer.getData` isn't readable during dragover, so to know the kind, `onDragStart` also calls `e.dataTransfer.setData(`${PAGE_DRAG}-${p.kind}`, '')`; the over handler checks `e.dataTransfer.types.includes(`${PAGE_DRAG}-sheet`)`. Note that `types` entries are lowercased. `PAGE_DRAG` is already lowercase.
- **`onDrop`:**
  - **Into the target (`drop-over`):** `moveIntoBox(page.id, target.id, await ensureBox(target.id))`, then toast `Moved into "${target.title}"`, or the refusal toast if it returns false.
  - **Before or after a sub-page target:** reorder within its box. Take `siblings = kidsOfPage(target.parentId).filter((k) => k.sheet.box === target.sheet.box && k.id !== page.id).sort(rankSort)`, splice `page` in at the target's index (+1 if after), and call `moveIntoBox(page.id, target.parentId, target.sheet.box ?? await ensureBox(target.parentId), order.map((x) => x.id))`. If `page` isn't a sheet, toast "Only pages you write can go under a page".
  - **Before or after a top-level target:** the existing `settle` path, unchanged. `placePage` now clears `parentId` and `box`.

The folder rows' and Folders header's `drop` already go through `placePage`, so dropping a sub-page on a folder makes it top-level there.

- [ ] **Step 5: Right-click a page**

In `PageMenu`, for `kind === 'sheet'`:
- Add `{ label: 'New sub-page', icon: 'plus', onSelect: async () => nav(`/write/${await createSubPage(id, await ensureBox(id), useSettings.getState().paperDefault ?? undefined)}`) }` after "Open in a new tab".
- If `el.dataset.pageParent`, change "New page here" to make a sibling: `createSubPage(el.dataset.pageParent, el.dataset.pageBox || await ensureBox(el.dataset.pageParent))`, then navigate. Also add `{ label: 'Move out a level', icon: 'upload', onSelect: async () => { await moveOutALevel(id); toast('Moved out a level') } }`.

Box cards carry the same `data-page-parent` and `data-page-box` attributes (Task 5), so they get the same menu.

- [ ] **Step 6: Styles in `src/styles/components.css`**

```css
.tsubrow { display: flex; align-items: center; gap: 0; }
.tsubrow .twist { width: 18px; height: 20px; }
.tsubrow .tdeck { flex: 1; min-width: 0; }
.tree .tdeck.drop-over { background: color-mix(in oklab, var(--accent) 16%, transparent); }
```

Check that the existing `drop-before` and `drop-after` styles apply to `.tdeck`. They do now, through the class toggles.

- [ ] **Step 7: Typecheck, tests, try it, commit**

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: PASS

In the browser, build the CPS721 › Week 1 › Ch 1–2 / Week 2 › Ch 3 › Practice set tree, then check:
1. Expanding and collapsing works.
2. The open page's path stays open.
3. Dragging a page onto a page nests it.
4. Dragging onto a box heading puts it in that box.
5. Dragging between sub-pages reorders them.
6. Dragging a sub-page onto a folder makes it top-level.
7. Dragging a page onto its own sub-page is refused with a toast.
8. Dragging a deck onto a page is refused.
9. "New sub-page" and "Move out a level" work.

```bash
git add src/app/Shell.tsx src/styles/components.css
git commit -m "Sidebar tree for sub-pages: grouped by box with box headings, expand and collapse, drop onto a page to nest, onto a box heading, reorder within a box, new sub-page and move out a level"
```

---

### Task 8: QC pass, docs, push

**Files:**
- Modify: `docs/HANDOFF.md`, `docs/ROADMAP.md`
- Modify: `src/features/site/docs/pages.md` (or the docs topic that covers Pages; `ls src/features/site/docs` to find it)

- [ ] **Step 1: Full check**

Run: `npx tsc --noEmit -p . && npx vitest run && npx vite build`
Expected: PASS and the build succeeds.

- [ ] **Step 2: Browser QC (Playwright or the in-app browser, about 1100×680, then 390×844)**

Go through the Review Focus list at the top, plus:
- **Sync:** create a sub-page while signed out, then check after a reload that it's still there.
- **Library:** the folder view lists only top-level pages, and its count includes sub-pages. Search for a sub-page's title and check that its path shows.
- **Delete with sub-pages:** do both choices, then Undo. Check Recently deleted shows "and 2 sub-pages", and that Restore brings the whole tree back.
- **Archive with sub-pages:** do both choices, then Restore.
- **Phones:** Read view lists a box's pages, and the sidebar drawer shows the tree.
- **Themes:** the box looks right in light, dark and Sand.

Fix anything that fails, with a commit per fix, and note what still needs a real device in the final report. Write no checklist file.

- [ ] **Step 3: Docs**

- **Docs topic for Pages:** add a short section in plain words.
  - Put pages inside a page with a box ("Box of pages", or B in Insert).
  - Drag pages into boxes or onto a page in the sidebar.
  - Right-click for "New sub-page" and "Move out a level".
  - Deleting or archiving asks about sub-pages.
- **`HANDOFF.md`:** add "Sub-pages (phase 1)" under Where we are. Name `src/sheets/tree.ts`, `src/data/subpages.ts`, `BoxBlock.tsx` and `src/sheets/box.ts` in the code map, and add the decisions: folder resolved through the top page, boxes read live, and shares and print turn boxes into text.
- **`ROADMAP.md`:** mark phase 1 of 4a done, with the date.

- [ ] **Step 4: Commit, push, check the deploy**

```bash
git add docs src/features/site/docs
git commit -m "Docs and handoff for sub-pages phase 1"
git push
gh api repos/shreywy/Mneme/commits/$(git rev-parse HEAD)/check-runs --jq '.check_runs[] | "\(.name) \(.status) \(.conclusion)"'
```

Expected: the "Cloudflare Pages" check run ends in `success`. Push only when the app works (Shrey's rule).
