# Handoff

Where things stand, so work can pick up later without the old conversation. Read this, then [ROADMAP.md](ROADMAP.md) (the to-do list) and the spec for whatever's next.

_Last updated 2026-10-02._

## Where we are

- **Live:** https://mnemee.pages.dev, auto-deployed from `main` (Cloudflare Pages). Everything below is merged and deployed.
- **Current feature:** Text notes ("Pages"), the user's own writing pages. Phases 1 and 2 are built, plus two rounds of Shrey's feedback.
- **Waiting on:** Shrey's QC of [feedback/2026-10-02-pages-round-2.md](feedback/2026-10-02-pages-round-2.md), 39 items. He fills in notes under each one and sends the file back. Item 39 is an open question about what "double header" meant.
- **Then:** act on that feedback, then phase 3 (ink).

## Text notes: what's built

Spec: [superpowers/specs/2026-10-01-text-notes-design.md](superpowers/specs/2026-10-01-text-notes-design.md). Plans and rulings: [phase 1](superpowers/plans/2026-10-01-text-notes-phase1.md) and [phase 2](superpowers/plans/2026-10-02-text-notes-phase2.md). The ledgers at the bottom of each plan list every judgement call and the deferred minors.

| Phase | State |
|---|---|
| 1. Canvas and text | Done. QC round 1 done. |
| 2. Blocks and Insert | Done. QC round 2 in progress. |
| 3. Ink (pen, highlighter, eraser, lasso, shapes, palm rejection) | Next |
| 4. Images (Imgur, first-use consent popup), Pages layout, Print/PDF, share links | Later |
| 5. AI (lasso → Gemini, handwriting/maths to text) | Later |

### Where the code is

- `src/features/sheet/`
  - `SheetPage.tsx`: route `/write/:id`. Top bar (Contents, save state, Read/Canvas, ⋯ menu) and Page settings.
  - `Canvas.tsx`: the infinite canvas.
    - Pan, zoom, and the tools (Text / Select / Pan).
    - Selection frame, block and paper right-click menus, drop targets, minimap.
    - Undo history for moves, adds and deletes.
    - Drags draw from local `placed` positions and save once on drop.
  - `TextBlock.tsx`: one TipTap editor per block.
    - Debounced save.
    - Ignores database echoes of its own saves (the `sent` ring).
    - Smart paste, tile drops, the + beside empty lines, the table + buttons.
  - `Toolbar.tsx`: the formatting bar. It acts on `useSheetUI().editor`.
  - `Dock.tsx`: bottom tools, and the Insert panel (`insertNow` decides between the cursor and a new block).
  - `ReadView.tsx`: one-column view, the default on phones.
  - `editor/`
    - `extensions.ts`: the TipTap set.
    - `nodes.tsx`: the custom nodes:
      - equation, inline maths, working, plot/axes, link card, code
      - table size picker, page picker
      - the `useOpen` rules for when a node's editor opens
    - `commands.ts`: inserts, paste, `growTable`.
    - `slash.tsx`: the / menu.
    - `MathField.tsx`: MathLive, lazy-loaded, using the KaTeX fonts.
  - `store.ts`: shared UI state (active editor, tool, Insert open, canvas API) and recent inserts.
- `src/sheets/`: pure logic, all unit-tested.
  - `grid.ts`: view maths, paper CSS, `freeSpot`, `settle`.
  - `insert.ts`: the insert list and search.
  - `paste.ts`: smart-paste detection.
  - `plot.ts`: auto y range.
  - `tex.ts`: escaped KaTeX output.
  - `fonts.ts`, `history.ts`, `order.ts`, `types.ts`.
- `src/data/`
  - `sheets.ts`: pages and blocks.
  - `myblocks.ts`: My blocks, kept on a hidden page with id `my-blocks`.
  - `trash.ts`: Recently deleted. Deletes are soft for 5 days, then purged on app start.
- `src/styles/sheet.css`: all Pages styles. A page's light/dark override uses `.paper-light` / `.paper-dark` plus `.pal-*` classes.

