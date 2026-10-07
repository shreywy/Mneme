# Handoff

Where things stand, so work can pick up later without the old conversation. Read this, then [ROADMAP.md](ROADMAP.md) (the to-do list) and the spec for whatever's next.

_Last updated 2026-10-07 (Drive import, sub-pages phase 3)._

## Where we are

- **Live:** https://mnemee.pages.dev, auto-deployed from `main` (Cloudflare Pages). Everything below is merged and deployed.
- **Current feature:** Text notes ("Pages"), the user's own writing pages. Phases 1–4 are built: everything but AI, which is phase 5. Plus two rounds of Shrey's feedback.
- **Shrey needs to run `npx supabase db push`** for four migrations from 2026-10-06, then `npm run test:db`:
  - `20261009000000_pictures.sql`: the private `pictures` bucket. Until then, signed-in pictures stay on the device and say "Upload failed".
  - `20261009000100_rate_limits.sql`: 30 share publishes an hour.
  - `20261009000200_devices_and_activity.sql`: `my_sessions()`, `end_session()`, `account_events`. Until then the Account page hides those cards.
  - `20261009000300_two_step.sql`: restrictive `aal2` policies once an account has an authenticator.
  - The SQL tests for these (storage objects, auth.sessions and auth.mfa_factors inserted directly) have never run against the server. If one fails for a setup reason rather than a policy reason, fix the test.
