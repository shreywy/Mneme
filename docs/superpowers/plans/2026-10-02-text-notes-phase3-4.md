# Text notes phases 3 and 4: implementation plan

**Goal:** finish Text notes apart from AI: ink (phase 3), then images, Pages layout, Print/PDF and share links (phase 4), plus the deferred minors from phase 2.

**Spec:** [2026-10-01-text-notes-design.md](../specs/2026-10-01-text-notes-design.md), sections Ink, Images, Layouts and printing, Sync and storage. Shrey approved both phases with the spec. On 2026-10-02 he asked for "all of the missing features in the text section" to be finished, AI excepted.

**Architecture:**
- Strokes are rows in a new synced table, one row per stroke, so two devices drawing never overwrite each other.
- Each stroke is drawn from its encoded points with perfect-freehand into one of two SVG layers inside the canvas world: highlighter behind the blocks, pen in front.
- Phase 4 adds an `image` node to the text editor. It also adds a pagination function that both the canvas (page-break spacers) and print (CSS `break-inside`) use, a print-only document, and a `sheet` kind for shares.

**Tech:** perfect-freehand, TipTap 3 node views, Dexie v6, Supabase migration (Shrey pushes it), Imgur API v3 (anonymous, `VITE_IMGUR_CLIENT_ID`).

## Global constraints
- Install packages with `npx npm@10.9.2 install`, because Cloudflare runs `npm ci` on npm 10.9.2.
- No AI attribution anywhere. Commits use Shrey's identity. Only push when the app works, then check the Cloudflare check run.
- Copy rules come from the memory "no AI-sounding copy": plain words, no em-dash flourishes, no "seamless".
- Everything new syncs through the existing engine (a `SPECS` entry plus a `_mneme_sync_table`-shaped table with owner-only RLS and the storage trigger) and is covered in `supabase/tests/rls.sql`.
- Motion everywhere, with Reduce motion respected.

## Review focus
1. A stroke drawn over a block that is then moved, duplicated, deleted and undone has to stay with the block every time.
2. A partial erase across a stroke has to split it into pieces, and undo has to bring the original back as one stroke.
3. On touch screens with a pen, a resting palm must not draw, and fingers must still pan and pinch.
4. Images without an Imgur client id, or offline, stay on the device and must never lose the picture.
5. Page-break spacers must never be saved into the document, or they would spread to other devices and prints.

## Tasks

### Phase 3: ink
1. **Stroke maths** (`src/sheets/ink.ts`, tested):
   - encode/decode: quantise to 0.25 px, delta-encode
   - bounds
   - anchoring: 60% of points inside a text block
   - block↔world space
   - highlighter straightening
   - hold-to-shape: line, rectangle, ellipse, triangle, snapped to the grid
   - eraser hits, and a rub-out split with resampling
   - lasso point-in-polygon
   - an SVG path from perfect-freehand
2. **Storage and sync:**
   - `SheetStroke` type, Dexie v6 `sheetInk`, `src/data/ink.ts`
   - `SPECS` entry, migration `20261008000000_sheet_ink.sql`, RLS test rows
   - backup table list, `deleteSheet` removes ink
   - duplicate and My blocks carry anchored ink
3. **Undo:** `Change` gains `ink-add`, `ink-remove`, `ink-update`, and `applyChange` applies them. Deleting blocks also removes their anchored ink in the same batch. Tested in `history.test.ts`.
4. **Ink layer and tools:**
   - Tools: pen, highlighter, eraser, lasso.
   - Pen settings in synced settings: three colour slots, size, pressure, smoothing, hold-to-shape, "only the pen draws".
   - Live drawing with coalesced events; a mouse gets simulated pressure.
   - Palm rejection.
   - Two-finger tap undo.
   - Box select and lasso pick up strokes. Selections move, duplicate, recolour and delete blocks and strokes together.
   - Ask Gemini shows, disabled.
5. **Read view:** anchored ink is drawn on its block.

### Phase 4
6. **Pagination** (`src/sheets/pages.ts`, tested):
   - sheet sizes in lines for A4/Letter
   - `paginate(heights, pageLines)` → spacer lines before each node that starts a new sheet
   - nodes move whole, and a node taller than a page starts its own page
7. **Pages layout on the canvas:**
   - Paper gains `layout: 'pageless' | 'pages'`, `size: 'a4' | 'letter'`, `pageNumbers`.
   - The canvas draws sheets behind the main column.
   - A TipTap decoration plugin adds spacer widgets at the breaks. They are decorations only, so they are never in the saved document.
8. **Print and PDF:**
   - A print-only portal renders the reading order (main column, side blocks after their line, anchored ink).
   - `@page` size and margins come from the layout. Page numbers use `@page` margin boxes.
   - Save as PDF and Print are in the ⋯ menu, and Ctrl+P works.