### Decisions worth knowing

- **Block kinds:** every insert (maths, table, code, plot…) is a node inside a text block's document. Canvas blocks are only `text` and `bookmark`.
- **Grid:** each node's height rounds up to whole lines, so text stays on the paper's lines.
- **Lines:** lines sit between rows, so text is centred in each row. Headings sit on the lower of their two rows.
- **New inserts:** a just-inserted equation, plot or working opens its editor through a one-off `openToken` on the node, not through node selection. Node selection made ProseMirror steal focus back.
- **Toolbar focus:** the toolbar keeps its block when focus goes "nowhere", which is what happens when a dropdown opens. It lets go when you click the paper or another block.
- **Deleting:** deleting any deck, notes page or page goes to Recently deleted (Archive page) with an Undo toast. It's purged after 5 days.

## How to work on it

- `npm run dev` (Vite), `npm test` (Vitest, 233 tests), `npm run build`, `npm run test:db` (RLS tests against local Supabase).
- **Database migrations:** Shrey runs `npx supabase db push` himself. Phase 2 needed none.
- **Installing packages:** use `npx npm@10.9.2 install …`. Cloudflare builds with `npm ci` on npm 10.9.2. A lockfile written by npm 11 failed there, and phase 1 silently never deployed until that was fixed.
- **After every push,** check the "Cloudflare Pages" check run, not just the local build:

  ```bash
  gh api repos/shreywy/Mneme/commits/$(git rev-parse HEAD)/check-runs --jq '.check_runs[] | "\(.status) \(.conclusion)"'
  ```
- **Git rules** (from Shrey):
  - Commits are his identity only.
  - No AI attribution anywhere: commits, PRs, README or code comments.
  - Only push when the app works.
  - Don't commit `.env.local` (it holds his Gemini test key) or `fixtures/private/`.
- **Process:** big features get a preview and a written design for Shrey to approve first. Small single asks are built straight away. Each phase ends with a QC checklist file in `docs/feedback/` for Shrey to fill in.

### Gotchas from this round

- **Shell heredocs on this Windows setup swallow backslashes.** That breaks regexes and LaTeX in tests. Write those files with the editor or a script file instead.
- **The dev server can go stale:** its file watcher stops and it serves old code. Kill the `vite` node process on port 5178 and restart. Stopping the shell alone leaves node running.
- **The in-app browser pane often doesn't draw or deliver focus events when hidden.**
  - Screenshots time out, `requestAnimationFrame` and ResizeObserver don't fire, and `element.focus()` doesn't trigger TipTap's focus handler.
  - Typing through the automation re-focuses the page first, so it isn't a good test of focus inside the maths field.
  - Prefer DOM checks and `view.hasFocus()` over `editor.isFocused`. Ask Shrey to check real mouse and keyboard behaviour.
  - Phone-sized panes make pages open in Read view; set the viewport to about 1100×680 for the canvas.

## Open and deferred

- **Shrey's round 2 answers** (the checklist), then phase 3.
- **Couldn't reproduce:**
  - the stuck hand cursor (drags are now guarded)
  - deleted pages coming back blank when signed in (soft delete should avoid it)
  - "Like the app" snapping back to Light when signed in (now stored explicitly as "app")

  Watch for any of these in his feedback.
- **Deferred minors:**
  - Grips, bookmarks and the rendered equation aren't keyboard-operable.
  - The / menu has no `aria-activedescendant`.
  - A selected link card can be replaced by a key press (undo restores it).
  - Opening `/write/my-blocks` by URL shows the hidden page.
  - Empty quote/code blocks aren't cleared.
  - Folder counts ignore pages.
- **After Text notes:** security and engineering items for the portfolio (CSP, fuzz tests, audit log, threat model, CodeQL, E2E-encrypted decks, Yjs, performance budget). Then AI (Gemini), a full end-to-end pass, v1, and the desktop app. See the roadmap.
