# Text notes, phase 1 (canvas and text) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user can create a Page, write on an infinite, grid-aligned canvas in text blocks with markdown shortcuts, move and resize blocks on the grid, select several blocks and move or delete them together, change the paper, and have it all sync; phones get Read view with in-place editing.

**Architecture:** A new `sheets` data module (Dexie tables `sheets` and `sheetBlocks`, synced through the existing engine to two new Supabase tables with owner-only RLS and the storage-count trigger). Pure grid maths (`src/sheets/grid.ts`), block history (`history.ts`) and reading order (`order.ts`) are unit-tested; the canvas UI (`src/features/sheet/`) is lazy-loaded so TipTap stays out of the main bundle. Pages join decks and notes in the shared `Page` union so the library, sidebar, drag-and-drop and context menu work unchanged.

**Tech Stack:** React 19, TypeScript, Dexie 4, Supabase, Vitest, TipTap 3 (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extensions`, `@tiptap/extension-list`).

**Spec:** `docs/superpowers/specs/2026-10-01-text-notes-design.md`

## Global Constraints

- User-facing name: **Page** (sidebar and cards say "Page"); route `/write/:sheetId`; internal name `sheet`.
- World units are grid units; one unit = the line spacing. Spacings: Compact 24, College 28 (default), Wide 32.
- (0, 0) is the start. A new page's main text block sits at (3, 2), 24 units wide.
- Zoom range 25%–400%.
- Ink is not part of this phase. Only blocks snap to the grid.
- Pageless only in this phase (Pages layout and print come in phase 4).
- Phones (< 768 px wide) open in Read view by default, with tap-to-edit and an Edit button; desktop opens the canvas.
- Copy rules: plain, specific, no AI-sounding phrasing (see memory `no-ai-sounding-copy`).
- Every new Supabase table: owner-only RLS (forced), anon revoked, storage-count trigger, realtime, RLS tests in `supabase/tests/rls.sql`.
- Never commit `.env.local` or `fixtures/private/`. No AI attribution in commits.
- Push to `main` only when tests, build and a browser check pass.

## Review Focus

1. A page whose blocks sit at negative coordinates (left of or above the start): minimap, Back to start and Read view must still show them. → test in Task 4 (`boundsOf` with negatives) and Task 6 (`readingOrder` with negatives).
2. Two devices edit the same page: each block syncs as its own row, so edits to different blocks both survive. → test in Task 2 (two blocks pushed and pulled independently).
3. Deleting a page must delete its blocks locally and on the server (tombstones), or the 20 MB count never goes down. → test in Task 1 (`deleteSheet` removes blocks) and Task 2 (tombstones pushed).
4. Zooming with Ctrl+wheel keeps the point under the cursor still. → test in Task 4 (`zoomAt`).
5. An emptied text block that isn't the main block disappears when you leave it; the main block never does. → test in Task 1 (`pruneEmpty`).
6. A selection box dragged right-to-left or bottom-to-top selects the same blocks as left-to-right, and one undo brings back every block a group delete removed. → tests in Task 4 (`blocksInRect`) and Task 5 (`batch`).

---

## File map

| File | Responsibility |
|---|---|
| `src/sheets/types.ts` | `Paper`, `SheetRow`, `SheetBlock`, defaults |
| `src/sheets/grid.ts` | View maths, snapping, zoom, bounds, paper CSS |
| `src/sheets/history.ts` | Undo/redo stack for block add/remove/update |
| `src/sheets/order.ts` | Reading order and title-from-content |
| `src/data/db.ts` | Dexie v5 tables |
| `src/data/sheets.ts` | CRUD for sheets and blocks |
| `src/sync/engine.ts` | Two new `SPECS` entries |
| `supabase/migrations/20261007000000_sheets.sql` | Tables, RLS, storage trigger, realtime |
| `src/data/pages.ts`, `src/data/arrange.ts`, `src/data/repo.ts` | Third page kind |
| `src/app/Shell.tsx`, `src/features/library/LibraryPage.tsx`, `src/app/App.tsx` | Sidebar, cards, archive, routes, New page |
| `src/features/sheet/SheetPage.tsx` | Route component: top bar, menu, Read/Canvas switch |
| `src/features/sheet/Canvas.tsx` | Pan, zoom, blocks layer, click-to-type, minimap |
| `src/features/sheet/TextBlock.tsx` | TipTap editor for one block |
| `src/features/sheet/PaperSettings.tsx` | Paper controls inside Page settings |
| `src/features/sheet/ReadView.tsx` | Phone reading view |
| `src/styles/sheet.css` | Canvas, block chrome, read view |

---

### Task 1: Types, Dexie tables and the sheets data module

**Files:**
- Create: `src/sheets/types.ts`, `src/data/sheets.ts`, `src/data/sheets.test.ts`
- Modify: `src/data/db.ts`

**Interfaces:**
- Produces:
  - `type Paper = { lines: 'none' | 'ruled' | 'dots' | 'squares'; spacing: 24 | 28 | 32; strength: number; color: string | null; margin: boolean; paperColor: string | null }`
  - `DEFAULT_PAPER: Paper`
  - `type SheetRow = { id; folderId: string | null; title; titleAuto: boolean; unit?; rank?; paper: Paper; createdAt; updatedAt; lastOpenedAt?; archived?; archivedAt? }`
  - `type SheetBlock = { id; sheetId; x; y; w; h; kind: 'text'; role?: 'main'; data: { doc: unknown }; z; createdAt; updatedAt }`
  - `createSheet(opts?: { folderId?: string | null; paper?: Paper }): Promise<string>`
  - `getSheet(id)`, `listSheets(): Promise<SheetRow[]>`, `updateSheet(id, patch)`, `setSheetArchived(id, archived)`, `deleteSheet(id)`
  - `blocksFor(sheetId): Promise<SheetBlock[]>`, `addBlock(b: Omit<SheetBlock, 'id' | 'createdAt' | 'updatedAt'>): Promise<SheetBlock>`, `putBlock(b: SheetBlock)`, `updateBlock(id, patch)`, `deleteBlock(id)`
  - `isEmptyDoc(doc: unknown): boolean`, `pruneEmpty(block: SheetBlock): Promise<boolean>`

- [ ] **Step 1: Write the failing test** — `src/data/sheets.test.ts`

```ts
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import * as sheets from './sheets'
import { DEFAULT_PAPER } from '../sheets/types'

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

const para = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] })

describe('sheets', () => {
  it('a new page starts with one main text block at (3, 2), 24 wide, and default paper', async () => {
    const id = await sheets.createSheet({ folderId: null })
    const s = await sheets.getSheet(id)
    expect(s).toMatchObject({ title: 'Untitled page', titleAuto: true, paper: DEFAULT_PAPER, folderId: null })
    const blocks = await sheets.blocksFor(id)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ x: 3, y: 2, w: 24, h: 1, kind: 'text', role: 'main' })
  })

  it('deleting a page deletes its blocks', async () => {
    const id = await sheets.createSheet()
    await sheets.addBlock({ sheetId: id, x: 30, y: 2, w: 10, h: 1, kind: 'text', data: { doc: para('side') }, z: 0 })
    await sheets.deleteSheet(id)
    expect(await sheets.getSheet(id)).toBeUndefined()
    expect(await db.sheetBlocks.where('sheetId').equals(id).count()).toBe(0)
  })

  it('archived pages and pages in archived folders are not listed', async () => {
    const a = await sheets.createSheet()
    const b = await sheets.createSheet()
    await sheets.setSheetArchived(b, true)
    expect((await sheets.listSheets()).map((s) => s.id)).toEqual([a])
  })

  it('an emptied side block is removed, the main block never is', async () => {
    const id = await sheets.createSheet()
    const [main] = await sheets.blocksFor(id)
    const side = await sheets.addBlock({ sheetId: id, x: 30, y: 2, w: 10, h: 1, kind: 'text', data: { doc: para('') }, z: 0 })
    expect(await sheets.pruneEmpty(side)).toBe(true)
    expect(await sheets.pruneEmpty(main)).toBe(false)
    expect((await sheets.blocksFor(id)).map((b) => b.id)).toEqual([main.id])
  })

  it('knows an empty document from one with text, headings or list items', () => {
    expect(sheets.isEmptyDoc(para(''))).toBe(true)
    expect(sheets.isEmptyDoc({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }] })).toBe(true)
    expect(sheets.isEmptyDoc(para('x'))).toBe(false)
    expect(sheets.isEmptyDoc({ type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }] })).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/data/sheets.test.ts`
Expected: FAIL, cannot resolve `./sheets` / `../sheets/types`.

- [ ] **Step 3: Implement** — `src/sheets/types.ts`

```ts
/** How a page's paper looks. Lines are drawn every `spacing` px, which is also the text line height. */
export type Paper = {
  lines: 'none' | 'ruled' | 'dots' | 'squares'
  spacing: 24 | 28 | 32
  /** 0 (faint) to 1 (strong). */
  strength: number
  /** null: the theme's ink colour. */
  color: string | null
  /** A red margin line left of the main column, like notebook paper. */
  margin: boolean
  /** null: follow the theme. */
  paperColor: string | null
}
export const DEFAULT_PAPER: Paper = { lines: 'ruled', spacing: 28, strength: 0.4, color: null, margin: false, paperColor: null }

export type SheetRow = {
  id: string
  folderId: string | null
  title: string
  /** True until the user names the page: the title follows the first heading. */
  titleAuto: boolean
  unit?: string
  rank?: number
  paper: Paper
  createdAt: number
  updatedAt: number
  lastOpenedAt?: number
  archived?: boolean
  archivedAt?: number
}

/** A block on the canvas. x, y, w, h are grid units (h is whole lines). */
export type SheetBlock = {
  id: string
  sheetId: string
  x: number
  y: number
  w: number
  h: number
  kind: 'text'
  /** The page's main column: never removed when emptied. */
  role?: 'main'
  data: { doc: unknown }
  z: number
  createdAt: number
  updatedAt: number
}