- **Imgur is on hold** (no client id). Signed-in pictures use the private bucket instead; the Imgur path stays for signed-out use.
- **No QC checklist files any more.** Shrey asked (2026-10-06) for QC to be done here and reported, not handed over as a file.
- **Not yet tried signed in:** picture upload/download between devices, signed picture links in a share, the devices and activity cards, two-step setup and the code prompt. Everything else was checked in the browser.
- **Sub-pages and Drive import** ([spec](superpowers/specs/2026-10-07-subpages-and-drive-import-design.md), [preview](https://claude.ai/artifact/MBWmk1XV5Z7foLAgrWxfJU)): all three phases done 2026-10-07 ([plan 1](superpowers/plans/2026-10-07-subpages-phase1.md), [plan 2](superpowers/plans/2026-10-07-subpages-phase2.md)).
- **Then:** AI (phase 5), or end-to-end encrypted decks (designed below, waiting on Shrey's call).

## Text notes: what's built

Spec: [superpowers/specs/2026-10-01-text-notes-design.md](superpowers/specs/2026-10-01-text-notes-design.md). Plans and rulings: [phase 1](superpowers/plans/2026-10-01-text-notes-phase1.md), [phase 2](superpowers/plans/2026-10-02-text-notes-phase2.md) and [phases 3–4](superpowers/plans/2026-10-02-text-notes-phase3-4.md). The ledgers at the bottom of each plan list every judgement call and the deferred minors.

| Phase | State |
|---|---|
| 1. Canvas and text | Done. QC round 1 done. |
| 2. Blocks and Insert | Done. |
| 3. Ink (pen, highlighter, eraser, lasso, shapes, palm rejection) | Done. |
| 4. Images (private bucket; Imgur on hold), Pages layout, Print/PDF, share links | Done. |
| 5. AI (lasso → Gemini, handwriting/maths to text) | Later |

### Where the code is

- `src/features/sheet/`
  - `SheetPage.tsx`: route `/write/:id`. Top bar (Contents, save state, Read/Canvas, ⋯ menu) and Page settings.
  - `Canvas.tsx`: the infinite canvas.
    - Pan, zoom, and the tools (Text / Select / Pan).
    - Selection frame, block and paper right-click menus, drop targets, minimap.
    - Undo history for moves, adds and deletes.
    - Drags draw from local `placed` positions and save once on drop.
  - `Ink.tsx`: the two SVG ink layers (highlighter behind blocks, pen in front), `BlockInk` for Read view and print, and the pen/highlighter/eraser bar.
    - The canvas runs the ink gestures (`startInk`, `extendDraft`, `finishDraw`, `eraseAt`, `finishLasso`).
    - Strokes on a block are stored relative to it, so they move with it (`worldPoints`).
  - `Print.tsx`: Print / Save as PDF. Read-only editors in an off-screen portal, plus an `@page` rule.
  - `SharedSheet.tsx`: a shared page, read-only.
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
    - `image.tsx`: the picture node.
      - Consent dialog, file picker, upload on view.
      - A cleanup plugin deletes a removed picture from Imgur after 15 s.
    - `pagebreaks.ts`: Pages layout. Widget decorations push the next node onto the next sheet, never saved.
  - `store.ts`: shared UI state (active editor, tool, Insert open, canvas API) and recent inserts.
- `src/sheets/`: pure logic, all unit-tested.
  - `grid.ts`: view maths, paper CSS, `freeSpot`, `settle`.
  - `insert.ts`: the insert list and search.
  - `paste.ts`: smart-paste detection.
  - `plot.ts`: auto y range.
  - `tex.ts`: escaped KaTeX output.
  - `ink.ts`: stroke encoding (0.25 px, delta), anchoring, highlighter straightening, shape recognition, rub-out, lasso, perfect-freehand paths.
  - `pages.ts`: sheet sizes and `paginate`.
  - `image.ts`: shrink sizes, accepted files, `publicDoc` (strips delete codes).
  - `sharepage.ts`: the share payload for a page, and its zod check (hex colours only, Imgur-only image src).
  - `fonts.ts`, `history.ts`, `order.ts`, `types.ts`.
- `src/data/`
  - `sheets.ts`: pages and blocks.
  - `myblocks.ts`: My blocks, kept on a hidden page with id `my-blocks`.
  - `trash.ts`: Recently deleted. Deletes are soft for 5 days, then purged on app start. A purged page also deletes its pictures from Imgur.
  - `ink.ts`: strokes (`sheetInk`, synced as `sheet_ink`).
  - `images.ts`: pictures. Kept locally in `images` (Dexie, never synced), uploaded to Imgur, deleted from Imgur when gone.
- `src/styles/sheet.css`: all Pages styles. A page's light/dark override uses `.paper-light` / `.paper-dark` plus `.pal-*` classes.

### Decisions worth knowing

- **Block kinds:** every insert (maths, table, code, plot…) is a node inside a text block's document. Canvas blocks are only `text` and `bookmark`.
- **Grid:** each node's height rounds up to whole lines, so text stays on the paper's lines.
- **Lines:** lines sit between rows, so text is centred in each row. Headings sit on the lower of their two rows.
- **Highlighter straightening** reads the text's own line boxes (`textLineMid` in `src/sheets/ink.ts`), not the grid, because headings and resized text don't fill one row. No text under the stroke: the bar stays where it was drawn.
- **Touch:** `fingers` in `Canvas.tsx` tracks every finger in the capture phase, so a second finger starts a pan/zoom (`pinchView` in `grid.ts`) even when the first landed on a block, which handles its own presses. A pen or mouse in use leaves it to palm rejection.
- **Phone canvas** (`sheet.css`, end of file): the toolbar floats over the paper (an undo/redo pill when idle, the full bar while typing) so the page doesn't shift when you start typing. Buttons marked `wide` in `Toolbar.tsx` are hidden on phones; the `narrow` Style menu replaces Text/H1–H3.
- **New inserts:** a just-inserted equation, plot or working opens its editor through a one-off `openToken` on the node, not through node selection. Node selection made ProseMirror steal focus back.
- **Toolbar focus:** the toolbar keeps its block when focus goes "nowhere", which is what happens when a dropdown opens. It lets go when you click the paper or another block.
- **Deleting:** deleting any deck, notes page or page goes to Recently deleted (Archive page) with an Undo toast. It's purged after 5 days.
- **Ink:**
  - One row per stroke.
  - Pen sizes are world px.
  - A stroke with 60% of its points over a text block is anchored to it.
  - Undo is one history for blocks and ink (`sheets/history.ts`).
- **Pictures:** Mneme never stores picture bytes on its servers. The Imgur delete hash lives in the synced doc but is stripped from share links and from clipboard HTML.

## Sub-pages: what's built (phase 1)

- **Data:** `SheetRow.parentId` (the page above) and `SheetRow.box` (the box block on that page). They sync inside the existing JSON, so there's no server migration. Dexie v7 indexes `sheets.parentId`.
- `src/sheets/tree.ts`: pure tree helpers.
  - `parentsOf` skips a missing parent or a loop; those pages show at the top level.
  - `rootOf`, `ancestors`, `subtree`, `wouldCycle`.
- `src/data/subpages.ts`: `boxesOf`, `addBox`, `ensureBox` (the last box, or a new "Pages" one), `kidsOf`, `createSubPage`, `moveIntoBox` (refuses loops, returns false), `moveOutALevel`, `liftChildren`, `deleteBox`, `adoptOrphans` (pages whose box is gone, after a minute, on open).
- `src/data/pages.ts`: `pagesOf` gives a sub-page its top page's folder and no unit. `topLevel()` is what folders, the library and the sidebar list. `pagePath()` gives the titles above a page (search shows it). `PAGE_DRAG` is the drag type for sidebar rows and box cards.
- `src/features/sheet/BoxBlock.tsx`: the box on the canvas.
  - Its cards are a live query of the sub-pages; nothing is stored in the box.
  - New page, Add existing (`pickPage({ kinds, exclude, title })`), and drag to reorder or in from the sidebar.
  - The title is a draft only while focused, so undo shows straight away.
- **Canvas:** `removeSelection` asks before deleting boxes that hold pages; the old one is `removeNow`. Box titles undo through `editMark`.
- **Main column pushes things down** (`pushBelow`, `clearUnder` in `grid.ts`, `growMain` in `Canvas.tsx`).
  - The stored `h` of an existing text block isn't updated while typing (only the canvas's `heights` state is), so this follows the measured height.
  - Typing in the main column moves the blocks in its column below its top line down by what it grew.
  - On load, or for edits from another device, it only moves a box found inside the column.
- **Delete, archive and restore** work on whole trees. Rows deleted or archived together share the same `deletedAt`/`archivedAt` (`sameStamp`, `tops` in `src/data/trash.ts`). Recently deleted and Archive show only the top page with "and N sub-pages". `deleteWithUndo` and `archiveSheet` (`src/app/trash.ts`) ask through `chooseAction` (`src/ui/confirm.tsx`) when there are sub-pages.
- **Read view** lists a box's pages as links. Print and shares get boxes turned into text (`boxesAsText`, `src/sheets/box.ts`), so the share schema has no box kind.
- **Sidebar** (`Shell.tsx`):
  - Pages with sub-pages get a twist, and open state lives in `openFolders`.
  - Sub-pages are grouped by box, with headings for named boxes.
  - A drop on the middle third of a page row nests the page, and a drop on a box heading puts it in that box. The dragged kind rides along as an extra drag type (`${PAGE_DRAG}-sheet`), because dragover can't read the data.
- **Known:**
  - Undo can't bring back a box deleted together with its pages; the pages are in Recently deleted.
  - Decks and notes pages can't be sub-pages.

## Sub-pages: opening, going back, links (phase 2)

- **Grow and back:** `src/app/pagenav.ts` (`openPage`, `goBack`, `growClick`), with the timing in `src/styles/sheet.css` (`--grow-ms`, `--shrink-ms`, `--grow-ease`).
  - The app uses `<BrowserRouter>`, so React Router's `viewTransition` does nothing. `morph` calls `document.startViewTransition` itself.
  - The name `page` is set inline on the clicked element, then moved to `main.main` inside the update callback (or the other way round going back). Two elements must never hold it in the same snapshot.
  - The new page counts as ready when `[data-open="<id>"]` (on the path in the top bar) exists. Polling uses `setTimeout`, because frames are on hold during the swap and `requestAnimationFrame` never fires.
  - If the swap hasn't started after 300 ms (a window not drawing frames, like the hidden in-app pane), it skips the transition and navigates anyway.
  - Reduced motion (the OS setting or the app's own `data-motion`), or no API: plain navigation.
- **Corner and path:** in `SheetPage`.
  - `.fold-back` sits at the top left of `main`, and the toolbar moves right to make room.
  - Alt+← goes up a level; it's ignored while typing.
  - The crumbs are folder / ancestors › page. An ancestor crumb shrinks into the card on the path (`cardFor` in `src/sheets/tree.ts`).
- **`[[` links:** the inline atom `pageLink {id, title}` in `nodes.tsx`.
  - The view reads the title live and writes it back into `title` without an undo step, so copy, share and a deleted page have the last known title.
  - The `[[` menu is `PageLinkSuggest` in `slash.tsx`. It uses the same popup as `/`, with its own plugin key.
  - `publicDoc` turns links into plain text for shares.
  - Clipboard HTML is `<a data-page-link>` with no href.

## Google Drive import (phase 3)

- **Code:** `src/importdrive/`, plus the dialog in `src/features/import/DriveImport.tsx` (`useUI` dialog `'drive'`, with `drivePage` set from a page's right-click menu).
  - `zip.ts` is a hand-rolled zip reader: central directory, zip64, and `DecompressionStream('deflate-raw')`. Its limits are 2,000 files, 50 MB per file and 300 MB in total. Inflating stops at an entry's stated size, which catches zip bombs. Anything malformed is a `ZipError`, and fast-check holds it to that.
  - `tree.ts` maps paths to `DriveNode`s: names cleaned, `__MACOSX` and dotfiles dropped, several zips merged by path, a skip reason per file, and the size estimate behind the 20 MB check.
  - `convert.ts`:
    - Word goes through mammoth → HTML → `generateJSON` with `textExtensions`. The schema is the sanitiser, and the HTML is only ever parsed in DOMParser's inert document.
    - Markdown goes through react-markdown + `renderToStaticMarkup` → the same path. The app had no Markdown → editor converter; the spec assumed one.
    - PDF goes through pdf.js text runs → `pdfNodes`, which builds lines by y, paragraphs by gap, and headings at 1.2×/1.5× the body size, and drops lone page numbers.
    - `splitNodes` keeps each text block under 180 KB.
  - `write.ts` writes pages one at a time with `createSheet`/`createSubPage`, `addBox(id, '')`, `saveBlockDoc` and `addImage` + `uploadImage`. A file that fails goes in `failed`, and the rest carry on.
- **Lazy-loaded:** mammoth, pdf.js (its worker comes from `?url`, same origin) and react-dom/server only load once an import starts. The main bundle doesn't grow.
- **`package.json` override `argparse: ^2.0.1`:** mammoth's command-line tool pulls in argparse 1 → sprintf-js, which `npm audit` flags. The browser build never touches it.
- **Fixture:** `fixtures/drive/CPS721-…-001.zip`. It was made by a script from text written for it: md, docx, txt, a one-page PDF, an xlsx to skip, and Mac junk. `write.test.ts` imports it (all but the PDF, which pdf.js won't read under Node; the PDF was checked in the browser).
- **Dev only:** the first import after a fresh `npm run dev` reloads the page while Vite pre-bundles mammoth and pdf.js.
- **Known:**
  - Word pictures in formats the browser can't draw (.emf/.wmf) are dropped.
  - A PDF with no text layer (a scan) fails with "No text in it".
  - The stacked text blocks of a very long document use guessed heights.

## Site, docs, README and security (2026-10-02)

- **Introduction page:** `/about` (`src/features/site/AboutPage.tsx`). It has every feature with a real screenshot, the forgetting-curve chart, the security list and "coming next".
- **Docs:** `/docs/:topic` (`DocsPage.tsx`, markdown in `src/features/site/docs/*.md`, rendered with internal links). `<forgetting-curve></forgetting-curve>` in a doc places the interactive chart. The sidebar's ? button opens the docs.
- **Update both when AI lands:**
  - the "Coming next" section
  - the AI docs topic
  - the screenshots
- **Screenshots:** `public/site/*.webp` and `hero.jpg`, made by `scripts/screenshots/` (see its README). The README and the site use the same files.
- **Security headers:** `public/_headers`.
  - A strict CSP with no inline scripts. Card demos load `/demo-frame.html` in a sandboxed frame and get their document by postMessage, because a srcdoc frame would inherit the app's CSP.
  - Anything new that talks to another host needs adding to `connect-src` / `img-src`.
  - Check a production build with `python scripts/serve_dist.py` (port 4199), or run `npm run test:e2e`, which builds nothing itself: run `npx vite build` first.
- **`SECURITY.md`:** the threat model. Keep it true when security-relevant code changes.
- **CI** (`.github/workflows/ci.yml`): typecheck, tests, build, and a scan for secret keys in the bundle.
- **CodeQL** runs weekly and on pushes.
- **Dependabot** opens PRs weekly for npm and monthly for actions. Merge them only when CI and the Cloudflare build pass. Lockfile changes must stay npm 10 compatible.

## How to work on it

- `npm run dev` (Vite), `npm test` (Vitest, 274 tests), `npm run build`, `npm run test:db` (RLS tests against local Supabase).
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
- **Process:** big features get a preview and a written design for Shrey to approve first. Small single asks are built straight away. Each phase ends with a QC pass done here (Playwright), reported in the final message; no checklist files.

### Gotchas from this round

- **Shell heredocs on this Windows setup swallow backslashes.** That breaks regexes and LaTeX in tests. Write those files with the editor or a script file instead.
- **The dev server can go stale:** its file watcher stops and it serves old code. Kill the `vite` node process on port 5178 and restart. Stopping the shell alone leaves node running.
- **The in-app browser pane often doesn't draw or deliver focus events when hidden.**
  - Screenshots time out, `requestAnimationFrame` and ResizeObserver don't fire, and `element.focus()` doesn't trigger TipTap's focus handler.
  - Typing through the automation re-focuses the page first, so it isn't a good test of focus inside the maths field.
  - Prefer DOM checks and `view.hasFocus()` over `editor.isFocused`. Ask Shrey to check real mouse and keyboard behaviour.
  - Phone-sized panes make pages open in Read view; set the viewport to about 1100×680 for the canvas.

## Open and deferred

- **Couldn't reproduce:**
  - the stuck hand cursor (drags are now guarded)
  - deleted pages coming back blank when signed in (soft delete should avoid it)
  - "Like the app" snapping back to Light when signed in (now stored explicitly as "app")

  Watch for any of these in his feedback.
- **Deferred minors from phase 2:** all done 2026-10-02.
- **Known limits:**
  - A paragraph taller than a sheet runs across the page gap in Pages layout.
  - Page numbers in print need Chrome 131+.
  - Pictures without an Imgur client id don't reach other devices.
  - The dev server goes stale often after many quick file writes; restart it (see Gotchas).
- **After Text notes:** security and engineering items for the portfolio (CSP, fuzz tests, audit log, threat model, CodeQL, E2E-encrypted decks, Yjs, performance budget). Then AI (Gemini), a full end-to-end pass, v1, and the desktop app. See the roadmap.

## Security list (2026-10-06)

- **Pictures** (`src/sync/pictures.ts`, `src/data/images.ts`): private bucket `pictures/<uid>/<id>.<ext>`, owner-only select/insert/delete, no update, `picture_bytes()` allowance of 50 MB in the insert policy. Other devices download once into `db.images`. Share payloads get one-year signed links (`signPictures`), and `isSafePictureUrl` only accepts this project's signed links or Imgur.
- **Rate limits:** `_rate_limit(action, max, window)` with `rate_events` (no client access). Used by an AFTER trigger on `shares` (AFTER, so an upsert counts once).
- **Devices and activity** (`src/sync/devices.ts`, Account page): `my_sessions()` reads `auth.sessions`; `end_session()` deletes one (refresh tokens cascade, so the device is out within the access token's hour). `account_events` is written by `_log_event()` from triggers and functions only.
- **Two-step sign-in** (`src/features/account/TwoStep.tsx`, `account.ts`): supabase-js MFA (TOTP). `needsSecondStep()` reads `aal` from the session's token rather than calling the auth client inside `onAuthStateChange` (that can deadlock). While it's needed, sync is stopped and `SecondStepGate` covers the app. Server: `second_step_ok()` in a restrictive policy on every table, the picture/avatar folders, and the account functions.
- **Tests:** `src/content/xss.test.ts` (payload corpus, DOM-based `dangers()` checker in `src/content/dangers.testutil.ts`), `src/features/sheet/editor/shared-xss.test.ts`, `src/fuzz.test.ts` (fast-check), `e2e/security.spec.ts` (Playwright; `npm run test:e2e` after `npx vite build`; served by `scripts/serve_dist.py` with the real `_headers`).
- **CI:** actions pinned to SHAs (Dependabot updates the SHAs), `npm audit --audit-level=moderate`, gitleaks job over the full history (`.gitleaks.toml` allows only the publishable key), Scorecard workflow. An npm `overrides` entry pins every KaTeX to the root version.

### End-to-end encrypted decks: a design, not built

Waiting on Shrey, because a forgotten passphrase loses the encrypted data for good.
- A random 256-bit data key per account encrypts each synced doc (AES-256-GCM, a fresh 96-bit IV per write, the row id as additional data so rows can't be swapped).
- The data key is wrapped by a key from the passphrase (PBKDF2-SHA-256, 600k iterations, or Argon2id via WASM) and the wrapped key syncs in `user_settings`. The passphrase never leaves the browser; the unwrapped key is kept as a non-extractable `CryptoKey` in IndexedDB.
- The sync engine would encrypt in `push` and decrypt in `pull`. Rows that arrive before the device is unlocked wait in a holding table.
- Shares stay plaintext copies, because sharing is a deliberate publish.
- Costs: server-side search of public decks can't see encrypted ones, the storage counts grow by about 35%, and there's no recovery without a recovery key.

