# Text notes: design

Status: draft approved by Shrey on 2026-10-01 ([draft canvas](https://claude.ai/artifact/CxCD9ntPzai9YCrkPrjdco)). This spec writes that draft down so it can be built in phases.

## What it is

A third page type next to decks and notes: a page the user writes themselves. In the app it's called a **Page** (sidebar label "Page", route `/write/:id`, internal name `sheet` so it can't be confused with the existing `Page` union in `data/pages.ts`). It lives in folders and units like decks and notes, can be linked to decks, shared, archived and deleted the same way.

Desktop is the main way people will use it. Phones get a good reading view and quick edits.

## Decisions from the review

| Question | Answer |
|---|---|
| Default line spacing | 28 px ("College"). Compact 24 and Wide 32 are options. |
| Phone default | Read view, with a floating Edit button and tap-a-paragraph-to-edit. Canvas view for drawing. |
| Does ink snap to the grid? | No. Only shapes made by holding at the end of a stroke snap. |
| Default layout | Pageless. Pages (A4 or Letter) is an option in Page settings. |
| Print and PDF | One-click Save as PDF and Print, best in Pages layout; also in the ⋯ menu and on Ctrl+P. |

## The canvas

- Infinite in every direction. World coordinates are in **grid units** (one unit = the line spacing, 28 px by default); (0, 0) is the start, the top-left corner of the first view. Negative coordinates are allowed.
- **Back to start** returns to (0, 0) at 100%. Zoom 25%–400% with Ctrl+wheel, pinch, or the zoom control; pan with wheel/trackpad, Space+drag, middle-drag, or one finger on touch.
- **Minimap** in the bottom-right shows every block as a box, the current view, and the start.
- **One grid.** Every block's top-left sits on a grid point; its height is a whole number of lines. Text inside blocks uses the line spacing as its line height, so text in two blocks side by side shares baselines. Hold Alt while dragging to place freely.
- **Main column.** A new page opens with one text block at (3, 2), 24 units wide. It grows downwards like a Google Doc. Click anywhere empty to start another text block there (OneNote style), snapped to the grid.
- **Margin notes** aren't a separate feature: any block placed beside another is attached to the line it starts on, so Read view and Pages layout can put it right after that line.
- **Selecting several things.** Shift+drag on empty paper draws a selection box; Shift+click a block's grip adds or removes it. Drag any selected block's grip and they all move together, keeping their spacing on the grid. Delete removes them, Esc clears the selection, and one undo puts them all back. (With the Select tool from phase 2, a plain drag on empty paper selects instead of panning; once ink exists, the box takes strokes too.)
- Blocks never overlap automatically; a block that grows into another pushes nothing but shows a faint outline where they touch. (Revisit after use.)

## Paper

Page settings → Paper: lines (none, ruled, dots, squares), spacing (24/28/32), line strength, line colour (theme grey, blue, green, custom), red margin line, paper colour (follow theme, white, cream, custom), and "use these for my new pages". Lines are drawn with CSS backgrounds tied to the world origin, so they scroll and zoom with the content. Dark themes get light lines on dark paper.

## Blocks

Each block: `{ id, sheetId, x, y, w, h, kind, data, z, updatedAt }` with x, y, w, h in grid units.

| Kind | Notes |
|---|---|
| text | Rich text: headings, bold/italic/underline/strike, links, lists, checklists, quotes, inline maths, highlights. Built on TipTap (ProseMirror). |
| equation | Display maths. KaTeX to render; MathLive for visual editing (lazy-loaded). Raw LaTeX while the cursor is inside, rendered when it leaves. |
| working | The existing derivation block (steps with reasons). |
| plot | The existing plot block; edited by typing `y = …` and a range. |
| figure, diagram | The existing figure block (SVG allowlist); diagram is boxes and arrows drawn with the shape tool. |
| table | Rows are one line tall; cells can hold inline maths. Tab/Enter navigation. Paste from Sheets/Excel. |
| code | Syntax highlighting (highlight.js with a common set of languages, lazy-loaded), language picker, copy. |
| image | See Images below. |
| link | A card that opens a deck, notes page or another Page. |

The existing notes renderers (derivation, plot, figure, KaTeX) are reused for display; Text notes adds editors for them.

## Insert

- **Insert panel** (button in the toolbar, `I`, or `+` in the margin of an empty line): search box, the last four blocks as `1`–`4`, a tile per block with its letter (E equation, P plot, T table, M image, W working, D diagram, C code, K checklist, A axes, L link, Q quote/divider), and My blocks.
- Letter or click inserts at the cursor; dragging a tile drops it where you let go, with a snapped ghost.
- **Slash menu** in text: the same list, filtered as you type.
- **Markdown shortcuts** at the start of a line: `#`, `##`, `###`, `-`, `1.`, `[]`, `>`, `---`, ```` ``` ````, `$$`, `|a|b|`, `$…$` inline, `[[` to link.
- **Smart paste**: image → image block; spreadsheet cells → table; LaTeX → equation; code from an editor → code block; a Mneme link → link card. A toast offers "Paste as plain text".
- New blocks land sized to whole lines with the cursor in the first field.
- **My blocks**: select blocks (and their ink) → Save as my block. Stored per account, synced.

## Ink

- Tools: pen (three colour slots in the bar), highlighter, eraser (whole stroke / just what I rub), lasso, shapes.
- Pen settings: colour, thickness presets and slider, pressure, smoothing, hold-to-shape, "only the pen draws, fingers scroll" (palm rejection on touch screens).
- Strokes rendered with `perfect-freehand` as SVG paths. Points are stored quantised to 0.25 px and delta-encoded to keep pages small.
- A stroke drawn mostly over a block is **anchored** to it (stored relative to the block, moves and resizes with it). Others are anchored to the canvas.
- Highlighter strokes over text straighten to the line and draw behind the text.
- Lasso: move, copy, recolour, delete. Ask Gemini is shown disabled until AI exists.
- Undo/redo covers ink and blocks together (Ctrl+Z / Ctrl+Shift+Z; two-finger tap on touch).

## Images

Mneme doesn't store image bytes. On paste or insert, the image is shrunk (longest side 2000 px, WebP/JPEG) and kept in IndexedDB until it's uploaded to Imgur (anonymous upload with Mneme's client id). The block stores the Imgur URL and its delete hash; deleting the block deletes the image from Imgur. Without a network or client id, the image stays local and uploads later.

The first time someone adds an image, a dialog explains that images are hosted on Imgur and anyone with the exact link can open them, with a checkbox to agree. Nothing uploads until it's ticked; cancelling removes the pasted image. The agreement is stored in synced settings, so it's asked once per account (once per browser for guests).

## Layouts and printing

- **Pageless** (default): the canvas as described.
- **Pages**: the same blocks laid out on A4 or Letter sheets with margins. Text reflows across page breaks; a block that would be split moves to the next sheet, taking its ink. Blocks outside the main column stay beside the sheets and don't print. Optional page numbers.
- **Save as PDF / Print**: renders the sheets (or, in pageless, the main column and anything attached to it) into a print-only document with `@page` size and margins, then opens the browser print dialog. Save as PDF uses the browser's own PDF output, so text stays selectable.

## Phone

- Read view by default: one column, margin notes after their line, ink stays on its block.
- Tap a paragraph to edit it in place. The Edit button opens the keyboard toolbar (bold, list, maths, Insert).
- Canvas view for drawing and moving things.

## Sync and storage

- Dexie version 5 adds `sheets`, `sheetBlocks`, `sheetInk`, `myBlocks`. Matching Supabase tables (`sheets`, `sheet_blocks`, `sheet_ink`, `my_blocks`) are created by the same `_mneme_sync_table` shape, with owner-only RLS, the storage-count trigger and RLS tests.
- Rows sync one block or stroke at a time, last write wins per row, through the existing engine (new `SPECS` entries).
- All of it counts toward the account's 20 MB. A typical page with text, a few plots and some ink is 20–80 KB.
- Share links: a Page can be shared like decks and notes (read-only copy, no ink unless the owner ticks "include my drawing").

## Phases

1. **Canvas and text**: page type in the library, sidebar and folders; canvas with pan, zoom, start, minimap; paper settings; text blocks with markdown shortcuts; move and resize on the grid; undo; sync tables and tests; Read view on phones.
2. **Blocks and Insert**: Insert panel, slash menu, equation (KaTeX + MathLive), table, code, working, plot, figure, link, checklist; smart paste; My blocks.
3. **Ink**: pen, highlighter, eraser, lasso, shapes, anchoring, palm rejection.
4. **Images, Pages layout, print and PDF**, share links for Pages.
5. **With AI**: lasso → Ask Gemini, handwriting to text, maths to LaTeX.

Each phase ships working on its own and gets a QC pass with Shrey before the next.

## Testing

- Unit: grid snapping and anchoring maths, stroke encoding round trip, smart-paste detection, Pages pagination, block schema validation (zod), storage size estimates.
- Database: RLS and storage-count tests for the new tables in `supabase/tests/rls.sql`.
- Browser checks on desktop and phone sizes after each phase.

## Not included

Notion-style databases, Heptabase-style card linking, audio recording, real-time collaboration with other people. Concurrent edits from two of your own devices resolve per block (last write wins); a CRDT (Yjs) could replace that later and is listed under Engineering.