export const MAIN_BLOCK = { x: 3, y: 2, w: 24, h: 1 } as const
```

Modify `src/data/db.ts`: import the types, add the tables and version 5.

```ts
import type { SheetBlock, SheetRow } from '../sheets/types'
// in the class:
  sheets!: Table<SheetRow, string>
  sheetBlocks!: Table<SheetBlock, string>
// in the constructor, after version(4):
    // v5: the user's own pages (Text notes) and their blocks.
    this.version(5).stores({
      sheets: 'id, folderId, updatedAt',
      sheetBlocks: 'id, sheetId',
    })
```

Create `src/data/sheets.ts`:

```ts
import { db } from './db'
import { hiddenFolderIds } from './repo'
import { DEFAULT_PAPER, MAIN_BLOCK, type Paper, type SheetBlock, type SheetRow } from '../sheets/types'

const uid = () => crypto.randomUUID()
const EMPTY_DOC = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }] }

export async function createSheet(opts: { folderId?: string | null; paper?: Paper } = {}): Promise<string> {
  const now = Date.now()
  const id = uid()
  await db.transaction('rw', db.sheets, db.sheetBlocks, async () => {
    await db.sheets.add({ id, folderId: opts.folderId ?? null, title: 'Untitled page', titleAuto: true, paper: opts.paper ?? DEFAULT_PAPER, createdAt: now, updatedAt: now, lastOpenedAt: now })
    await db.sheetBlocks.add({ id: uid(), sheetId: id, ...MAIN_BLOCK, kind: 'text', role: 'main', data: { doc: EMPTY_DOC }, z: 0, createdAt: now, updatedAt: now })
  })
  return id
}

export const getSheet = (id: string) => db.sheets.get(id)

export async function listSheets(): Promise<SheetRow[]> {
  const [folders, all] = await Promise.all([db.folders.toArray(), db.sheets.toArray()])
  const hidden = hiddenFolderIds(folders)
  return all.filter((s) => !s.archived && !(s.folderId && hidden.has(s.folderId)))
}

export async function updateSheet(id: string, patch: Partial<Omit<SheetRow, 'id' | 'createdAt'>>) {
  await db.sheets.update(id, { ...patch, updatedAt: Date.now() })
}

export async function setSheetArchived(id: string, archived: boolean) {
  await db.sheets.update(id, archived ? { archived: true, archivedAt: Date.now() } : { archived: false })
}

export async function deleteSheet(id: string) {
  await db.transaction('rw', db.sheets, db.sheetBlocks, async () => {
    // toCollection().delete() goes through the sync hooks, so the server gets tombstones.
    await db.sheetBlocks.where('sheetId').equals(id).delete()
    await db.sheets.delete(id)
  })
}

export const blocksFor = (sheetId: string) => db.sheetBlocks.where('sheetId').equals(sheetId).toArray()

export async function addBlock(b: Omit<SheetBlock, 'id' | 'createdAt' | 'updatedAt'>): Promise<SheetBlock> {
  const now = Date.now()
  const row: SheetBlock = { ...b, id: uid(), createdAt: now, updatedAt: now }
  await db.sheetBlocks.add(row)
  return row
}
export const putBlock = (b: SheetBlock) => db.sheetBlocks.put(b)
export async function updateBlock(id: string, patch: Partial<Omit<SheetBlock, 'id' | 'sheetId' | 'createdAt'>>) {
  await db.sheetBlocks.update(id, { ...patch, updatedAt: Date.now() })
}
export const deleteBlock = (id: string) => db.sheetBlocks.delete(id)

type Node = { type?: string; text?: string; content?: Node[] }
/** True when a TipTap document has no text and no structure beyond empty paragraphs and headings. */
export function isEmptyDoc(doc: unknown): boolean {
  const walk = (n: Node): boolean => {
    if (n.text) return false
    if (n.type && !['doc', 'paragraph', 'heading'].includes(n.type)) return false
    return (n.content ?? []).every(walk)
  }
  return walk((doc ?? {}) as Node)
}

/** Removes a block left empty, unless it's the main column. Returns whether it was removed. */
export async function pruneEmpty(b: SheetBlock): Promise<boolean> {
  if (b.role === 'main' || !isEmptyDoc(b.data.doc)) return false
  await deleteBlock(b.id)
  return true
}
```

Check that `hiddenFolderIds` is exported from `src/data/repo.ts` (it is used by `listNotes` in `src/data/notes.ts`; import it from the same place `notes.ts` does).

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/data/sheets.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/sheets/types.ts src/data/db.ts src/data/sheets.ts src/data/sheets.test.ts
git commit -m "Pages: types, Dexie tables and data module"
```

---

### Task 2: Sync — engine specs, Supabase tables, RLS tests

**Files:**
- Modify: `src/sync/engine.ts` (SPECS), `src/sync/engine.test.ts`, `supabase/tests/rls.sql`
- Create: `supabase/migrations/20261007000000_sheets.sql`

**Interfaces:**
- Consumes: `db.sheets`, `db.sheetBlocks` (Task 1)
- Produces: remote tables `sheets`, `sheet_blocks` (columns `user_id, id, doc, deleted, updated_at`, generated `sheet_id` on `sheet_blocks`)

- [ ] **Step 1: Write the failing engine test** — append to `src/sync/engine.test.ts` inside `describe('sync engine')`:

```ts
  it('syncs pages and each of their blocks as separate rows', async () => {
    const f = fakeRemote()
    const id = await sheets.createSheet()
    const side = await sheets.addBlock({ sheetId: id, x: 30, y: 2, w: 10, h: 1, kind: 'text', data: { doc: { type: 'doc' } }, z: 0 })
    await push(f.remote)
    expect(f.t('sheets').get(id)?.doc).toMatchObject({ title: 'Untitled page' })
    expect(f.t('sheet_blocks').size).toBe(2)
    // Another device moves the side block; ours edits the main block. Both survive.
    f.write('sheet_blocks', side.id, { ...side, x: 40 })
    const [main] = (await sheets.blocksFor(id)).filter((b) => b.role === 'main')
    await sheets.updateBlock(main.id, { h: 3 })
    await pull(f.remote)
    await push(f.remote)
    const local = await sheets.blocksFor(id)
    expect(local.find((b) => b.id === side.id)?.x).toBe(40)
    expect((f.t('sheet_blocks').get(main.id)?.doc as { h: number }).h).toBe(3)
    await sheets.deleteSheet(id)
    await push(f.remote)
    expect(f.t('sheets').get(id)?.deleted).toBe(true)
    expect([...f.t('sheet_blocks').values()].every((r) => r.deleted)).toBe(true)
  })
```

