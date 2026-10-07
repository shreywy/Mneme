# Sub-pages, boxes and Google Drive import

Approved in conversation on 2026-10-07. Preview: https://claude.ai/artifact/MBWmk1XV5Z7foLAgrWxfJU

## What Shrey asked for

- A page (Pages, the user's own writing) can hold other pages. Adding a new page inside one, or moving an existing page into it, nests it under that page in the sidebar.
- Inside a page, boxes group the sub-pages, e.g. CPS721 has boxes "Week 1" and "Week 2", and each box holds chapter pages. The sidebar shows the same tree: CPS721 › Week 1 › Ch 1. He organizes it himself.
- Opening a sub-page from its card: the card grows from where it sits until it fills the page area. A folded corner on the sub-page goes back.
- Import a zipped Google Drive folder: folders keep the tree, and documents (Word, PDF, text) become pages. A Drive folder becomes a page that can hold an overview.

## Decisions

- **Pages hold pages**, at any depth (Notion style). Folders and units stay as they are, for sorting at the top level.
- **Only Pages (sheets) nest.** Decks and notes pages don't become sub-pages in this round.
- **Two ways to connect pages:** putting a page in a box moves it there (it has one place in the tree); a `[[` link in text points at any page without moving it.
- **Imports convert files into normal pages.** The original files aren't kept. Word documents keep their pictures; PDFs come in as text only.

## 1. Data

`SheetRow` gets two optional fields (synced inside the existing `doc` JSON, so no migration):

```ts
parentId?: string   // the page this one is under
box?: string        // the id of the box block on the parent that shows it
```

- A sub-page's own `folderId` and `unit` are ignored and written as `null`. Its folder is its top page's folder, so moving CPS721 to another folder is one write.
- `rank` orders pages inside a box, the same field the sidebar already uses for hand order.
- **Missing parent** (deleted on another device, or not synced yet): the page shows at the top level of the library, with no folder. Nothing is lost.
- **Missing box** (the box block was deleted elsewhere): the page shows under its parent with no heading in the sidebar. When the parent is opened in the editor, sub-pages whose box has been missing for over a minute move into its last box (or a new "Pages" box), the same way `pruneLeftovers` tidies a page on open.
- **Cycles:** a move that would put a page under itself or one of its sub-pages is refused, in the data layer, with a toast.
- `sheets` gets a Dexie index on `parentId` (db version 7), so a page's sub-pages are one indexed query.
- Pure helpers live in `src/sheets/tree.ts` (new, unit-tested): `parentsOf`, `rootOf`, `ancestors`, `subtree`, `wouldCycle`.

## 2. Boxes on the canvas

- `SheetBlock.kind` gains `'box'`. `data.label` is the box title (may be empty; shown as "Pages").
- The box is moved and resized like a text block, snaps to the grid, and goes through the same undo history.
- **Its cards are not stored in the box.** The box reads `sheets where parentId = this page and box = this block id`, ordered by `rank`, with a live Dexie query. The box and the sidebar can't disagree.
- A card shows the page title (serif), its first line of text, and "n sub-pages" when it has some. It has a small folded corner as the "this is a page" sign.
- Box actions:
  - **+ New page:** creates a sheet with `parentId`, `box`, default paper, and opens it.
  - **Add existing…:** a page picker (search over all sheets, minus this page and its ancestors). Picking one moves it into the box.
  - Drag a card to reorder, or into another box on the same page.
  - Right-click a card: Open, Rename, Move out a level, Delete.
- **Deleting a box** asks: "Delete the box and its 3 pages" or "Keep the pages" (they move into another box on the page, or a new "Pages" box if none is left).
- **Read view** (phones): a box is its title as a heading and its cards as a list.
- **Print and shares:** a box is turned into a plain text block first (its title as a heading, its page titles as a list), so print, the share payload and its schema need no new block kind. Sub-pages aren't part of a share.
- Insert panel and `/` menu get "Box" (new box with an empty title, focused for typing).

## 3. Sidebar and library

- A page with sub-pages gets a chevron; open state is kept with the existing `openFolders` setting (page ids sit beside folder ids).
- Under an open page: sub-pages grouped by box, in the box's canvas order (top to bottom, then left to right). Each named box shows as a small heading in the `tunit` style.
- **Drag and drop:**
  - Onto a page row makes the dragged page a sub-page of it, at the end of its last box (a "Pages" box is made if it has none).
  - Onto a box heading puts it at the end of that box.
  - Between rows reorders.
  - Onto a folder or the Folders header makes it a top-level page again.
  - Decks and notes pages can't be dropped onto a page.
- **Right-click a page:** "New sub-page" and, for sub-pages, "Move out a level" (to the parent's parent, or the top level).
- The path to the open page is kept expanded, like folders now.
- **Library and folder views** list only top-level pages. Folder counts include sub-pages.
- **Library search** finds sub-pages and shows their path under the title (CPS721 › Week 2).
- **Delete and archive** of a page with sub-pages ask once: "Also delete its 6 sub-pages" (the default) or "Keep them" (they move up a level into the parent's place). Recently deleted and Archive restore the whole tree together; restoring a sub-page whose parent is gone puts it at the top level.

## 4. Links

- Link cards to decks and pages already exist (`linkCard`, "Link a deck or page" in Insert). Phase 2 adds an inline chip version: typing `[[` in a text block opens a page search (the existing suggestion setup from the `/` menu). Picking a page inserts an inline `pageLink` node holding the page id. The label is read live from the page, so renames carry over.
- Clicking a link opens the page with the grow animation from the chip.
- A link to a page that's deleted or missing shows its last known title struck through and does nothing.
- Shares, print and clipboard HTML show the title as plain text.
- Also in the Insert panel as "Link to page".

## 5. Opening and going back

- **Grow:** when a page is opened from a card, a link, a sidebar row or a path crumb, the clicked element grows from where it sits straight to the full page area (no stop in the middle). About 520 ms, eased out. It should look like the card itself becoming the page: the card's own text scales up with the box and fades out by 40%, while the page's text starts scaled down to the card's width and grows with the box, fading in from 20% to 70%. The clicked card is hidden while this runs, and the page under it dims slightly.
- **Back:** the page shrinks straight into its card on the parent (about 460 ms). If the parent has no card for it, it shrinks toward the middle and fades.
- **How it's done:** the View Transitions API. The clicked element and the page sheet share `view-transition-name: page` for that one navigation. The browser's default group animation already morphs the source rect into the sheet; only its duration and easing are set in CSS on `::view-transition-group(page)`, kept as constants that are easy to tune. The browser's default old/new image pseudo-elements already scale with the group and cross-fade, which gives the text effect above; their fade timing is set on `::view-transition-old(page)` / `::view-transition-new(page)`. Navigation goes through React Router's `viewTransition` option with `flushSync` so the new page is rendered when the browser snapshots it.
- **Fallbacks:** browsers without the API, and `prefers-reduced-motion`, switch instantly.
- **Folded corner:** sub-pages show a folded top-left corner, fixed to the page area (not the canvas world). Hover or keyboard focus grows the fold and shows "Back to CPS721". Click or Alt+← goes back. It's a real button with an aria-label.
- **Path bar:** the top bar shows the path (CPS721 › Ch 3 · Prolog basics › Practice set 3), each part a link.

## 6. Google Drive import

### Input

- Opened from a new "Google Drive folder" choice in the Import dialog, and from right-clicking a page ("Import a Drive folder here").
- The user drops one or more `.zip` files (Drive splits large folders into `-001.zip`, `-002.zip`, merged by path), or picks a folder with `<input webkitdirectory>`.
- **Reading zips:** a small reader in `src/importdrive/zip.ts` reads the central directory (and zip64 fields) and inflates entries with the browser's `DecompressionStream('deflate-raw')`. Stored entries are read as is. No zip library.

### Limits (zip bombs and huge folders)

- At most 2,000 entries.
- At most 50 MB uncompressed per file, and 300 MB in total. The size is checked from the directory first, then counted while inflating, and stopped when exceeded.
- File names are only used as titles and for the tree. They are trimmed to 200 characters, have control characters removed, and `__MACOSX/` and dotfiles are dropped.

### Mapping

| Drive item | Becomes |
|---|---|
| Folder | A page titled with the folder name: an empty main block for an overview, and one unnamed box holding its contents (sorted by name, folders first) |
| `.docx` (Google Docs download as this) | A page; headings, lists, tables, bold/italic/underline, links and pictures kept |
| `.pdf` | A page of text; paragraphs rebuilt from line positions, lines in a larger font than the body become headings |
| `.txt`, `.md` | A page; Markdown goes through the existing Markdown → editor path used by smart paste |
| `.xlsx`, `.pptx`, `.gsheet`, images, anything else | Skipped, listed with the reason |

- The zip's root folder becomes the top page. It goes in the chosen folder, or into a new "Imported" box on the chosen page.

### Converting

- `.docx` goes through `mammoth` to HTML, then TipTap's `generateJSON` with the app's own extension set. Only what the schema allows survives, which is the sanitiser (the converted HTML never reaches the DOM). Pictures arrive as data URLs. They go through the existing picture path (shrink, local `images` table, upload to the private bucket when signed in) and the node keeps the local id.
- `.pdf` goes through `pdfjs-dist`'s text content, worker served from the app's own origin. CSP needs `worker-src 'self' blob:` checked.
- Both libraries load only when an import starts (dynamic `import()`), so the main bundle doesn't grow.
- Long documents: a text block's doc is split at top-level node boundaries into several text blocks, stacked down the page. Each block's synced row stays under 200 KB, below the server's 256 KB per-row check.

### The dialog

1. Drop the zip(s) or pick a folder.
2. Preview tree: a checkbox per item, folders labelled "page with sub-pages", skipped items crossed out with their reason. Under it: "9 pages (3 from folders, 6 from files) · about 0.9 MB of your 20 MB · 2 files skipped". If it won't fit in the remaining space, the Import button is disabled and the dialog says how much to free up.
3. Destination select: a folder, no folder, or inside a page (page picker).
4. Import: a progress bar and "Reading Lecture 2 - Logic.pdf… 6 of 9". Pages are written one at a time as they finish. A file that fails to convert is skipped and listed, without stopping the rest.
5. Done: a summary and an "Open CPS721" button.

## Testing

- **Unit (Vitest):**
  - `tree.ts`: cycles, missing parents, ordering, subtree.
  - Moving pages: into a box, out a level, delete and restore with sub-pages.
  - Zip reader: stored, deflate, zip64, a bomb that lies about its size, a truncated file.
  - Drive mapping: the tree, skips, name cleaning.
  - docx to editor JSON: headings, lists, tables, a `<script>` and an `onerror` in the source never surviving.
  - PDF line grouping and headings, with a fixture text-content array.
  - Splitting long docs.
- **Fuzz (fast-check):** the zip reader on random bytes refuses or returns entries, and never hangs or throws an uncaught error.
- **Fixtures:** a small real Drive zip in `fixtures/drive/` (made by hand from public-domain text, never private files).
- **QC in the browser after each phase:**
  - Phase 1: make CPS721 with two boxes and sub-pages, drag them around the sidebar, delete and restore.
  - Phase 2: the grow and back animations, with reduced motion on and off.
  - Phase 3: import the fixture zip and a real Drive download.

## Phases

1. Sub-pages, boxes, the sidebar tree, the library, search, and delete/archive/restore with sub-pages.
2. Grow and back animations, the folded corner, the path bar, `[[` links.
3. Drive import.

## Not in this round

- Decks and notes pages as sub-pages.
- Sharing a page together with its sub-pages.
- Slides (`.pptx`) and spreadsheets.
- Keeping PDF pages as pictures.
- Importing straight from Google Drive with sign-in (the Drive API).
