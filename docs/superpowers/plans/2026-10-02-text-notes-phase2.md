# Text notes phase 1 feedback + phase 2 (blocks and Insert)

**Spec:** [text notes design](../specs/2026-10-01-text-notes-design.md). Feedback from Shrey's phase 1 QC (2026-10-02) comes first.

## Rulings

- Every insertable thing (equation, table, code, working, plot, axes, link card) is a TipTap node inside a text block, not its own canvas block kind. Inserting "at the cursor" then just works, the block grows like a doc, and a tile dropped on empty paper makes a new text block holding that node. Canvas block kinds stay `text` plus `bookmark`. Each node's height is a whole number of lines so text after it stays on the grid.
- My blocks live in a hidden page (`id: my-blocks`, `hidden: true`) instead of a new table: same sync, storage count and RLS as other pages, no migration.
- Image and diagram tiles wait for phases 4 and 3 (Imgur consent, shape tool).
- Fonts are self-hosted with @fontsource, loaded only in the page chunk (no third-party requests).
- Lines are drawn at row boundaries so text sits centred in each row (Shrey: text was too close to the line).

## Tasks

1. Canvas input: middle-drag and Space+drag pan; tools (Text, Select, Pan) in a bottom dock; cursor fix; "Recenter page".
2. Paper: lines at row boundaries; default text size fits the line (0.64 × spacing); page theme (app, light, dark); page font.
3. Formatting toolbar (top of the canvas): undo/redo, H1–H3, font, size, B/I/U/S, highlight, colour, lists, checklist, quote, code, link, maths, delete block.
4. Blocks: click a grip to select; Delete; right-click a block (delete, duplicate, bring to front); one handle for a multi-selection.
5. Bookmarks (`bookmark` blocks) and a Contents list (headings + bookmarks) that jumps there.
6. Nodes: inline maths `$…$`, equation `$$` (KaTeX, MathLive editor), code (highlight + language + copy, ``` fixed), table (TipTap table), working, plot, axes, link card.
7. Insert panel (I, dock button, + beside an empty line): search, recents 1–4, letters, drag onto the page; slash menu with the same list.
8. Smart paste (table, LaTeX, code, Mneme link) with "Paste as plain text".
9. My blocks: save selected blocks, insert them from the panel.
10. Read view keeps up (bookmarks hidden, nodes render), tests, build, browser pass, feedback checklist file.

## Ledger
- Tasks 1–10: built 2026-10-02 (commits 0b0c… to the branch head), tests 221/221, build green, checked in the browser (desktop and phone sizes).
- Ruling: a just-inserted maths/plot/working opens through a one-off token on the node, not a node selection. A node selection made ProseMirror take focus back from the maths field and let a key press replace the node. Cost if wrong: the token attribute is briefly in the doc (cleared on mount).
- Ruling: a node only opens from a selection made while its block has focus. TipTap marks atom nodes selected whenever the selection covers them, even unfocused (a block starting with an equation opened it on load).
- Ruling: a block ignores database echoes of its own recent saves and never takes outside changes while the toolbar is acting on it. A late echo of an older save was replacing text and moving the cursor while a toolbar dropdown had focus.
- Ruling: Read view gets the toolbar and Insert, so phone edits aren't limited to markdown shortcuts (spec: "the Edit button opens the keyboard toolbar").
- Note: the stuck hand cursor couldn't be reproduced; drags now always end (explicit capture release, window-level pointerup and blur fallbacks).
