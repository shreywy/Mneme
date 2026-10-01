# Mneme roadmap

This is the single to-do list. Anything agreed in conversation and not built yet goes here. Tick items off as they ship. The full design is in [the spec](superpowers/specs/2026-09-30-mneme-design.md).

## Done
- [x] Hosting on Cloudflare Pages at https://mnemee.pages.dev, auto-deploying from `main`
- [x] Supabase project: migrations committed, owner-only RLS on every table, RLS tests that try to read, change and forge another user's rows (`npm run test:db`)
- [x] Sign-in by emailed link or code, account dialog, sync status in the sidebar
- [x] Local-first sync: Dexie hooks queue changes, push/pull by `updated_at` cursor, Realtime nudges, tombstones for deletes, settings synced last-write-wins
- [x] GitHub sign-in (OAuth app → Supabase callback)
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
1. **End-to-end pass** of sign-in and sync on mnemee.pages.dev, phone and PC, fixing whatever breaks (planned for 2026-10-02)
2. **Account page and menu** (below)
3. **Notes** (imported, LLM-generated notes pages)
4. **Text notes** (the user's own writing pages)
5. **AI** (Gemini, bring your own key)
6. **Preview site, GitHub polish, v1 release**
7. **Offline desktop app** (much later)

Shrey wants drafts of the bigger designs (text notes especially) before they're built.

## Next up
- [ ] **Notes as a page type, not a tab:** importing gives you a *page*, which is either a deck or notes. Remove the Notes tab from the sidebar; notes pages live in folders next to decks. Then: notes page (renderer is built), notes import, notes options in the prompt builder, deck↔notes linking on both pages, course units in the sidebar
- [ ] Generic sample deck and sample notes (non-accounting) for new users

## Accounts and sync (Supabase)
- [ ] Google sign-in: create a Google Cloud OAuth client with the same Supabase callback URL
- [ ] **Account becomes its own page** (sign-in included), not a pop-up
- [ ] **Account menu** (on that page, separate from Settings: Settings is preferences, Account is identity and the destructive actions):
  - [ ] Change username
  - [ ] Profile picture: preset icons, colours, letters, or an uploaded image (set on first sign-in too, with a few settings)
  - [ ] Sync now (force a sync), with last-synced time and pending changes
  - [ ] Clear all decks: needs an emailed code
  - [ ] Delete account and all data: needs an emailed code, typing a confirmation phrase, then a slide-to-delete. Needs a server function to remove the auth user (an RPC with `security definer`, or an Edge Function), plus a download-everything offer first
- [ ] Storage clean-up near the free 500 MB limit. A 200-question deck is about 250 KB, so roughly 2,000 decks fit. Watch total database size (not a deck count; reviews and progress grow too). At about 75% (~1,500 decks' worth), ask each user about decks they haven't opened in a long time: "You haven't used this deck in N months. Delete it?", with a download button first. Never delete without a yes.
- [ ] Sync a deck's notes links and course units once the Notes pages exist (tables are already in place)

## Security (portfolio focus)
- [x] Row-level security on every table, with tests that try to read another user's data
- [ ] End-to-end encrypted decks (AES-256-GCM, a PBKDF2-derived key-encryption key, the passphrase never leaves the browser)
- [ ] Content Security Policy and security headers via Cloudflare Pages `_headers`. Demo frames use `srcdoc`, which inherits the page's CSP, so either serve demos from a separate sandbox origin with its own CSP, or allow inline scripts only in that frame.
- [ ] Automated e2e test for the demo sandbox (the manual probe exists: see the 2026-10-01 session)
- [ ] Sanitizer tests with known XSS payloads (raw HTML is already blocked)
- [ ] `SECURITY.md` threat model
- [ ] CodeQL and Dependabot in CI
- [ ] Rate-limit triggers for publishing and search

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
- [ ] Landing page for signed-out visitors
- [ ] Docs: getting started, making a deck, deck format, study modes, how scheduling works (with an interactive forgetting-curve chart), privacy and security, shortcuts
- [ ] Changelog (patch notes) page, plus a "What's new" dot
- [ ] GoatCounter analytics and live README badges (users, decks, cards studied)
- [ ] Full README: screenshots, GIF, architecture and ER diagrams, feature list
- [ ] Deploy to Cloudflare Pages from `main`

## Themes
- [ ] More dark palettes: true black, grey, and a Discord-style blue-grey
- [ ] Custom theme: a colour picker for the background, with text and line colours worked out from its brightness so contrast stays readable

## Text notes (the user's own pages; draft the design with Shrey first)
- [ ] Pageless editor in the style of Google Docs but sleeker: headings, lists, tables, diagrams, code blocks with syntax highlighting for many languages, highlighting, and annotations (comments attached to selected text)
- [ ] Paste and drag in images; draw over them and over the page with good pen settings (colour, width, highlighter, eraser)
- [ ] Images aren't stored by Mneme: upload them to a free image host (Imgur API or similar) and keep only the link
- [ ] Lives in the same folder tree as decks and notes pages, so a course is all in one place
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
- [ ] CI workflow: lint, typecheck, unit, e2e, database tests
