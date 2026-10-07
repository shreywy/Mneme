# Mneme roadmap

This is the single to-do list. Anything agreed in conversation and not built yet goes here. To pick work back up, start with [HANDOFF.md](HANDOFF.md). Tick items off as they ship. The full design is in [the spec](superpowers/specs/2026-09-30-mneme-design.md).

## Done
- [x] Share links: a deck or notes page can be shared as a public read-only copy (no progress, highlights or annotations) at /s/<id>; viewers sign in to save it to their own library; update or stop sharing any time. `shares` table is owner-only, read by others only through `get_share(id)` with 144-bit random ids; RLS-tested. Deck and notes pages share one ⋯ menu (share, cheat sheet, export, page settings, archive); Manage moved into a Page settings dialog; chapter pills removed
- [x] Notes QC round 2: chapter view for notes in parts (tabs with progress, one chapter's contents at a time, All view, previous/next), contents search across every chapter that jumps and opens find, eye on the section on screen, per-chapter summaries (fixes the last part's summary replacing the page's), selection toolbar with an eraser and no duplicate highlight button
- [x] Notes phase 3: `derivation` (steps lined up on the relation, a reason per step), `plot` (formulas or points, axes, shaded areas, marked points, hover readout; formulas read by a safe parser, never eval), `figure` (AI-drawn SVG rebuilt from an allowlist, colours as theme roles, nothing can run or load). Prompt catalog, choices and example updated; tests check every example in the prompt imports cleanly. Cheat sheets include derivations and plots.
- [x] Sidebar: drop onto any page to join its unit and place it; hand order kept, alphabetical until then. Page menus open above the page. Contents rail slides away.
- [x] Notes phase 4 (moved ahead of phase 3): cheat sheet builder at /cheatsheet. Any mix of notes pages and decks; include quick references, formulas, key terms, exam tips, worked answers, charts; Cozy (2 columns), Balanced (3), Crunched (4, small type, thin margins); Letter or A4; page estimate; print or save as PDF. Opened from a notes page's menu or by right-clicking a card.
- [x] Notes QC round 1: notes in parts (one file per chapter, merged with chapter dividers; paste or upload several at once); prompt sends a file or one code block, explains before it quizzes, writes every formula as maths, and reuses deck ids for questions on the page; contents rail with chapter dividers, tick/untick, jump opens the section, hide contents; page menu (export notes file, print/PDF, mark unread, remove highlights and notes); annotations on hover; one-click highlight; add a note to a highlight; sidebar drag and drop into folders and units; uniform tables with column lines on wide ones; list bullets fixed; chart labels wrap; questions no longer reshuffle; Back button on Settings and Account
- [x] Notes phase 2: find on the page (Ctrl+F, opens folded sections) and library search inside notes; key-term hovers (page terms and linked decks' terms); highlights in four colours, annotations with margin markers, bookmarks (selection or spot) listed in the contents, all synced (`note_marks`, owner-only, RLS-tested); selection toolbar for phones; app-wide right-click menu (copy/cut/paste/select all, notes actions, deck and notes cards, Explain with Gemini shown for later)
- [x] Settings is its own page (/settings), like Account
- [x] Notes phase 1: notes are pages in folders next to decks (no Notes tab), grouped by unit; one Import for decks, notes, or both (linked, with folder and unit); notes page with contents rail, reading progress (synced), phone dropdown; many-to-many linking from both pages with a picker; study tools only when a deck is linked, and Learn returns to the notes; questions on a notes page count when a linked deck has them; prompt has Notes and Both with length, plots and figures (incl. None), questions and maths choices, and teaches in order with maths only where it belongs
- [x] Account page at /account (replaces the pop-up): profile with username and picture (letter or icon on a colour, or an uploaded photo shrunk to ~20 KB in a private-write storage bucket), first-sign-in setup, sync status with Sync now, linked sign-in methods, sign out. Danger zone: clear all decks (emailed code, slide) and delete account (backup offer, emailed code, typed phrase, slide). The server's `delete_my_account()` refuses unless the session came from an emailed code in the last 10 minutes; RLS tests cover profiles, username uniqueness and deletion.
- [x] Theme polish: light styles (Paper, Sand, Off-white, Light grey, White) shown only in light mode and dark styles only in dark; in-site colour picker (system picker on phones); custom accent; themed thin scrollbars; Settings grouped into collapsible sections; settings sync no longer compares device and server clocks (fixed a custom background coming back)
- [x] Mobile pass 1: sign-in pinned to the top so the keyboard can't cover it, bigger buttons, autofilled email works, simpler code screen; settings rows laid out one way; flashcards don't scroll the page, text always centred, options behind a cog, "Tap" wording on touch screens
- [x] Themes: Black, Grey and Blurple grey dark styles next to Paper, and a custom background colour that sets light or dark text from its brightness (synced with the account)
- [x] Hosting on Cloudflare Pages at https://mnemee.pages.dev, auto-deploying from `main`
- [x] Supabase project: migrations committed, owner-only RLS on every table, RLS tests that try to read, change and forge another user's rows (`npm run test:db`)
- [x] Sign-in by emailed link or code, account dialog, sync status in the sidebar
- [x] Local-first sync: Dexie hooks queue changes, push/pull by `updated_at` cursor, Realtime nudges, tombstones for deletes, settings synced last-write-wins
- [x] GitHub sign-in (OAuth app → Supabase callback)
- [x] Google sign-in (Google Cloud OAuth client → Supabase callback)
- [x] Email sender: Gmail SMTP (mneme.auth@gmail.com, set in the dashboard), styled 6-digit code email, PKCE auth flow
- [x] Keep-alive: a GitHub Action calls `keepalive()` twice a week so the free project doesn't pause
- [x] Guest decks and progress move into the account on first sign-in; signing out removes this device's copy
- Guest mode with everything stored in the browser (IndexedDB)
- Deck format, prompt builder, forgiving importer, multi-part decks
- Learn (FSRS, shuffled endless queue, Match rounds, stats panel), Flashcards, Test with review
- Seven question types plus "case with questions" (scenario)
- Card editor, deck info, folders and subfolders, archive, library search, sort and views
- Streak effects, sounds, themes, accents, focus mode, collapsible sidebar
- Phone layout and iOS "Add to Home Screen"
- LaTeX and Markdown formatting rules in the prompt, with importer repair for single-backslash LaTeX
- Deck export (.mneme.json), full backup and restore, persistent-storage request
- Sandboxed HTML demos on cards and in notes (opaque origin, no network; verified: storage, IndexedDB, the parent DOM and fetch are all blocked)

## Order of work (agreed 2026-10-01)
1. ~~**Account page and menu**~~ done 2026-10-01
2. ~~**Guest end-to-end pass**~~ done 2026-10-01; Shrey confirmed sync works from his phone ([results](testing/e2e-2026-10-01.md))
3. **Notes**: design approved 2026-10-01 ([spec](superpowers/specs/2026-10-01-notes-design.md), [preview](https://claude.ai/artifact/SjxNTc6KryekgCXGwbJsuW)). Phases: (1) core pages, import, linking, prompt; (2) find, key-term hovers, right-click menu, highlights, annotations, bookmarks; (3) derivation, plot and figure blocks; (4) cheat sheet builder. Parked: slide images on a free image host.
4. **Text notes** (the user's own writing pages): draft approved 2026-10-01 ([spec](superpowers/specs/2026-10-01-text-notes-design.md), [draft](https://claude.ai/artifact/CxCD9ntPzai9YCrkPrjdco)). Five phases; QC with Shrey after each. Phase 1 (canvas and text, [plan](superpowers/plans/2026-10-01-text-notes-phase1.md)) built 2026-10-02: Pages in the library and sidebar, infinite canvas with a pinned start, one grid, click to type, markdown shortcuts, move/resize/multi-select on the grid, undo, minimap, paper settings, Read view on phones, sync and backups. New page is a button at the top of the sidebar, in each folder and in the Library; right-click in the sidebar covers folders (new page, subfolder, rename, move, archive, remove), pages (rename, new page here) and empty space. Shrey's phase 1 QC (2026-10-02) done: middle/Space/hand-tool pan, easy block delete, formatting toolbar (fonts, sizes, H1–H3, undo/redo), per-page light/dark and font, text centred between lines and sized to them, ``` + Enter, one handle for a selection, "Recenter page", bookmarks + Contents, stuck-cursor guard. Phase 2 ([plan](superpowers/plans/2026-10-02-text-notes-phase2.md)) built 2026-10-02: Insert panel (letters, recents 1–4, drag onto the page, + beside empty lines), / menu, equation (MathLive, lazy) and $…$ maths, step-by-step working, plot and axes, table, code (highlighted, language, copy), link cards, smart paste with "Paste as plain text", My blocks (on a hidden page, no new table), duplicate and right-click menus on blocks and paper, toolbar in Read view. Round 2 follow-ups done 2026-10-02: Recently deleted (5 days, Undo toast, all page kinds), saved/synced state, palette-aware page colours, default paper, table size picker and + to grow, drag a selection by its frame (drags now draw locally and save once on drop, so big selections move smoothly), draft inputs in plots and working, back button alignment. Phases 3 and 4 built 2026-10-02 ([plan and rulings](superpowers/plans/2026-10-02-text-notes-phase3-4.md)). Ink: pen with three colours, highlighter behind the text, eraser (whole or rub out), lasso, hold-to-shape, palm rejection, two-finger undo, strokes anchored to blocks. Pictures: paste/drop/Insert, shrunk, kept locally and stored in the account's private folder. Pages layout (A4/Letter, page numbers), Print and Save as PDF (Ctrl+P), share links for Pages with optional drawing. The phase 2 minors are fixed too. 2026-10-06: pictures moved to a private Supabase bucket (Imgur on hold), and QC is done in-session rather than with checklist files. Later the same day: the highlighter straightens onto the text line it went over (it used to snap to the middle of a grid row, so headings came out a row low); bookmarks get a name and colour from their selection bar and right-click menu (undoable, colour shown in Contents and the map, hex-only in shares); on touch, two fingers pan and zoom (also from on top of text) and one finger uses the tool, Select included; a phone layout for the canvas (full-width dock, floating undo/zoom, a shorter formatting bar with a Style menu). Phase 5 (AI) waits for the AI step.
4a. **Sub-pages and Drive import** (asked 2026-10-07, design approved the same day: [spec](superpowers/specs/2026-10-07-subpages-and-drive-import-design.md), [preview](https://claude.ai/artifact/MBWmk1XV5Z7foLAgrWxfJU)). Pages hold pages at any depth; boxes on a page ("Week 1") group its sub-pages and show as headings in the sidebar tree; `[[` links; a card grows into the page when opened, a folded corner goes back; import a zipped Google Drive folder (docx with pictures, PDF as text, txt/md; folders become pages). Phases: (1) sub-pages, boxes, sidebar: **done 2026-10-07** (also: the main column pushes boxes down as it grows); (2) animation, corner, path bar, links: **done 2026-10-07**; (3) Drive import.
4b. **Security and engineering for the portfolio** (straight after Text notes, Shrey's call 2026-10-01): the Security and Engineering lists below.
5. **AI** (Gemini, bring your own key)
6. **Full end-to-end pass**: everything, signed in, phone and PC, including sync and the account page ([checklist](testing/e2e-2026-10-01.md#part-2-signed-in-to-do-needs-shrey-to-sign-in))
7. **Preview site, GitHub polish, v1 release**
8. **Offline desktop app** (much later)

**Notes and Text notes each start with a preview (mock-ups) and a written design for Shrey to approve**, like a spec; only after approval do we build them and write their prompts. Small single-feature asks (themes, tweaks) don't wait for their step: build them straight away.

## Next up
- [ ] **Notes as a page type, not a tab:** importing gives you a *page*, which is either a deck or notes. Remove the Notes tab from the sidebar; notes pages live in folders next to decks. Then: notes page (renderer is built), notes import, notes options in the prompt builder, deck↔notes linking on both pages, course units in the sidebar
- [ ] Generic sample deck and sample notes (non-accounting) for new users

## Accounts and sync (Supabase)
- [x] 20 MB of cloud space per account (Shrey's admin account has no limit). The server counts every synced row and share and refuses writes past the cap; deletions always go through and are sent first. Settings shows the meter, and a full account is told to delete pages or decks. New data stays on the device until there's room.
- [x] `storage_cap` migration applied 2026-10-01; Shrey's account has no limit
- [ ] Keep an eye on the free 500 MB database: 20 MB each means about 25 completely full accounts. Raise the plan or lower the cap before that matters.
- [ ] Sync a deck's notes links and course units once the Notes pages exist (tables are already in place)

## Security (portfolio focus)
- [x] Row-level security on every table, with tests that try to read another user's data
- [ ] End-to-end encrypted decks (AES-256-GCM, a PBKDF2-derived key-encryption key, the passphrase never leaves the browser)
- [x] Content Security Policy and security headers via Cloudflare Pages `_headers` (done 2026-10-02: strict `script-src 'self'`; demos moved to `/demo-frame.html`, a sandboxed frame with its own `default-src 'none'` policy; checked against a local production build and live). Demo frames use `srcdoc`, which inherits the page's CSP, so either serve demos from a separate sandbox origin with its own CSP, or allow inline scripts only in that frame.
- [x] Automated e2e test for the demo sandbox (2026-10-06: Playwright in CI against the production build with the real `_headers`; a hostile demo must fail to read storage, IndexedDB, cookies or the page, fetch, load images, navigate or open popups)
- [x] Sanitizer tests with known XSS payloads (2026-10-06: 35 payloads through Markdown, page maths, figures and formulas, plus a hostile shared page through the editor)
- [x] `SECURITY.md` threat model
- [x] CodeQL and Dependabot in CI
- [x] Rate-limit triggers for publishing (2026-10-06: 30 share publishes an hour). Search gets the same `_rate_limit()` when public decks exist
- [ ] Trusted Types (needs policies around MathLive and ProseMirror's internal HTML writes). Strict `script-src` is done; SRI adds nothing while every script is same-origin
- [x] Fuzz the importers and the formula/SVG sanitisers with property-based tests (fast-check, 2026-10-06)
- [x] Session list on the Account page (see and sign out other devices) (2026-10-06)
- [x] Audit log of account events the user can read (2026-10-06: share links and signed-out devices in `account_events`, with current sessions' sign-ins)
- [x] Two-step sign-in with an authenticator app, enforced by restrictive RLS at `aal2` (2026-10-06)
- [x] Private picture bucket with a 50 MB allowance and signed share links (2026-10-06)
- [x] Supply chain: actions pinned to SHAs, `npm audit` gate, gitleaks, OpenSSF Scorecard, `security.txt` (2026-10-06)
- [ ] Recovery codes for two-step sign-in (Supabase has none built in; backup authenticators for now)

## AI (bring your own Gemini key; Shrey's test key is in `.env.local`, which git ignores)
- [ ] Key storage: encrypted in IndexedDB and sent only to Google
- [ ] Tutor chat on any card, with context management (pinned card context, rolling summary, token meter)
- [ ] "Why is this wrong", AI grading of typed answers, mnemonics for problem cards, "more like this", end-of-session summary
- [ ] Semantic search of public decks (pgvector)
- [ ] Sentry error tracking

## Public decks
- [ ] Publish or unpublish a deck, search public decks, add a copy to your library
- [ ] Report button and moderation

## Site and docs
- [ ] Empty-library splash with pictures instead of reading: the prompt going into an AI chat with course PDFs and slides attached, the deck file coming back, then studying it (much later)
- [x] Introduction page at /about with every feature and real screenshots (2026-10-02). Update it when AI lands.
- [x] Docs at /docs: getting started, making a deck, studying (with an interactive forgetting curve), notes, pages, sync and sharing, privacy and security, shortcuts, how it's built (2026-10-02)
- [ ] Changelog (patch notes) page, plus a "What's new" dot
- [ ] GoatCounter analytics and live README badges (users, decks, cards studied)
- [x] Full README: hero image, screenshots, engineering and security highlights, mermaid architecture diagram, stack, setup (2026-10-02). Still to add: a GIF.
- [ ] Deploy to Cloudflare Pages from `main`


## Text notes (the user's own pages; draft the design with Shrey first)
- [x] Reuse the notes blocks for writing: LaTeX that's easy to type (live preview), and easy graphics of any sort (plots from a formula, figures, tables, diagrams). The derivation, plot and figure blocks already take plain data an editor can produce.
- [x] One infinite canvas per page with a pinned start (the top-left of the first view) and one grid for everything, so separate blocks line up on the same lines
- [x] Pageless by default; a Pages layout (A4 or Letter sheets) as an option in Page settings
- [x] Paper is customisable: lines none, ruled, dots or squares; spacing; line strength and colour; margin line; paper colour; remembered for new pages
- [x] A fast Insert panel: search, a letter per block, numbered recent blocks, drag to place, smart paste (images, spreadsheet cells, LaTeX, code), and saved "my blocks"
- [x] Pageless editor in the style of Google Docs but sleeker: headings, lists, tables, code blocks with syntax highlighting for many languages, highlighting
- [ ] Still open from that line: annotations (comments attached to selected text) and a boxes-and-arrows diagram block
- [x] Paste and drag in images; draw over them and over the page with good pen settings (colour, width, highlighter, eraser)
- [x] Pictures: kept on the device, and in a private Supabase Storage folder when signed in (2026-10-06). Imgur is **on hold** until Shrey can get a client id; the code path stays for signed-out use once `VITE_IMGUR_CLIENT_ID` is set
- [x] Lives in the same folder tree as decks and notes pages, so a course is all in one place
- [ ] With AI: snapshot any area of the app and ask Gemini to explain it. It has to feel instant.

## Offline desktop app (much later)
- [ ] Packaged Windows app that works fully offline with no limits on notes or decks; Android later, maybe
- [ ] Optional sign-in, choosing which folders sync
- [ ] Add documents and PDFs to folders; a file tree that can hold files next to notes and decks (tree-style storage across the whole app, with files only in the desktop app)

## Study features
- [ ] Weak spots: a virtual deck of the most-missed cards across all decks
- [ ] Stats page (accuracy over time, weakest topics)
- [ ] Trophies and a trophy case
- [ ] Study a whole folder at once (mixed decks)
- [ ] More question types: fill in the blank with a word bank, matching, categorize
- [ ] Ask Shrey about Quizlet-style games and other Quizlet features worth borrowing
- [ ] Live multiplayer rooms (Supabase Realtime)

## Engineering
- [ ] Playwright end-to-end tests, and component tests for study screens
- [ ] Code-split KaTeX and Markdown (the bundle is about 1 MB)
- [x] CI workflow: typecheck, unit tests, build, secret scan (2026-10-02). Still to add: lint, e2e, database tests in CI.
- [ ] CRDT sync (Yjs) for Pages so edits from two devices merge instead of last-write-wins
- [ ] Performance budget in CI (bundle size, Lighthouse) and Web Vitals reporting
- [ ] Architecture write-up with diagrams for the README (local-first sync, RLS, storage cap)
