# Mneme roadmap

This is the single to-do list. Anything agreed in conversation and not built yet goes here. Tick items off as they ship. The full design is in [the spec](superpowers/specs/2026-09-30-mneme-design.md).

## Done
- [x] Hosting on Cloudflare Pages at https://mnemee.pages.dev, auto-deploying from `main`
- [x] Supabase project: migrations committed, owner-only RLS on every table, RLS tests that try to read, change and forge another user's rows (`npm run test:db`)
- [x] Sign-in by emailed link or code, account dialog, sync status in the sidebar
- [x] Local-first sync: Dexie hooks queue changes, push/pull by `updated_at` cursor, Realtime nudges, tombstones for deletes, settings synced last-write-wins
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

## Next up
- [ ] **Notes pages:** list page, notes page (renderer is built), importing notes, notes options in the prompt builder, deck↔notes linking on both pages, course units in the sidebar
- [ ] Generic sample deck and sample notes (non-accounting) for new users

## Accounts and sync (Supabase)
- [ ] Free email sender (custom SMTP) so sign-in codes reach other people. Supabase's built-in email only reaches project members, at 2 per hour. Option: a Gmail account with an app password (about 500 a day, no domain needed), set in Supabase → Authentication → SMTP. **It also unlocks the styled sign-in code email** (`supabase/templates/code.html`): the free tier blocks custom templates on the built-in sender. Uncomment the template block in `supabase/config.toml`, then run `npx supabase config push`.
- [ ] GitHub sign-in: the OAuth app exists (callback is Supabase's). Paste its client ID and secret into Supabase → Authentication → Sign In / Providers → GitHub, then test the button on mnemee.pages.dev
- [ ] Google sign-in: create a Google Cloud OAuth client with the same Supabase callback URL
- [ ] Move to PKCE once sign-in is by code or OAuth only (emailed links need the implicit flow to work across devices)
- [ ] Sync a deck's notes links and course units once the Notes pages exist (tables are already in place)
- [ ] GitHub Action keep-alive so the free project doesn't pause

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