Add `import * as sheets from '../data/sheets'` at the top.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/sync/engine.test.ts`
Expected: FAIL, `f.t('sheets').get(id)` is undefined (no spec yet).

- [ ] **Step 3: Implement** — add to `SPECS` in `src/sync/engine.ts`:

```ts
  { remote: 'sheets', table: () => db.sheets, idOf: (r) => String(r.id), localKey: byKey(() => db.sheets) },
  { remote: 'sheet_blocks', table: () => db.sheetBlocks, idOf: (r) => String(r.id), localKey: byKey(() => db.sheetBlocks) },
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/sync/engine.test.ts`
Expected: all pass.

- [ ] **Step 5: Write the migration** — `supabase/migrations/20261007000000_sheets.sql`

```sql
-- The user's own pages (Text notes): one row per page and one per block, same shape as every synced table.
do $$
declare t text;
begin
  foreach t in array array['sheets', 'sheet_blocks'] loop
    execute format($f$
      create table if not exists public.%1$I (
        user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
        id text not null check (char_length(id) between 1 and 300),
        doc jsonb not null default '{}'::jsonb check (pg_column_size(doc) < 262144),
        deleted boolean not null default false,
        updated_at timestamptz not null default clock_timestamp(),
        primary key (user_id, id)
      )$f$, t);
    execute format('create index if not exists %1$I on public.%2$I (user_id, updated_at)', t || '_user_updated_idx', t);
    execute format('drop trigger if exists touch_updated_at on public.%1$I', t);
    execute format('create trigger touch_updated_at before insert or update on public.%1$I for each row execute function public.touch_updated_at()', t);
    execute format('alter table public.%1$I enable row level security', t);
    execute format('alter table public.%1$I force row level security', t);
    execute format('drop policy if exists "owner can do anything with own rows" on public.%1$I', t);
    execute format($f$create policy "owner can do anything with own rows" on public.%1$I for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$f$, t);
    execute format('revoke all on public.%1$I from anon', t);
    execute format('grant select, insert, update, delete on public.%1$I to authenticated', t);
    execute format('drop trigger if exists count_storage on public.%1$I', t);
    execute format('create trigger count_storage after insert or update or delete on public.%1$I for each row execute function public.count_sync_storage()', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

alter table public.sheets add column if not exists title text generated always as (doc ->> 'title') stored;
alter table public.sheet_blocks add column if not exists sheet_id text generated always as (doc ->> 'sheetId') stored;
create index if not exists sheet_blocks_sheet_idx on public.sheet_blocks (user_id, sheet_id);
```

- [ ] **Step 6: Add RLS tests** — in `supabase/tests/rls.sql`, after B's first inserts (`insert into public.note_marks ...`) add:

```sql
insert into public.sheets (id, doc) values ('sheet-b', '{"title":"B page"}');
insert into public.sheet_blocks (id, doc) values ('block-b', '{"sheetId":"sheet-b","kind":"text"}');
```

and inside A's first `do $$` block (after the note_marks checks):

```sql
  select count(*) into n from public.sheets;
  if n <> 0 then raise exception 'FAIL: A can read B''s pages'; end if;
  select count(*) into n from public.sheet_blocks;
  if n <> 0 then raise exception 'FAIL: A can read B''s page blocks'; end if;
  update public.sheet_blocks set doc = '{"kind":"pwned"}' where id = 'block-b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A changed B''s page block'; end if;
```

- [ ] **Step 7: Apply and run the database tests** (needs Shrey's OK to push the migration, as before)

Run: `npx supabase db push` then `npm run test:db`
Expected: `RLS tests passed`.

- [ ] **Step 8: Commit**

```bash
git add src/sync/engine.ts src/sync/engine.test.ts supabase/migrations/20261007000000_sheets.sql supabase/tests/rls.sql
git commit -m "Pages: sync through the engine; Supabase tables with RLS, storage count and tests"
```

---

### Task 3: Pages join the library, sidebar, drag and drop, archive

**Files:**
- Modify: `src/data/pages.ts`, `src/data/pages.test.ts`, `src/data/arrange.ts`, `src/data/arrange.test.ts`, `src/data/repo.ts` (`listArchive`), `src/app/Shell.tsx`, `src/features/library/LibraryPage.tsx`, `src/ui/Icons.tsx`

**Interfaces:**
- Consumes: `listSheets`, `deleteSheet`, `setSheetArchived`, `createSheet` (Task 1)
- Produces:
  - `Page` gains `| { kind: 'sheet'; id; title; unit?; folderId; sheet: SheetRow }`
  - `pagesOf(decks, notes, sheets?: SheetRow[])`
  - `pageUrl` returns `/write/:id` for sheets
  - `placePage` accepts `kind: 'sheet'`
  - `listArchive()` returns `sheets: SheetRow[]` too
  - Icon `page` (a sheet with a pen)

- [ ] **Step 1: Failing tests** — add to `src/data/pages.test.ts`:

```ts
import type { SheetRow } from '../sheets/types'
import { DEFAULT_PAPER } from '../sheets/types'
const sheet = (id: string, title: string, unit?: string): SheetRow => ({ id, title, unit, folderId: 'f', titleAuto: false, paper: DEFAULT_PAPER, createdAt: 1, updatedAt: 1 })

  it('pages of your own get /write links and sort with the rest', () => {
    const ps = pagesOf([deck('d', 'B')], [note('n', 'C')], [sheet('s', 'A', 'Week 1')])
    expect(ps.map((p) => `${p.kind}:${pageUrl(p)}`)).toContain('sheet:/write/s')
    expect(groupByUnit(ps)[0]).toMatchObject({ unit: 'Week 1' })
  })
```

and to `src/data/arrange.test.ts`:

```ts
import * as sheets from './sheets'
  it('places one of your own pages like any other page', async () => {
    const f = await repo.createFolder('Physics')
    const s = await sheets.createSheet()
    const a = await deck('A')
    await placePage({ kind: 'sheet', id: s }, { folderId: f, unit: 'Week 2' }, [{ kind: 'sheet', id: s }, { kind: 'deck', id: a }])
    expect(await sheets.getSheet(s)).toMatchObject({ folderId: f, unit: 'Week 2', rank: 0 })
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/data/pages.test.ts src/data/arrange.test.ts`
Expected: FAIL (type errors surface as runtime failures: `pagesOf` ignores the third argument; `placePage` treats `sheet` as a note).

- [ ] **Step 3: Implement**

`src/data/pages.ts`:

```ts
import type { SheetRow } from '../sheets/types'
export type Page =
  | { kind: 'deck'; id: string; title: string; unit?: string; folderId: string | null; deck: DeckRow }
  | { kind: 'note'; id: string; title: string; unit?: string; folderId: string | null; note: NoteRow }
  | { kind: 'sheet'; id: string; title: string; unit?: string; folderId: string | null; sheet: SheetRow }
export type PageKind = Page['kind']

export function pagesOf(decks: DeckRow[], notes: NoteRow[], sheets: SheetRow[] = []): Page[] {
  return [
    ...decks.map((d): Page => ({ kind: 'deck', id: d.id, title: d.title, unit: d.unit, folderId: d.folderId, deck: d })),
    ...notes.map((n): Page => ({ kind: 'note', id: n.id, title: n.title, unit: n.unit, folderId: n.folderId, note: n })),
    ...sheets.map((s): Page => ({ kind: 'sheet', id: s.id, title: s.title, unit: s.unit, folderId: s.folderId, sheet: s })),
  ]
}
export const pageUrl = (p: Pick<Page, 'kind' | 'id'>) => (p.kind === 'deck' ? `/deck/${p.id}` : p.kind === 'note' ? `/notes/${p.id}` : `/write/${p.id}`)
export const pageTime = (p: Page) => (p.kind === 'deck' ? p.deck.lastStudiedAt ?? p.deck.updatedAt : p.kind === 'note' ? p.note.lastOpenedAt ?? p.note.updatedAt : p.sheet.lastOpenedAt ?? p.sheet.updatedAt)
const rankOf = (p: Page) => (p.kind === 'deck' ? p.deck.rank : p.kind === 'note' ? p.note.rank : p.sheet.rank)
export const pageIcon = (k: PageKind) => (k === 'deck' ? 'cards' : k === 'note' ? 'notes' : 'page')
```

`byHandThenTitle` tie-break stays (`note` first); sheets compare equal to decks there.

`src/data/arrange.ts`: `type Ref = { kind: 'deck' | 'note' | 'sheet'; id: string }`, add `db.sheets` to the transaction, and a third branch:

```ts
      } else if (r.kind === 'sheet') {
        const s = await db.sheets.get(r.id)
        if (!s) continue
        const { unit: _u, ...rest } = s
        await db.sheets.put(isPage ? { ...rest, folderId: to.folderId, ...(to.unit ? { unit: to.unit } : {}), rank } : { ...s, rank })
      } else {
```

`src/data/repo.ts` `listArchive`: also read `db.sheets` and return `sheets: sheets.filter((s) => s.archived).sort(by)`.

`src/ui/Icons.tsx`: add a symbol next to `i-notes`:

```tsx
      <symbol id="i-page" viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5" /><path d="M9 17l1-3 5-5 2 2-5 5z" /></symbol>
```

`src/app/Shell.tsx`:
- `FolderTree` data: add `sheets: await listSheets()`; `pagesOf(decks, notes, data.sheets)`; archived count adds `data.archived.sheets.length`.
- `dragged()` parses `kind: PageKind`.
- `PageLink`: `title={p.kind === 'note' ? \`Notes: ${p.title}\` : p.title}` unchanged; icon `pageIcon(p.kind)`.
- Nav: after Import add `<button onClick={newPage}><Icon name="page" /><span className="lbl">New page</span></button>` where `newPage = async () => { const folderId = loc.pathname.startsWith('/folder/') ? loc.pathname.split('/')[2] : null; nav(\`/write/${await createSheet({ folderId, paper: useSettings.getState().paperDefault ?? undefined })}\`) }` (`paperDefault` arrives in Task 8; until then pass no paper).
- `PageMenu`: `kind` is `PageKind`; `url = pageUrl({ kind, id })`; icon `pageIcon(kind)`; cheat sheet item only for deck and note; archive uses `setSheetArchived` for sheets with toast `Page archived`; delete confirm for sheets: `{ title: \`Delete "${title}"?\`, body: 'The page and everything on it are removed for good. Archiving keeps it instead.', confirm: 'Delete page', danger: true }`, then `deleteSheet(id)` and toast `Page deleted`.
- Empty tree text: `Imported decks and notes, and pages you write, show up here.`

`src/features/library/LibraryPage.tsx`:
- Load `sheetsRepo.listSheets()` alongside notes; `Lib` gains `sheets: SheetRow[]`; `pagesOf(lib.decks, lib.notes, lib.sheets)`; the empty check includes `data.sheets.length === 0`.
- `progressOf`: `p.kind === 'deck' ? … : p.kind === 'note' ? readPct(p.note) : 0`.
- `haystack` for sheets: `${p.title} ${p.unit ?? ''}` (block text search comes later).
- `recent`: include sheets with `lastOpenedAt`.
- List view: for sheets `what = 'Page'`, no meter (render `<span />` in its place), `%` cell empty.
- Grid view: `SheetCard`:

```tsx
function SheetCard({ s, folder, i = 0 }: { s: SheetRow; folder?: string; i?: number }) {
  return (
    <Link className="dcard scard" to={`/write/${s.id}`} style={{ '--i': i } as React.CSSProperties} data-page-kind="sheet" data-page-id={s.id} data-page-title={s.title}>
      <span className="kind"><Icon name="page" size={13} />Page{folder ? ` · ${folder}` : ''}</span>
      <b>{s.title}</b>
      <div className="sub">{s.unit ? `${s.unit} · ` : ''}edited {relTime(s.updatedAt)}</div>
    </Link>
  )
}
```

- Archive page: a `Pages` section like the Notes one, using `setSheetArchived(s.id, false)` (toast `Page restored`) and `deleteSheet` (confirm title `Delete "${s.title}" for good?`, body `The page and everything on it are removed. This can't be undone.`, confirm `Delete page`).

- [ ] **Step 4: Run tests, typecheck, see them pass**

Run: `npx vitest run src/data && npx tsc -b`
Expected: all pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/data src/app/Shell.tsx src/features/library/LibraryPage.tsx src/ui/Icons.tsx
git commit -m "Pages in the library, sidebar, drag and drop, context menu and archive; New page button"
```

---

### Task 4: Grid maths

**Files:**
- Create: `src/sheets/grid.ts`, `src/sheets/grid.test.ts`

**Interfaces:**
- Produces:
  - `type View = { x: number; y: number; zoom: number }` — `x, y`: world px at the screen's top-left.
  - `MIN_ZOOM = 0.25`, `MAX_ZOOM = 4`, `clampZoom(z)`
  - `toWorld(view, sx, sy): { x; y }`, `toScreen(view, wx, wy): { x; y }`
  - `cellAt(view, sx, sy, unit): { gx; gy }` (floor)
  - `snapUnits(px, unit): number` (round), `linesFor(px, unit): number` (ceil, min 1)
  - `zoomAt(view, sx, sy, factor): View`
  - `boundsOf(blocks: { x; y; w; h }[]): { x; y; w; h } | null` (grid units)
  - `baselineOf(unit): number` = `Math.round(unit * 0.75)`
  - `paperStyle(paper: Paper, view: View): React.CSSProperties`
  - `blocksInRect(blocks, a: { x; y }, b: { x; y }): string[]` — ids of blocks touching the box between two corners, in grid units, any corner order

- [ ] **Step 1: Failing tests** — `src/sheets/grid.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PAPER } from './types'
import { baselineOf, blocksInRect, boundsOf, cellAt, clampZoom, linesFor, paperStyle, snapUnits, toScreen, toWorld, zoomAt } from './grid'

const v = { x: -100, y: 50, zoom: 2 }

describe('grid', () => {
  it('converts between screen and world both ways', () => {
    const w = toWorld(v, 40, 60)
    expect(w).toEqual({ x: -80, y: 80 })
    expect(toScreen(v, w.x, w.y)).toEqual({ x: 40, y: 60 })
  })

  it('a click lands in the cell under it, including left of and above the start', () => {
    expect(cellAt({ x: 0, y: 0, zoom: 1 }, 30, 57, 28)).toEqual({ gx: 1, gy: 2 })
    expect(cellAt({ x: -280, y: -56, zoom: 1 }, 10, 10, 28)).toEqual({ gx: -10, gy: -2 })
  })

  it('snaps to the nearest line and rounds heights up to whole lines', () => {
    expect(snapUnits(41, 28)).toBe(1)
    expect(snapUnits(43, 28)).toBe(2)
    expect(snapUnits(-43, 28)).toBe(-2)
    expect(linesFor(0, 28)).toBe(1)
    expect(linesFor(28, 28)).toBe(1)
    expect(linesFor(29, 28)).toBe(2)
  })

  it('keeps zoom between 25% and 400%', () => {
    expect(clampZoom(0.1)).toBe(0.25)
    expect(clampZoom(9)).toBe(4)
  })

  it('zooming keeps the point under the cursor still', () => {
    const before = toWorld(v, 300, 200)
    const after = zoomAt(v, 300, 200, 1.5)
    expect(after.zoom).toBe(3)
    const w = toWorld(after, 300, 200)
    expect(w.x).toBeCloseTo(before.x)
    expect(w.y).toBeCloseTo(before.y)
  })

  it('bounds cover blocks on both sides of the start', () => {
    expect(boundsOf([])).toBeNull()
    expect(boundsOf([{ x: 3, y: 2, w: 24, h: 5 }, { x: -10, y: -4, w: 6, h: 2 }])).toEqual({ x: -10, y: -4, w: 37, h: 11 })
  })

  it('ruled paper puts a line under each row of text and moves with the view', () => {
    expect(baselineOf(28)).toBe(21)
    const s = paperStyle(DEFAULT_PAPER, { x: 0, y: 0, zoom: 1 })
    expect(s.backgroundSize).toBe('100% 28px')
    expect(s.backgroundPosition).toBe('0px 21px')
    const moved = paperStyle(DEFAULT_PAPER, { x: 10, y: 14, zoom: 2 })
    expect(moved.backgroundSize).toBe('100% 56px')
    expect(moved.backgroundPosition).toBe('-20px 14px')
  })

  it('a selection box picks the blocks it touches, whichever way it was dragged', () => {
    const bs = [{ id: 'a', x: 0, y: 0, w: 4, h: 2 }, { id: 'b', x: 10, y: 0, w: 4, h: 2 }, { id: 'c', x: -6, y: -4, w: 2, h: 1 }]
    expect(blocksInRect(bs, { x: -1, y: -1 }, { x: 5, y: 3 })).toEqual(['a'])
    expect(blocksInRect(bs, { x: 5, y: 3 }, { x: -7, y: -5 })).toEqual(['a', 'c'])
    expect(blocksInRect(bs, { x: 4.5, y: 0 }, { x: 9.5, y: 2 })).toEqual([])
  })

  it('no lines means no line image, and a margin line is drawn left of the main column', () => {
    expect(paperStyle({ ...DEFAULT_PAPER, lines: 'none' }, { x: 0, y: 0, zoom: 1 }).backgroundImage).toBe('none')
    const m = paperStyle({ ...DEFAULT_PAPER, lines: 'none', margin: true }, { x: 0, y: 0, zoom: 1 })
    expect(m.backgroundImage).toContain('linear-gradient')
    expect(m.backgroundPosition).toBe('70px 0px')
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/sheets/grid.test.ts`
Expected: FAIL, cannot resolve `./grid`.

- [ ] **Step 3: Implement** — `src/sheets/grid.ts`

```ts
import type { CSSProperties } from 'react'
import type { Paper } from './types'

/** x, y: the world point (px) at the screen's top-left corner. */
export type View = { x: number; y: number; zoom: number }
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export const toWorld = (v: View, sx: number, sy: number) => ({ x: v.x + sx / v.zoom, y: v.y + sy / v.zoom })
export const toScreen = (v: View, wx: number, wy: number) => ({ x: (wx - v.x) * v.zoom, y: (wy - v.y) * v.zoom })

export function cellAt(v: View, sx: number, sy: number, unit: number) {
  const w = toWorld(v, sx, sy)
  return { gx: Math.floor(w.x / unit), gy: Math.floor(w.y / unit) }
}
export const snapUnits = (px: number, unit: number) => Math.round(px / unit) || 0
export const linesFor = (px: number, unit: number) => Math.max(1, Math.ceil(px / unit - 0.01))

export function zoomAt(v: View, sx: number, sy: number, factor: number): View {
  const zoom = clampZoom(v.zoom * factor)
  const w = toWorld(v, sx, sy)
  return { zoom, x: w.x - sx / zoom, y: w.y - sy / zoom }
}

export function boundsOf(blocks: { x: number; y: number; w: number; h: number }[]) {
  if (!blocks.length) return null
  const x = Math.min(...blocks.map((b) => b.x)), y = Math.min(...blocks.map((b) => b.y))
  const r = Math.max(...blocks.map((b) => b.x + b.w)), btm = Math.max(...blocks.map((b) => b.y + b.h))
  return { x, y, w: r - x, h: btm - y }
}

/** Ids of blocks that overlap the box between two corners (grid units, any order). */
export function blocksInRect(blocks: { id: string; x: number; y: number; w: number; h: number }[], a: { x: number; y: number }, b: { x: number; y: number }): string[] {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y)
  return blocks.filter((k) => k.x < x1 && k.x + k.w > x0 && k.y < y1 && k.y + k.h > y0).map((k) => k.id)
}

/** Where a line of text sits inside its row: lines are drawn here so text rests on them. */
export const baselineOf = (unit: number) => Math.round(unit * 0.75)

const MAIN_COLUMN_X = 3
const lineColor = (p: Paper) => `color-mix(in oklab, ${p.color ?? 'var(--ink)'} ${Math.round(6 + p.strength * 22)}%, transparent)`

/** CSS background for the paper, tied to the world origin so it pans and zooms with the content. */
export function paperStyle(p: Paper, v: View): CSSProperties {
  const s = p.spacing * v.zoom
  const ox = -v.x * v.zoom
  const oy = (baselineOf(p.spacing) - v.y) * v.zoom
  const c = lineColor(p)
  const images: string[] = [], sizes: string[] = [], positions: string[] = [], repeats: string[] = []
  if (p.margin) {
    images.push('linear-gradient(to right, color-mix(in oklab, #C0503A 55%, transparent), color-mix(in oklab, #C0503A 55%, transparent))')
    sizes.push('1.5px 100%')
    positions.push(`${(MAIN_COLUMN_X * p.spacing - p.spacing / 2 - v.x) * v.zoom}px 0px`)
    repeats.push('repeat-y')
  }
  if (p.lines === 'ruled') { images.push(`linear-gradient(to bottom, ${c} 0 1px, transparent 1px)`); sizes.push(`100% ${s}px`); positions.push(`0px ${oy}px`); repeats.push('repeat') }
  if (p.lines === 'squares') {
    images.push(`linear-gradient(to bottom, ${c} 0 1px, transparent 1px)`, `linear-gradient(to right, ${c} 0 1px, transparent 1px)`)
    sizes.push(`${s}px ${s}px`, `${s}px ${s}px`); positions.push(`${ox}px ${oy}px`, `${ox}px ${oy}px`); repeats.push('repeat', 'repeat')
  }
  if (p.lines === 'dots') {
    images.push(`radial-gradient(circle, ${c.replace(/(\d+)%/, (_m, n) => `${Math.min(100, Number(n) * 2)}%`)} 1.1px, transparent 1.7px)`)
    sizes.push(`${s}px ${s}px`); positions.push(`${ox - s / 2}px ${oy - s / 2}px`); repeats.push('repeat')
  }
  return {
    backgroundColor: p.paperColor ?? 'var(--surface)',
    backgroundImage: images.length ? images.join(', ') : 'none',
    backgroundSize: sizes.join(', ') || undefined,
    backgroundPosition: positions.join(', ') || undefined,
    backgroundRepeat: repeats.join(', ') || undefined,
  }
}
```

Note the margin test: spacing 28, `3 * 28 - 14 = 70` → `70px 0px`.

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/sheets/grid.test.ts`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/sheets/grid.ts src/sheets/grid.test.ts
git commit -m "Pages: grid maths (view, snapping, zoom, bounds, paper background)"
```

---

### Task 5: Block history (undo/redo) and reading order

**Files:**
- Create: `src/sheets/history.ts`, `src/sheets/history.test.ts`, `src/sheets/order.ts`, `src/sheets/order.test.ts`

**Interfaces:**
- Produces:
  - `type Change = { kind: 'add'; block: SheetBlock } | { kind: 'remove'; block: SheetBlock } | { kind: 'update'; before: SheetBlock; after: SheetBlock } | { kind: 'batch'; changes: Change[] }`
  - `createHistory(limit = 200): { record(c: Change): void; undo(): Change | null; redo(): Change | null; canUndo(): boolean; canRedo(): boolean }` — `undo()` returns the **inverse** change to apply; `redo()` returns the original change to re-apply.
  - `applyChange(c: Change): Promise<void>` (writes through `putBlock`/`deleteBlock`)
  - `readingOrder(blocks: SheetBlock[]): SheetBlock[]`
  - `titleFrom(doc: unknown): string | null`

- [ ] **Step 1: Failing tests**

`src/sheets/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createHistory } from './history'
import type { SheetBlock } from './types'

const b = (x: number): SheetBlock => ({ id: 'a', sheetId: 's', x, y: 0, w: 4, h: 1, kind: 'text', data: { doc: null }, z: 0, createdAt: 0, updatedAt: 0 })

describe('history', () => {
  it('undo returns the inverse, redo the original, newest first', () => {
    const h = createHistory()
    h.record({ kind: 'add', block: b(1) })
    h.record({ kind: 'update', before: b(1), after: b(5) })
    expect(h.undo()).toEqual({ kind: 'update', before: b(5), after: b(1) })
    expect(h.undo()).toEqual({ kind: 'remove', block: b(1) })
    expect(h.undo()).toBeNull()
    expect(h.redo()).toEqual({ kind: 'add', block: b(1) })
    expect(h.canRedo()).toBe(true)
  })

  it('a group change undoes as one, in reverse order', () => {
    const h = createHistory()
    h.record({ kind: 'batch', changes: [{ kind: 'remove', block: b(1) }, { kind: 'update', before: b(2), after: b(3) }] })
    expect(h.undo()).toEqual({ kind: 'batch', changes: [{ kind: 'update', before: b(3), after: b(2) }, { kind: 'add', block: b(1) }] })
  })

  it('a new change clears redo, and old changes fall off past the limit', () => {
    const h = createHistory(2)
    h.record({ kind: 'add', block: b(1) })
    h.undo()
    h.record({ kind: 'add', block: b(2) })
    expect(h.canRedo()).toBe(false)
    h.record({ kind: 'add', block: b(3) })
    h.record({ kind: 'add', block: b(4) })
    h.undo(); h.undo()
    expect(h.canUndo()).toBe(false)
  })
})
```

`src/sheets/order.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readingOrder, titleFrom } from './order'
import type { SheetBlock } from './types'

const blk = (id: string, x: number, y: number, role?: 'main'): SheetBlock => ({ id, sheetId: 's', x, y, w: 10, h: 2, kind: 'text', role, data: { doc: null }, z: 0, createdAt: 0, updatedAt: 0 })

describe('reading order', () => {
  it('top to bottom, then left to right, including blocks above or left of the start', () => {
    const out = readingOrder([blk('side', 30, 2), blk('main', 3, 2, 'main'), blk('above', -8, -6), blk('below', 3, 20)])
    expect(out.map((b) => b.id)).toEqual(['above', 'main', 'side', 'below'])
  })
})

describe('title from content', () => {
  it('uses the first heading, trimmed', () => {
    expect(titleFrom({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'intro' }] }, { type: 'heading', content: [{ type: 'text', text: '  Circular ' }, { type: 'text', text: 'motion ' }] }] })).toBe('Circular motion')
  })
  it('nothing usable gives null', () => {
    expect(titleFrom({ type: 'doc', content: [{ type: 'heading' }] })).toBeNull()
    expect(titleFrom(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/sheets`
Expected: FAIL, cannot resolve `./history`, `./order`.

- [ ] **Step 3: Implement**

`src/sheets/history.ts`:

```ts
import { deleteBlock, putBlock } from '../data/sheets'
import type { SheetBlock } from './types'

export type Change =
  | { kind: 'add'; block: SheetBlock }
  | { kind: 'remove'; block: SheetBlock }
  | { kind: 'update'; before: SheetBlock; after: SheetBlock }
  | { kind: 'batch'; changes: Change[] }

const inverse = (c: Change): Change =>
  c.kind === 'add' ? { kind: 'remove', block: c.block }
    : c.kind === 'remove' ? { kind: 'add', block: c.block }
      : c.kind === 'update' ? { kind: 'update', before: c.after, after: c.before }
        : { kind: 'batch', changes: [...c.changes].reverse().map(inverse) }

/** Block-level undo (add, move, resize, delete). Typing has its own undo inside each text block. */
export function createHistory(limit = 200) {
  const past: Change[] = [], future: Change[] = []
  return {
    record(c: Change) { past.push(c); if (past.length > limit) past.shift(); future.length = 0 },
    undo(): Change | null { const c = past.pop(); if (!c) return null; future.push(c); return inverse(c) },
    redo(): Change | null { const c = future.pop(); if (!c) return null; past.push(c); return c },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  }
}

export async function applyChange(c: Change): Promise<void> {
  if (c.kind === 'batch') { for (const x of c.changes) await applyChange(x); return }
  if (c.kind === 'remove') await deleteBlock(c.block.id)
  else await putBlock(c.kind === 'add' ? c.block : { ...c.after, updatedAt: Date.now() })
}
```

`src/sheets/order.ts`:

```ts
import type { SheetBlock } from './types'

/** The order a page reads in as one column: top to bottom, then left to right. */
export const readingOrder = (blocks: SheetBlock[]) => [...blocks].sort((a, b) => a.y - b.y || a.x - b.x)

type Node = { type?: string; text?: string; content?: Node[] }
const textOf = (n: Node): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('')

/** The page's first heading, used as its title until the user names it. */
export function titleFrom(doc: unknown): string | null {
  const find = (n: Node): Node | undefined => (n.type === 'heading' ? n : (n.content ?? []).map(find).find(Boolean))
  const h = doc && typeof doc === 'object' ? find(doc as Node) : undefined
  const t = h ? textOf(h).replace(/\s+/g, ' ').trim() : ''
  return t ? t.slice(0, 200) : null
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run src/sheets`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/sheets/history.ts src/sheets/history.test.ts src/sheets/order.ts src/sheets/order.test.ts
git commit -m "Pages: block undo history, reading order, title from the first heading"
```

---

### Task 6: Text block editor (TipTap)

**Files:**
- Modify: `package.json` (deps)
- Create: `src/features/sheet/TextBlock.tsx`, `src/styles/sheet.css`

**Interfaces:**
- Consumes: `SheetBlock`, `updateBlock`, `linesFor` (Tasks 1, 4)
- Produces: `TextBlock({ block, unit, autoFocus, onDoc, onHeight, onBlur }: { block: SheetBlock; unit: number; autoFocus?: boolean; onDoc: (doc: unknown) => void; onHeight: (lines: number) => void; onBlur: () => void })`

- [ ] **Step 1: Install TipTap 3**

Run: `npm i @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extensions @tiptap/extension-list`
Then confirm the export names: `node -e "console.log(Object.keys(require('@tiptap/extensions')).filter(k=>/Placeholder/.test(k)), Object.keys(require('@tiptap/extension-list')).filter(k=>/Task/.test(k)))"`
Expected: `[ 'Placeholder' ] [ 'TaskItem', 'TaskList', … ]`. If the names differ, use what is printed and note a ruling.

- [ ] **Step 2: Implement** — `src/features/sheet/TextBlock.tsx`

```tsx
import { useEffect, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { linesFor } from '../../sheets/grid'
import type { SheetBlock } from '../../sheets/types'

/** One text block. StarterKit's input rules give the markdown shortcuts: #, -, 1., >, ```, ---. [] makes a checklist. */
export function TextBlock({ block, unit, autoFocus, onDoc, onHeight, onBlur }: {
  block: SheetBlock; unit: number; autoFocus?: boolean
  onDoc: (doc: unknown) => void; onHeight: (lines: number) => void; onBlur: () => void
}) {
  const save = useRef<ReturnType<typeof setTimeout>>(undefined)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList, TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: ({ node }) => (node.type.name === 'heading' && block.role === 'main' ? 'Title' : block.role === 'main' ? 'Start writing, or press / for more' : 'Type here') }),
    ],
    content: (block.data.doc as object) ?? '',
    autofocus: autoFocus ? 'end' : false,
    onUpdate: ({ editor: e }) => { clearTimeout(save.current); save.current = setTimeout(() => onDoc(e.getJSON()), 400) },
    onBlur: ({ editor: e }) => { clearTimeout(save.current); onDoc(e.getJSON()); onBlur() },
  })
  // A change from another device replaces the content unless this block is being edited.
  useEffect(() => {
    if (editor && !editor.isFocused && JSON.stringify(editor.getJSON()) !== JSON.stringify(block.data.doc)) editor.commands.setContent(block.data.doc as object, { emitUpdate: false })
  }, [editor, block.data.doc])
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => onHeight(linesFor(el.offsetHeight, unit)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [unit, onHeight])
  useEffect(() => () => clearTimeout(save.current), [])
  return <div ref={box} className="tblock" style={{ '--line': `${unit}px` } as React.CSSProperties}><EditorContent editor={editor} /></div>
}
```

`src/styles/sheet.css` (imported from `SheetPage.tsx`, so it loads with the lazy chunk):

```css
/* Text sits on the paper's lines: every line box is one grid unit tall. */
.tblock { font-size: 16px; line-height: var(--line); }
.tblock .ProseMirror { outline: none; min-height: var(--line); }
.tblock .ProseMirror > * { margin: 0; }
.tblock h1 { font-family: var(--serif); font-weight: 400; font-size: calc(var(--line) * 1.2); line-height: calc(var(--line) * 2); letter-spacing: -.01em; }
.tblock h2 { font-family: var(--serif); font-weight: 600; font-size: calc(var(--line) * .82); line-height: var(--line); }
.tblock h3 { font-weight: 600; font-size: 16px; line-height: var(--line); }
.tblock ul, .tblock ol { padding-left: calc(var(--line) * .9); }
.tblock li > p { margin: 0; }
.tblock ul[data-type="taskList"] { list-style: none; padding-left: 4px; }
.tblock ul[data-type="taskList"] li { display: flex; gap: 8px; align-items: flex-start; }
.tblock ul[data-type="taskList"] li > label { line-height: var(--line); }
.tblock blockquote { border-left: 2px solid var(--line); padding-left: 12px; color: var(--muted); }
.tblock pre { font: 13.5px/var(--line) ui-monospace, 'JetBrains Mono', monospace; background: var(--surface2); border-radius: 8px; padding: 0 12px; }
.tblock hr { border: 0; height: var(--line); background: linear-gradient(var(--line), var(--line)) center / 100% 1px no-repeat; }
.tblock p.is-empty::before, .tblock h1.is-empty::before { content: attr(data-placeholder); color: var(--muted); opacity: .7; pointer-events: none; float: left; height: 0; }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no errors. (Behaviour is checked in the browser in Task 9; TipTap needs a real layout engine.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/features/sheet/TextBlock.tsx src/styles/sheet.css
git commit -m "Pages: text block editor with markdown shortcuts, lines matched to the grid"
```

---

### Task 7: The canvas and the page route

**Files:**
- Create: `src/features/sheet/SheetPage.tsx`, `src/features/sheet/Canvas.tsx`, `src/features/sheet/ReadView.tsx`
- Modify: `src/app/App.tsx`, `src/styles/sheet.css`

**Interfaces:**
- Consumes: everything above.
- Produces: route `/write/:sheetId` (lazy).

- [ ] **Step 1: Route** — `src/app/App.tsx`:

```tsx
import { lazy, Suspense } from 'react'
const SheetPage = lazy(() => import('../features/sheet/SheetPage').then((m) => ({ default: m.SheetPage })))
// inside the Shell routes:
          <Route path="write/:sheetId" element={<Suspense fallback={<div className="page" />}><SheetPage /></Suspense>} />
```

- [ ] **Step 2: Page component** — `src/features/sheet/SheetPage.tsx`

```tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import '../../styles/sheet.css'
import { TopBar } from '../../app/Shell'
import { db } from '../../data/db'
import * as sheets from '../../data/sheets'
import { Icon } from '../../ui/Icons'
import { DropMenu } from '../../ui/DropMenu'
import { PageSettings } from '../page/PageSettings'
import { confirmAction } from '../../ui/confirm'
import { toast } from '../../ui/toasts'
import { Canvas } from './Canvas'
import { ReadView } from './ReadView'
import { PaperSettings } from './PaperSettings'

const PHONE = '(max-width: 767px)'

export function SheetPage() {
  const { sheetId = '' } = useParams()
  const nav = useNavigate()
  const sheet = useLiveQuery(() => sheets.getSheet(sheetId), [sheetId])
  const blocks = useLiveQuery(() => sheets.blocksFor(sheetId), [sheetId])
  const folders = useLiveQuery(() => db.folders.toArray(), [])
  const [mode, setMode] = useState<'canvas' | 'read'>(() => (matchMedia(PHONE).matches ? 'read' : 'canvas'))
  const [dialog, setDialog] = useState<null | 'settings'>(null)
  const [renaming, setRenaming] = useState(false)
  useEffect(() => { if (sheetId) void sheets.updateSheet(sheetId, { lastOpenedAt: Date.now() }) }, [sheetId])
  if (sheet === undefined || blocks === undefined) return null
  if (!sheet) return <><TopBar crumbs={<b>Page</b>} /><div className="page"><h1 className="title">Page not found</h1></div></>

  const rename = (title: string) => { const t = title.trim(); setRenaming(false); if (t && t !== sheet.title) void sheets.updateSheet(sheet.id, { title: t, titleAuto: false }) }
  return (
    <>
      <TopBar crumbs={<>{folders?.find((f) => f.id === sheet.folderId)?.name && <>{folders.find((f) => f.id === sheet.folderId)!.name} / </>}
        {renaming ? <input className="input crumb-input" autoFocus defaultValue={sheet.title} aria-label="Page title" onBlur={(e) => rename(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false) }} />
          : <b onDoubleClick={() => setRenaming(true)} title="Double-click to rename">{sheet.title}</b>}</>}>
        <div className="seg sheet-mode" role="group" aria-label="View">
          <button className={mode === 'read' ? 'on' : ''} onClick={() => setMode('read')}>Read</button>
          <button className={mode === 'canvas' ? 'on' : ''} onClick={() => setMode('canvas')}>Canvas</button>
        </div>
        <DropMenu label="More for this page" button={({ open, toggle }) => <button className="btn sm ghost" aria-label="More for this page" aria-expanded={open} onClick={toggle}><Icon name="more" /></button>}>
          {(close) => <>
            <button role="menuitem" onClick={() => { close(); setRenaming(true) }}><Icon name="edit" size={15} />Rename</button>
            <button role="menuitem" onClick={() => { close(); setDialog('settings') }}><Icon name="gear" size={15} />Page settings…</button>
            <div className="ctx-sep" role="separator" />
            <button role="menuitem" onClick={async () => { close(); await sheets.setSheetArchived(sheet.id, true); toast('Page archived', 'Find it under Archive in the sidebar', 'archive'); nav('/') }}><Icon name="archive" size={15} />Archive</button>
            <button role="menuitem" className="danger" onClick={async () => {
              close()
              if (!await confirmAction({ title: `Delete "${sheet.title}"?`, body: 'The page and everything on it are removed for good. Archiving keeps it instead.', confirm: 'Delete page', danger: true })) return
              nav('/'); await sheets.deleteSheet(sheet.id); toast('Page deleted')
            }}><Icon name="trash" size={15} />Delete…</button>
          </>}
        </DropMenu>
      </TopBar>
      {mode === 'canvas' ? <Canvas sheet={sheet} blocks={blocks} /> : <ReadView sheet={sheet} blocks={blocks} />}
      {dialog === 'settings' && folders && (
        <PageSettings title={sheet.title} folders={folders} folderId={sheet.folderId} unit={sheet.unit} onClose={() => setDialog(null)}
          onFolder={(folderId) => sheets.updateSheet(sheet.id, { folderId })} onUnit={(unit) => sheets.updateSheet(sheet.id, { unit: unit || undefined })}>
          <PaperSettings paper={sheet.paper} onChange={(paper) => sheets.updateSheet(sheet.id, { paper })} />
        </PageSettings>
      )}
    </>
  )
}
```

Until Task 8 lands, create `PaperSettings.tsx` exporting a component that returns `null`, so this compiles.

- [ ] **Step 3: Canvas** — `src/features/sheet/Canvas.tsx`

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as sheets from '../../data/sheets'
import { boundsOf, cellAt, paperStyle, snapUnits, toWorld, zoomAt, type View } from '../../sheets/grid'
import { applyChange, createHistory } from '../../sheets/history'
import { titleFrom } from '../../sheets/order'
import type { SheetBlock, SheetRow } from '../../sheets/types'
import { Icon } from '../../ui/Icons'
import { isTyping } from '../../app/ui'
import { TextBlock } from './TextBlock'

const START: View = { x: 0, y: 0, zoom: 1 }
const viewKey = (id: string) => `mneme.sheet.view.${id}`
const loadView = (id: string): View => { try { return { ...START, ...JSON.parse(localStorage.getItem(viewKey(id)) ?? '{}') } } catch { return START } }

export function Canvas({ sheet, blocks }: { sheet: SheetRow; blocks: SheetBlock[] }) {
  const unit = sheet.paper.spacing
  const [view, setView] = useState<View>(() => loadView(sheet.id))
  const [focusId, setFocusId] = useState<string | null>(null)
  const history = useMemo(() => createHistory(), [sheet.id])
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => { try { localStorage.setItem(viewKey(sheet.id), JSON.stringify(view)) } catch { /* private mode */ } }, [sheet.id, view])

  // Wheel pans; Ctrl/Cmd + wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms at the cursor.
  useEffect(() => {
    const el = host.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) setView((v) => zoomAt(v, e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0025)))
      else setView((v) => ({ ...v, x: v.x + e.deltaX / v.zoom, y: v.y + e.deltaY / v.zoom }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Undo/redo for blocks (inside a text block, the editor's own undo runs instead).
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || isTyping(e)) return
      e.preventDefault()
      const c = e.shiftKey ? history.redo() : history.undo()
      if (c) await applyChange(c)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history])

  // Pointer: drag on empty paper pans (one finger on touch); a click starts a text block; two fingers pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ moved: boolean; startDist?: number; startZoom?: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('sheet-world')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = { moved: true, startDist: Math.hypot(a.x - b.x, a.y - b.y), startZoom: view.zoom }
    } else gesture.current = { moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev || !gesture.current) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const r = host.current!.getBoundingClientRect()
    if (pointers.current.size === 2 && gesture.current.startDist) {
      const [a, b] = [...pointers.current.values()]
      const target = gesture.current.startZoom! * Math.hypot(a.x - b.x, a.y - b.y) / gesture.current.startDist
      setView((v) => zoomAt(v, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, target / v.zoom))
      return
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y
    if (Math.abs(dx) + Math.abs(dy) > 0) gesture.current.moved ||= Math.hypot(e.clientX - prev.x, e.clientY - prev.y) > 3 || gesture.current.moved
    setView((v) => ({ ...v, x: v.x - dx / v.zoom, y: v.y - dy / v.zoom }))
  }
  const onPointerUp = async (e: React.PointerEvent) => {
    const g = gesture.current
    pointers.current.delete(e.pointerId)
    if (pointers.current.size) return
    gesture.current = null
    if (!g || g.moved) return
    const r = host.current!.getBoundingClientRect()
    const { gx, gy } = cellAt(view, e.clientX - r.left, e.clientY - r.top, unit)
    const block = await sheets.addBlock({ sheetId: sheet.id, x: gx, y: gy, w: 12, h: 1, kind: 'text', data: { doc: { type: 'doc', content: [{ type: 'paragraph' }] } }, z: Math.max(0, ...blocks.map((b) => b.z)) + 1 })
    history.record({ kind: 'add', block })
    setFocusId(block.id)
  }

  const onDoc = useCallback(async (b: SheetBlock, doc: unknown) => {
    await sheets.updateBlock(b.id, { data: { doc } })
    if (b.role === 'main' && sheet.titleAuto) {
      const t = titleFrom(doc) ?? 'Untitled page'
      if (t !== sheet.title) await sheets.updateSheet(sheet.id, { title: t })
    }
  }, [sheet.id, sheet.title, sheet.titleAuto])

  /** Moving and resizing: drag the grip (move) or the right edge (width). Snaps to the grid unless Alt is held. */
  const startDrag = (b: SheetBlock, what: 'move' | 'width') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    const sx = e.clientX, sy = e.clientY, before = b
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    let latest = b
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / view.zoom, dy = (ev.clientY - sy) / view.zoom
      const free = ev.altKey
      const step = (px: number) => (free ? px / unit : snapUnits(px, unit))
      latest = what === 'move' ? { ...b, x: b.x + step(dx), y: b.y + step(dy) } : { ...b, w: Math.max(4, b.w + step(dx)) }
      void sheets.putBlock(latest)
    }
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up)
      if (latest !== before) history.record({ kind: 'update', before, after: latest })
    }
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up)
  }

  const bounds = boundsOf(blocks)
  const rect = host.current?.getBoundingClientRect()
  const goStart = () => setView(START)
  return (
    <div className="sheet-host" ref={host} style={paperStyle(sheet.paper, view)}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <div className="sheet-world" style={{ transform: `translate(${-view.x * view.zoom}px, ${-view.y * view.zoom}px) scale(${view.zoom})` }}>
        <div className="sheet-origin" aria-hidden="true" />
        {blocks.map((b) => (
          <div key={b.id} className={`sblock ${focusId === b.id ? 'focus' : ''}`} style={{ left: b.x * unit, top: b.y * unit, width: b.w * unit, zIndex: b.z }}
            onPointerDown={(e) => e.stopPropagation()}>
            <button className="sgrip" aria-label="Move block" onPointerDown={startDrag(b, 'move')}><Icon name="grid" size={12} /></button>
            <TextBlock block={b} unit={unit} autoFocus={focusId === b.id}
              onDoc={(doc) => onDoc(b, doc)}
              onHeight={(h) => { if (h !== b.h) void sheets.updateBlock(b.id, { h }) }}
              onBlur={async () => { setFocusId(null); const fresh = await sheets.blocksFor(sheet.id).then((all) => all.find((x) => x.id === b.id)); if (fresh && await sheets.pruneEmpty(fresh)) history.record({ kind: 'remove', block: fresh }) }} />
            <span className="swidth" aria-hidden="true" onPointerDown={startDrag(b, 'width')} />
          </div>
        ))}
      </div>
      <div className="sheet-zoom">
        <button className="btn sm" onClick={goStart}><Icon name="reset" size={14} />Back to start</button>
        <div className="zoomctl">
          <button aria-label="Zoom out" onClick={() => rect && setView((v) => zoomAt(v, rect.width / 2, rect.height / 2, 1 / 1.25))}>−</button>
          <button className="pct" onClick={() => rect && setView((v) => zoomAt(v, rect.width / 2, rect.height / 2, 1 / v.zoom))} title="Reset to 100%">{Math.round(view.zoom * 100)}%</button>
          <button aria-label="Zoom in" onClick={() => rect && setView((v) => zoomAt(v, rect.width / 2, rect.height / 2, 1.25))}>+</button>
        </div>
      </div>
      {bounds && rect && <Minimap blocks={blocks} unit={unit} view={view} size={{ w: rect.width, h: rect.height }} onJump={(x, y) => setView((v) => ({ ...v, x: x - rect.width / 2 / v.zoom, y: y - rect.height / 2 / v.zoom }))} />}
    </div>
  )
}

/** Every block as a box, the current view, and the start. Click to jump there. */
function Minimap({ blocks, unit, view, size, onJump }: { blocks: SheetBlock[]; unit: number; view: View; size: { w: number; h: number }; onJump: (wx: number, wy: number) => void }) {
  const vw = { x: view.x / unit, y: view.y / unit, w: size.w / view.zoom / unit, h: size.h / view.zoom / unit }
  const b = boundsOf([...blocks, vw, { x: 0, y: 0, w: 0, h: 0 }])!
  const W = 200, H = 132, pad = 6
  const k = Math.min((W - pad * 2) / Math.max(b.w, 1), (H - pad * 2) / Math.max(b.h, 1))
  const at = (x: number, y: number) => ({ left: pad + (x - b.x) * k, top: pad + (y - b.y) * k })
  return (
    <button className="sheet-minimap" aria-label="Map of the whole page. Click to jump." onClick={(e) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      onJump(((e.clientX - r.left - pad) / k + b.x) * unit, ((e.clientY - r.top - pad) / k + b.y) * unit)
    }}>
      {blocks.map((bl) => <i key={bl.id} style={{ ...at(bl.x, bl.y), width: Math.max(2, bl.w * k), height: Math.max(2, bl.h * k) }} />)}
      <span className="mm-view" style={{ ...at(vw.x, vw.y), width: vw.w * k, height: vw.h * k }} />
      <span className="mm-start" style={at(0, 0)} />
    </button>
  )
}
```

Check the exact names exported by `src/app/ui.ts` (`isTyping`) and that icon `grid` exists (it does in the sprite list).

- [ ] **Step 3b: Selecting several blocks** — in `Canvas.tsx`:

  - State: `const [selected, setSelected] = useState<Set<string>>(new Set())` and `const [box, setBox] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null)` (world px).
  - `onPointerDown` on empty paper with `e.shiftKey`: start a box at `toWorld(view, …)` instead of panning; `onPointerMove` updates `box.b`; `onPointerUp` sets `selected` to `blocksInRect(blocks, { x: a.x / unit, y: a.y / unit }, { x: b.x / unit, y: b.y / unit })` and clears `box`. A plain click on empty paper while something is selected clears the selection instead of creating a block.
  - Shift+click on a grip toggles that block in `selected` (no drag).
  - `startDrag(b, 'move')`: if `b` is in `selected`, move every selected block by the same snapped delta (each from its own starting position), and on release record one `{ kind: 'batch', changes: [...updates] }`.
  - Keys on window, not while typing: `Delete`/`Backspace` removes the selected blocks except the main one and records one batch of `remove`; `Escape` clears the selection; Ctrl/Cmd+A selects every block.
  - Render: selected blocks get class `selected`; the box renders as `<div className="sheet-box" />` positioned in screen px from `toScreen`.
  - CSS:

```css
.sblock.selected { box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 70%, transparent); border-radius: 4px; }
.sblock.selected .sgrip { opacity: 1; }
.sheet-box { position: absolute; border: 1.5px solid var(--accent); background: color-mix(in oklab, var(--accent) 10%, transparent); border-radius: 3px; pointer-events: none; }
```

- [ ] **Step 4: Read view** — `src/features/sheet/ReadView.tsx`

```tsx
import { useState } from 'react'
import * as sheets from '../../data/sheets'
import { readingOrder } from '../../sheets/order'
import type { SheetBlock, SheetRow } from '../../sheets/types'
import { Icon } from '../../ui/Icons'
import { TextBlock } from './TextBlock'

/** The page as one column (phones). Tap a block to edit it in place; Edit jumps to the end of the main text. */
export function ReadView({ sheet, blocks }: { sheet: SheetRow; blocks: SheetBlock[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const unit = sheet.paper.spacing
  const main = blocks.find((b) => b.role === 'main')
  return (
    <div className="page sheet-read">
      {readingOrder(blocks).map((b) => (
        <div key={b.id} className={`rblock ${b.role === 'main' ? '' : 'side'}`} onClick={() => setEditing(b.id)}>
          <TextBlock block={b} unit={unit} autoFocus={editing === b.id} onDoc={(doc) => sheets.updateBlock(b.id, { data: { doc } })} onHeight={() => {}} onBlur={() => setEditing(null)} />
        </div>
      ))}
      {main && editing === null && <button className="sheet-edit" onClick={() => setEditing(main.id)}><Icon name="edit" size={18} />Edit</button>}
    </div>
  )
}
```

- [ ] **Step 5: Styles** — append to `src/styles/sheet.css`:

```css
.sheet-host { position: relative; flex: 1; min-height: 0; height: calc(100dvh - 56px); overflow: hidden; touch-action: none; cursor: text; }
.sheet-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.sheet-origin { position: absolute; left: 0; top: 0; width: 14px; height: 14px; border-left: 2px solid var(--accent); border-top: 2px solid var(--accent); pointer-events: none; }
.sblock { position: absolute; cursor: auto; }
.sblock .sgrip { position: absolute; left: -26px; top: 4px; width: 20px; height: 20px; border: 0; border-radius: 5px; background: transparent; color: var(--muted); opacity: 0; cursor: grab; display: grid; place-items: center; transition: opacity .15s var(--ease); }
.sblock:hover .sgrip, .sblock.focus .sgrip { opacity: 1; }
.sblock .sgrip:hover { background: var(--surface2); }
.sblock .swidth { position: absolute; right: -4px; top: 0; bottom: 0; width: 8px; cursor: ew-resize; }
.sblock:hover { box-shadow: 0 0 0 1px color-mix(in oklab, var(--line) 70%, transparent); border-radius: 4px; }
.sheet-zoom { position: absolute; left: 16px; bottom: 16px; display: flex; gap: 8px; align-items: center; }
.zoomctl { display: flex; align-items: center; height: 34px; border: 1px solid var(--line); background: var(--surface); border-radius: 10px; box-shadow: var(--shadow); }
.zoomctl button { height: 32px; min-width: 32px; border: 0; background: transparent; color: var(--ink); font: inherit; font-variant-numeric: tabular-nums; }
.zoomctl .pct { min-width: 52px; font-size: 13px; }
.sheet-minimap { position: absolute; right: 16px; bottom: 16px; width: 200px; height: 132px; padding: 0; border: 1px solid var(--line); background: color-mix(in oklab, var(--surface) 94%, transparent); border-radius: 10px; box-shadow: var(--shadow); overflow: hidden; cursor: pointer; }
.sheet-minimap i { position: absolute; border-radius: 2px; background: var(--line); }
.sheet-minimap .mm-view { position: absolute; border: 1.5px solid var(--accent); border-radius: 3px; }
.sheet-minimap .mm-start { position: absolute; width: 6px; height: 6px; margin: -1px; border-left: 2px solid var(--accent); border-top: 2px solid var(--accent); }
.sheet-read { max-width: 720px; padding-bottom: 120px; }
.sheet-read .rblock + .rblock { margin-top: 12px; }
.sheet-read .rblock.side { background: var(--surface2); border-radius: 10px; padding: 8px 12px; }
.sheet-edit { position: fixed; right: 16px; bottom: calc(20px + env(safe-area-inset-bottom)); height: 48px; padding: 0 18px 0 14px; border: 0; border-radius: 99px; background: var(--accent); color: var(--accent-ink); font: 600 14px var(--sans); display: flex; align-items: center; gap: 8px; box-shadow: var(--shadow); }
.sheet-mode button { min-height: 32px; }
.crumb-input { height: 30px; width: min(320px, 50vw); }
@media (max-width: 767px) { .sheet-minimap { display: none; } }
```

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc -b && npm run build`
Expected: no errors; the build lists a separate chunk for `SheetPage`.

- [ ] **Step 7: Commit**

```bash
git add src/app/App.tsx src/features/sheet src/styles/sheet.css
git commit -m "Pages: canvas with pan, zoom, click-to-type, move and resize on the grid, multi-select, minimap, undo; Read view"
```

---

### Task 8: Paper settings and defaults

**Files:**
- Create: `src/features/sheet/PaperSettings.tsx` (replace the stub)
- Modify: `src/settings/store.ts` (`paperDefault`), `src/sync/account.ts` (`SYNCED_SETTINGS`), `src/app/Shell.tsx` (New page uses it), `src/styles/sheet.css`
- Test: `src/settings/store.test.ts` if it exists, else `src/sheets/paper.test.ts`

**Interfaces:**
- Produces: `PaperSettings({ paper, onChange })`; settings `paperDefault: Paper | null`.

- [ ] **Step 1: Failing test** — `src/sheets/paper.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { createSheet, getSheet } from '../data/sheets'
import { DEFAULT_PAPER } from './types'

describe('paper', () => {
  it('a new page uses the paper it is given, else the default', async () => {
    const plain = { ...DEFAULT_PAPER, lines: 'none' as const, spacing: 32 as const }
    expect((await getSheet(await createSheet({ paper: plain })))?.paper).toEqual(plain)
    expect((await getSheet(await createSheet()))?.paper).toEqual(DEFAULT_PAPER)
  })
})
```

- [ ] **Step 2: Run** — `npx vitest run src/sheets/paper.test.ts`. Expected: PASS already (Task 1 built it). That's the contract this task relies on; keep the test as a guard. Then add `paperDefault` and see `tsc` fail where Shell reads it:

Run: `npx tsc -b`
Expected after the Shell change below but before the store change: error `Property 'paperDefault' does not exist`.

- [ ] **Step 3: Implement**

`src/settings/store.ts`: import `type Paper` from `../sheets/types`; add `paperDefault: Paper | null` to `Settings` with initial value `null`; add `'paperDefault'` to `SYNCED_SETTINGS` in `src/sync/account.ts`.

`src/features/sheet/PaperSettings.tsx`:

```tsx
import { Seg, Toggle } from '../../ui/controls'
import { useSettings } from '../../settings/store'
import { toast } from '../../ui/toasts'
import type { Paper } from '../../sheets/types'
import { paperStyle } from '../../sheets/grid'

const LINES: { id: Paper['lines']; label: string }[] = [{ id: 'none', label: 'None' }, { id: 'ruled', label: 'Ruled' }, { id: 'dots', label: 'Dots' }, { id: 'squares', label: 'Squares' }]
const COLORS: { id: string | null; label: string; swatch: string }[] = [{ id: null, label: 'Theme', swatch: 'var(--muted)' }, { id: '#5B7DB8', label: 'Blue', swatch: '#5B7DB8' }, { id: '#6E8F55', label: 'Green', swatch: '#6E8F55' }]

export function PaperSettings({ paper, onChange }: { paper: Paper; onChange: (p: Paper) => void }) {
  const set = (patch: Partial<Paper>) => onChange({ ...paper, ...patch })
  return (
    <div className="paper-settings">
      <h3>Paper</h3>
      <div className="paper-lines" role="group" aria-label="Lines">
        {LINES.map((l) => (
          <button key={l.id} className={paper.lines === l.id ? 'on' : ''} onClick={() => set({ lines: l.id })}
            style={paperStyle({ ...paper, lines: l.id, spacing: 24, margin: false }, { x: 0, y: 0, zoom: 0.5 })}><span>{l.label}</span></button>
        ))}
      </div>
      <div className="srow"><div className="l"><b>Spacing</b></div>
        <Seg value={String(paper.spacing)} onChange={(v) => set({ spacing: Number(v) as Paper['spacing'] })} options={[{ value: '24', label: 'Compact' }, { value: '28', label: 'College' }, { value: '32', label: 'Wide' }]} /></div>
      <label className="srow"><div className="l"><b>How strong the lines are</b></div>
        <input type="range" min={0} max={1} step={0.05} value={paper.strength} onChange={(e) => set({ strength: Number(e.target.value) })} /></label>
      <div className="srow"><div className="l"><b>Line colour</b></div>
        <div className="paper-colors">{COLORS.map((c) => <button key={c.label} aria-label={c.label} className={paper.color === c.id ? 'on' : ''} style={{ background: c.swatch }} onClick={() => set({ color: c.id })} />)}</div></div>
      <div className="srow"><div className="l"><b>Red margin line</b><span>Like notebook paper</span></div><Toggle on={paper.margin} onChange={(margin) => set({ margin })} /></div>
      <button className="btn sm ghost" onClick={() => { useSettings.getState().set({ paperDefault: paper }); toast('New pages will use this paper') }}>Use for my new pages</button>
    </div>
  )
}
```

Before writing this, read `src/ui/controls.tsx` and use the real `Seg` and `Toggle` prop names (they may be `on`/`set` or `value`/`onChange`); adjust the calls, not the components.

`src/app/Shell.tsx` New page: `createSheet({ folderId, paper: useSettings.getState().paperDefault ?? undefined })`.

CSS:

```css
.paper-settings { margin-top: 20px; }
.paper-settings h3 { font-size: 13px; color: var(--muted); font-weight: 500; margin-bottom: 8px; }
.paper-lines { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.paper-lines button { height: 64px; border-radius: 9px; border: 1px solid var(--line); display: flex; align-items: flex-end; justify-content: center; padding-bottom: 6px; font: 500 12px var(--sans); color: var(--muted); }
.paper-lines button.on { border: 2px solid var(--accent); color: var(--ink); }
.paper-colors { display: flex; gap: 8px; }
.paper-colors button { width: 24px; height: 24px; border-radius: 99px; border: 0; }
.paper-colors button.on { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent); }
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run && npx tsc -b`
Expected: all pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/sheet/PaperSettings.tsx src/settings/store.ts src/sync/account.ts src/app/Shell.tsx src/styles/sheet.css src/sheets/paper.test.ts
git commit -m "Pages: paper settings (lines, spacing, strength, colour, margin) and a default for new pages"
```

---

### Task 9: Browser check, roadmap, push

**Files:**
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Desktop check** (dev server, built-in browser, 1440×900):
  1. Sidebar → New page → lands on `/write/…`, cursor in the Title line.
  2. Type `Circular motion`, Enter, type text; `# `, `- `, `1. `, `[] `, `> `, ` ``` `, `---` each turn into their block. The sidebar title becomes "Circular motion".
  3. Text lines sit on the ruled lines at 100% and at 150%.
  4. Click empty paper to the right: a new block starts in that cell; type; click away; empty a block and click away: it disappears; the main block never does.
  5. Drag the grip: moves in whole cells; with Alt: moves freely. Drag the right edge: width snaps.
  6. Shift+drag a box over three blocks: all three highlight; drag one grip and all three move together; Delete removes them (never the main block); Ctrl+Z brings all three back; Esc clears; Shift+click a grip adds or removes one.
  6. Ctrl+Z / Ctrl+Shift+Z undo and redo a move and a new block.
  7. Wheel pans, Ctrl+wheel zooms at the cursor, Back to start returns to the start at 100%, the minimap jumps.
  8. Page settings → Paper: each line style, spacing, strength, colour and margin update live; "Use for my new pages" applies to the next new page.
  9. Rename, Archive, Delete from ⋯; drag the page between folders and units in the sidebar.
- [ ] **Step 2: Phone check** (375×812): opens in Read view; tap a paragraph edits it; Edit button focuses the main text; switch to Canvas: one-finger pan, two-finger pinch.
- [ ] **Step 3: Signed-in sync** (Shrey's devices): a page made on PC appears on the phone; editing different blocks on both keeps both edits.
- [ ] **Step 4: Roadmap** — tick phase 1 under Text notes, note anything deferred.
- [ ] **Step 5: Full suite, build, push**

Run: `npx vitest run && npm run build && npm run test:db`
Expected: all pass. Then `git push origin main`.

---

## Self-review notes

- Spec coverage for phase 1: page type in library/sidebar/folders (Task 3), canvas pan/zoom/start/minimap (Task 7), paper settings (Task 8), text blocks with markdown shortcuts (Task 6), move/resize on the grid (Task 7), selecting and moving several blocks (Tasks 4, 5, 7), undo (Tasks 5, 7), sync tables and tests (Task 2), Read view on phones (Task 7). Margin-note attachment for Read view uses plain top-to-bottom order in this phase; attaching a side block to a specific line of the main text needs line positions inside the main block and moves to phase 4 with Pages layout (ruling recorded here).
- Spec deviation: Dexie v5 adds only `sheets` and `sheetBlocks`; ink and My blocks tables arrive with their phases.
- Types used across tasks: `SheetRow`, `SheetBlock`, `Paper`, `View`, `Change`, `PageKind` — names checked against their definitions above.