9. **Images:**
   - an `image` node with width handles, a caption and alt text
   - shrink to 2000 px WebP/JPEG
   - local blob table `images` (device-only, not synced)
   - Imgur upload queue (`VITE_IMGUR_CLIENT_ID`); delete hash kept on the node
   - first-use consent dialog (synced `imgurConsent`)
   - paste, drop and Insert (letter M)
   - "Delete image" removes it from Imgur after the undo window, and purging a page deletes its images
10. **Share links for Pages:**
    - shares `kind` gains `sheet` (migration); the payload is the page with its blocks, plus ink when the owner ticks "Include my drawing"
    - the shared view is read-only
    - "Save to my library" copies it in, with fresh ids
11. **Deferred minors:**
    - grips, bookmarks and the rendered equation are keyboard-operable
    - `aria-activedescendant` on the / menu
    - a selected link card can't be typed over
    - `/write/my-blocks` shows "not found"
    - empty quote and code blocks are cleared like empty paragraphs
    - folder counts include pages
12. **Docs:** HANDOFF, ROADMAP, and a QC checklist `docs/feedback/2026-10-0x-pages-round-3.md`.

## Ledger
- Task 1: complete (6abe316). Stroke maths in `sheets/ink.ts`, 23 tests.
  - Ruling: a line is any stroke that stays within 8% of its chord, rather than going by chord/length. A shaky hand made the length test reject straight lines. Cost if wrong: an S-curve that is nearly straight snaps to a line; hold-to-shape is opt-in per stroke.
- Task 2: complete (6abe316). `sheet_ink` (Dexie v6, Supabase migration, RLS checks).
  - Ruling: the sync engine skips a table the server doesn't have yet (PGRST205/42P01) and keeps its rows queued. Shipping the app before Shrey runs the migration then doesn't break sync. Cost if wrong: a typo'd table name would also be skipped silently, though tests cover every SPECS entry.
- Task 3: complete (6abe316). Undo covers ink. Deleting blocks takes their anchored ink in the same batch.
- Task 4: complete (6abe316).
  - Ruling: pen sizes are world px, so zooming in makes lines look thicker, like paper. Cost if wrong: one multiplier.
  - Ruling: a selection holding only strokes moves freely; one with blocks snaps to the grid.
  - Ruling: My blocks keeps ink drawn on the saved blocks, not loose ink nearby.
  - Ruling: the minimap doesn't show ink.
  - Ruling: rub-out database writes are chained within a gesture. Unchained, a piece could be deleted before it was saved and then reappear (found in the browser).
- Task 5: complete. Read view draws block ink.
- Task 6: complete (b00446f). `sheets/pages.ts`, 6 tests.
  - Ruling: pagination also runs in px (the gap passed in px), so sheets stay aligned when a node isn't whole lines.
  - Ruling: a paragraph moves to the next sheet whole, rather than splitting across sheets. It's simpler, and a paragraph taller than a sheet runs on. Cost if wrong: a split-paragraph layout later.
- Task 7: complete (b00446f). Spacers are ProseMirror widget decorations, so they never enter the document (checked: the JSON has no gaps). Sheets draw the paper's lines; the desk around them doesn't.
- Task 8: complete (b00446f).
  - Ruling: print renders read-only editors into an off-screen portal and hides the rest of the app in print media, so maths, plots and code print exactly as shown. Page numbers use `@page` margin boxes (Chrome 131+; other browsers print without them).
  - Ruling: printing is always light paper with no ruled lines.
- Task 9: complete (342e85e).
  - Ruling: there is no Imgur client id yet, so pictures stay local and say "On this device only". The consent dialog appears only once a client id exists. Uploads also need consent.
  - Ruling: SVG is refused (it can carry scripts, and Imgur rejects it).
  - Ruling: the delete hash is never rendered to clipboard HTML. A picture removed from the text is deleted from Imgur 15 s later unless it's back (undo, cut+paste, another block). Purging a page deletes its pictures.
  - Ruling: implementation was written before its tests ran red. The test file covers fitWithin, imageFiles and publicDoc.
- Task 10: complete (342e85e).
  - Ruling: shared pages are validated with zod. Colours must be plain hex because they end up in CSS. Image src must be an i.imgur.com URL, so a shared page can't make a viewer's browser call a tracker. Delete hashes and local-only pictures are stripped. Ink is included only when "Include my drawing" is ticked.
- Task 11: complete (342e85e, 3fddc29). All six deferred minors are done.
- Final review: self-review (no reviewer subagent; the user hasn't asked for subagents this session). It found and fixed a stroke left half-drawn when released outside the window (3fddc29).
