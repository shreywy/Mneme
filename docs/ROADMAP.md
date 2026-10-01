# Mneme roadmap

This is the single to-do list. Anything agreed in conversation and not built yet goes here. Tick items off as they ship. The full design is in [the spec](superpowers/specs/2026-09-30-mneme-design.md).

## Done
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
3. **Notes** (imported, LLM-generated notes pages). Preview and design for review: https://claude.ai/artifact/SjxNTc6KryekgCXGwbJsuW (includes new ideas 10–18: derivations, Mneme-drawn plots, AI-drawn figures, slide images, cheat sheet, key-term hovers, quiz a section, make a card from a highlight, search in notes)
4. **Text notes** (the user's own writing pages)
5. **AI** (Gemini, bring your own key)
6. **Full end-to-end pass**: everything, signed in, phone and PC, including sync and the account page ([checklist](testing/e2e-2026-10-01.md#part-2-signed-in-to-do-needs-shrey-to-sign-in))
7. **Preview site, GitHub polish, v1 release**
8. **Offline desktop app** (much later)

**Notes and Text notes each start with a preview (mock-ups) and a written design for Shrey to approve**, like a spec; only after approval do we build them and write their prompts. Small single-feature asks (themes, tweaks) don't wait for their step: build them straight away.

## Next up
- [ ] **Notes as a page type, not a tab:** importing gives you a *page*, which is either a deck or notes. Remove the Notes tab from the sidebar; notes pages live in folders next to decks. Then: notes page (renderer is built), notes import, notes options in the prompt builder, deck↔notes linking on both pages, course units in the sidebar
- [ ] Generic sample deck and sample notes (non-accounting) for new users

## Accounts and sync (Supabase)
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
- [ ] Empty-library splash with pictures instead of reading: the prompt going into an AI chat with course PDFs and slides attached, the deck file coming back, then studying it (much later)
- [ ] Landing page for signed-out visitors
- [ ] Docs: getting started, making a deck, deck format, study modes, how scheduling works (with an interactive forgetting-curve chart), privacy and security, shortcuts
- [ ] Changelog (patch notes) page, plus a "What's new" dot
- [ ] GoatCounter analytics and live README badges (users, decks, cards studied)
- [ ] Full README: screenshots, GIF, architecture and ER diagrams, feature list
- [ ] Deploy to Cloudflare Pages from `main`


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
