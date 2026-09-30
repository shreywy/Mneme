# Mneme: design spec

**Date:** 2026-09-30 · **Status:** draft for review · **Repo:** github.com/shreywy/Mneme

## 1. Intent

**What it is.** Mneme is a Quizlet-style study web app. You generate a structured deck file with any LLM from your own course material (slides, textbooks), import it, and study it through several modes. The centrepiece is an endless adaptive **Learn** mode driven by spaced repetition.

**Who it's for.**
1. Shrey, studying for real courses (the first real deck is an ACCT 100 quiz review).
2. Classmates Shrey shares it with.
3. Recruiters. This is a portfolio project for the SWE job hunt, so engineering quality, security and the README all count as features.

**Success criteria.**
- **M0 (by 2026-10-01, 4pm):** Shrey can import a real deck and study it in Learn, Flashcards and Test modes in Firefox.
- **v1:** deployed publicly, with accounts, sync, the security features, a landing page, docs, CI, and a README good enough to turn directly into résumé bullets.
- The architecture must stay extensible. v1 is the first version of a tool meant to eventually cover all of a student's study needs, possibly including a local version later.

**Explicit non-goals for v1.** Generating decks inside the app with AI, a notes-grounded RAG tutor, an offline PWA, native apps, and paid tiers.

## 2. Phases and milestones

| Milestone | Contents |
|---|---|
| **M0: study-ready** (2026-10-01 4pm) | Guest mode (browser storage) · import deck files, including multi-part files · library with folders · deck page (Overview and Cards tabs, explanations shown per card) · Learn mode with FSRS · Flashcards · Test · **prompt builder** (§4.1; the Notes option is shown as "coming soon") · settings (theme, accent, sounds, reduce motion) · streak effects and sounds · **Notes placeholder** (a sidebar item with a short "coming soon" empty state) · runs locally in Firefox via `npm run dev`, and deployed if time allows. Demo data is Shrey's real `super-quiz-1-review` deck: 73 terms and 216 questions, stored git-ignored in `fixtures/private/` |
| **M1: Phase 1 complete** | Supabase auth (GitHub and Google) and sync · guest→account migration · Match mode · weak spots · stats · trophies · reset progress · mixing decks by folder · the new question types from §4.2 · **Notes** (§4b), including the notes prompt, course units and deck↔notes linking · end-to-end encrypted decks · security hardening (CSP, sanitizing, RLS tests) · public decks with keyword search and import · landing page · docs site with the interactive FSRS visual and a **Changelog** · generic sample deck and notes · GoatCounter and README stats badges · CI/CD, CodeQL, Dependabot, keep-alive · README |
| **M2: Phase 2 (AI, bring your own key)** | Gemini key management · tutor chat · "why is this wrong" · AI grading of typed answers · mnemonics · "more like this" · end-of-session summary · semantic public search (pgvector) · Sentry |
| **M3: Phase 3** | Realtime multiplayer rooms · report button and publishing rate limits · Quizlet-style games · review of other Quizlet features (discuss with Shrey first) |

## 3. Architecture

```
Browser (React SPA on Cloudflare Pages, with strict security headers via _headers)
 ├─ UI (routes: /, /docs/*, /app/*)
 ├─ Study engine (pure TS: FSRS + Learn session scheduler)   ← unit-tested, no I/O
 ├─ Deck format (parse → validate → repair → normalize)      ← unit-tested
 ├─ Crypto (WebCrypto: E2EE decks, local secret storage)       ← unit-tested
 ├─ Repository interface
 │    ├─ LocalRepository  (IndexedDB via Dexie)  — guest mode, and the cache for signed-in users
 │    └─ SupabaseRepository (Postgres + RLS)     — signed-in source of truth
 └─ AI client (Phase 2): calls the Gemini API directly from the browser; the key never touches our backend

Supabase (free tier)
 ├─ Auth: GitHub, Google OAuth (PKCE)
 ├─ Postgres: tables + RLS + RPC functions + triggers (rate limits) + full-text search + pgvector (Phase 2)
 ├─ Edge Function: public-stats (shields.io endpoint JSON for README badges)
 └─ Realtime (Phase 3)

GitHub Actions: CI (lint, typecheck, unit, e2e, RLS tests) · CodeQL · Dependabot · keep-alive cron
```

**Stack:**
- React 19, TypeScript (strict), Vite
- React Router
- Zustand for UI state, TanStack Query for server state
- Dexie (IndexedDB), zod
- `ts-fsrs`
- Tailwind CSS v4, with the design tokens below exposed as CSS variables
- Motion, for layout animations only; everything else is CSS transitions
- `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` + `rehype-sanitize`
- Vitest, Testing Library, Playwright
- Supabase CLI (migrations and tests)
- Fonts self-hosted via `@fontsource` (Newsreader, Hanken Grotesk), so there are no third-party font requests and the CSP stays tight.

**Repository layout:**

```
src/
  app/            routes, layout, providers
  features/       library, deck, learn, flashcards, match, test, stats, trophies, settings, public, landing, docs
  engine/         fsrs adapter, learn scheduler, mastery, grading (fuzzy match, numeric, cloze)
  deck-format/    zod schema, parser, repair, normalizer, part merger
  data/           repository interface, local (Dexie), supabase, sync queue
  crypto/         e2ee, secret store
  ui/             design-system components (Button, Seg, Tabs, Panel, Toast, Tooltip, Sheet, Kbd, Wordmark)
  sound/          WebAudio synth (sound palette, hiss)
supabase/
  migrations/     SQL, one file per change
  tests/          pgTAP RLS tests
  functions/      public-stats
deck-format/      mneme-deck-prompt.md (instructions + example), deck.schema.json (the public contract)
docs/             specs, plans, SECURITY.md source, README images
```

**The extensibility rule.** Every study tool is a *feature module* reading items through the repository interface. The data model has a generic `items` table with a `kind` column, so future kinds (notes, diagrams, …) and future modes plug in without schema rewrites. A later local-only desktop version only needs the `LocalRepository`.

## 4. The deck format

The format is defined in `deck-format/` (already written and validated). In summary:
- `{ format: "mneme.deck", version: 1, deck, topics, terms, questions }`
- **Terms and questions are separate arrays**, which powers the All / Questions / Terms filter.
- **Topics** power per-topic filtering and weak-topic stats.
- Question types: `multiple_choice`, `multiple_select`, `true_false`, `short_answer`, `numeric`, `cloze`, `ordering`.
- **Every question has an `explanation`**, and every choice can have a `why`. These come from the LLM that wrote the deck, so "why is B wrong" works without any AI key.
- Text fields allow sanitized Markdown, tables and LaTeX.
- Large decks can be split into parts that share a title, and Mneme merges them.
- **One file:** `deck-format/mneme-deck-prompt.md` holds the instructions *and* a complete, schema-valid example deck (section 5), so a user only ever handles one file.
  - The app bundles it at build time and serves it through a **"Get the LLM prompt"** control with Copy and Download buttons. It's easy to find: on the empty-library screen, on the Import dialog, in the sidebar's "New deck" menu, and on the docs page "Making a deck".
  - A unit test extracts the example from the prompt file and validates it against `deck.schema.json`, so the prompt can never drift from the parser.

**Import pipeline:**
1. Read the file (limit 5 MB; `.json` or a pasted ```` ```json ```` block).
2. `JSON.parse`.
3. **Repair pass**, which is lenient and logs each fix:
   - strips code fences
   - maps a topic *name* to its id
   - coerces `"true"` to `true`
   - fills a missing `difficulty` with 2
   - drops unknown fields
4. Strict zod validation. Errors are shown with the JSON path, in plain language.
5. Normalize into internal `Item`s.
6. Merge with an existing deck if the title matches and it's a part or a re-import. **Item ids are stable keys**, so re-importing an updated deck keeps progress for unchanged ids.

### 4.1 The prompt builder
The user doesn't hand-edit the prompt. **"Get the LLM prompt"** opens a short form. **Every field is optional**, the "Copy prompt" button is always enabled, and blank fields fall back to defaults, so the fastest path is a single click.

| Field | Options (default in bold) | Effect on the generated prompt |
|---|---|---|
| What to make | **Questions** · Notes · Both | selects which prompt sections are included, so the LLM only spends effort on what's wanted (Notes is "coming soon" until M1) |
| Course | text | fills `deck.course` / the folder |
| Title | text | fills `deck.title` |
| Focus | text, e.g. "ch. 1–3, skip GAAP history" | added as a scope instruction |
| Length | **Comprehensive** · Focused · Quick · or about N items | sets the SIZE rule |
| Difficulty | **Mixed** · Easier · Harder | Mixed gives roughly 20% level 1, 45% level 2, 35% level 3. Easier is mostly recall and understanding. Harder is mostly level-3 scenarios and calculations, with close distractors. |
| Question styles | checkboxes, **all on**: multiple choice, select-all, true/false, typed answer, numeric, fill-in-blank, fill-in-blank with word bank, ordering, matching, categorize | only the ticked types are described, and the prompt tells the LLM to use only those |
| Terms | **Include** · Skip | whether the `terms` array is requested |
| Extra notes | text | appended verbatim |

- The builder assembles the prompt from `deck-format/prompt-parts/*.md` fragments. That way there is one source of truth, and a unit test checks that every combination of options produces a prompt whose embedded example validates.
- Choices are remembered locally for next time.
- Copy and Download are both offered.

### 4.2 More question types (added to format v1; backward compatible)
- **`cloze` with a word bank:** an optional `bank: string[]` holds the correct words plus 2–4 distractors, and the user picks from chips instead of typing.
- **`matching`:** `pairs: [{ left, right }]` (3–8 pairs) plus optional `distractors: string[]` on the right side. It's rendered like Shrey's dropdown tables: each left item gets a picker. It counts correct if all pairs match, and the review shows which pairs were wrong.
- **`categorize`:** `categories: string[]` and `items: [{ text, category }]`, where the user sorts each item into a bucket. An example is "Asset / Liability / Equity / Revenue / Expense / Not counted".
- The prompt says to use "whatever type fits the material best" among the enabled ones. The format stays open to new types; an unknown type in an imported file is skipped with a warning instead of failing the whole import.

**Terms become exercises automatically.** No extra authoring is needed:
- term → definition, as multiple choice with distractors drawn from other definitions in the same topic
- definition → term, the same way
- typed term, checked against aliases
- flashcards
- match pairs

## 4b. Notes (M1; a placeholder ships in M0)

Notes are interactive study pages generated by the user's LLM from their course material, as a second item type next to decks. The model is Shrey's own `acc100_ch*_study.html` pages, rebuilt from structured data instead of raw HTML.

**The file.** `format: "mneme.notes"`, `version: 1`.
- `notes`: `title`, `course`, `unit` (a free-text label such as "Chapter 2" or "Week 5") and `blocks[]`.
- `deck` (optional): a complete companion deck object in the normal deck format, so one import creates both, already linked.
- The notes prompt (`deck-format/mneme-notes-prompt.md`, built by the same prompt builder with "Notes" or "Both" selected) tells the LLM to skip the source's practice questions and put questions into the companion deck instead.

**The LLM describes, Mneme draws.** Raw HTML, CSS and JS from the file are never rendered. This keeps pages safe (no script injection from shared files) and consistent with the app's design in both themes. Block types:
- **Structure:** `quickref` (pinned summary at the top; like the current "Quick reference" panels) · `section` (collapsible, with an "expand all" control) · `heading` · `paragraph` · `list` · `table` · `math` · `callout` (`tip` / `warning` / `exam` / `definition`) · `keyterms` (chips linked to the companion deck's terms; hover shows the definition).
- **Visuals:**
  - `flow` (rows of chips joined by operators, with labelled arrows between rows; the A = L + E cascade)
  - `steps` and `cycle` (processes)
  - `compare` (side-by-side columns)
  - `decision` (a matrix like the WHO/WHEN table; clicking a path highlights it)
  - `tree` and `timeline`
  - `chart` (bar, line or pie from given numbers)
  - `diagram` (nodes and edges, laid out automatically)
- **Interactive:**
  - `question` (any deck question type, answered inline; progress feeds FSRS if the item also exists in a linked deck)
  - `match` (dropdown matching table)
  - `reveal` (a prompt, then a hidden answer or worked solution)
  - `worked` (a worked example revealed step by step)
  - `check` (a 2–4 question self-check at the end of a section)

Every block type is documented in the prompt with a JSON example and a rule for when to use it. Unknown block types are skipped with a warning.

**Organizing.**
- A folder can be marked as a **course**. A course holds **units**: user-named, user-ordered groups such as "Chapter 1" or "Week 3", which can be renamed and dragged to reorder.
- Each unit holds any number of notes pages and decks. Loose decks and notes outside units are allowed.
- The course page is a hub (like `00_hub.html`): units in order, each showing its notes, decks, and a mastery bar.

**Linking decks and notes (many-to-many, manual).**
- Any deck can be linked to any number of notes pages, and any notes page to any number of decks. For example, one "Ch. 1–3 review" deck can link to the Chapter 1, 2 and 3 pages.
- A combined file creates its link automatically.
- On a notes page, a "Linked decks" bar offers Practice (Learn on the linked decks) and a picker to add or remove links.
- On a deck page, a "Linked notes" list does the same.
- When a notes page links to a big deck, practice can be narrowed to the deck's topics that the notes page tags (optional `topics` on the notes).

## 5. Study engine

### 5.1 Long-term memory: FSRS
- Each (user, item) has an FSRS card state from `ts-fsrs`: `due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `state`, `last_review`.
- Desired retention defaults to 0.9 and can be changed in settings.
- Every answer in every mode produces an FSRS rating:

| Situation | Rating |
|---|---|
| Wrong, or "didn't know" | **Again** |
| Correct but slow (over 2× the user's median response time for that type), or correct after a hint | **Hard** |
| Correct | **Good** |
| Correct and fast (under 0.5× median) on a card already Familiar or better | **Easy** |

- Flashcards show explicit Again / Hard / Good / Easy buttons.
- **Learn mode doesn't wait for "due".** It also schedules within a sitting, so short-term re-exposures are recorded as FSRS same-day reviews. `ts-fsrs` supports these through its learning steps.

### 5.2 Mastery levels (what the user sees)
- **New:** never answered.
- **Learning:** answered, but stability under 1 day, or the last answer was wrong.
- **Familiar:** stability 1–21 days, or answered correctly twice in a row this session.
- **Mastered:** stability of at least 21 days, or correct 3+ times across 2+ separate days with no lapse since.

### 5.3 The Learn session scheduler (infinite quiz)
The scheduler is a pure function, `nextCard(state) → card`, and it's unit-tested.

**Working set.** The scheduler keeps about 7 active cards, pulled from the eligible pool in this priority order:
1. **Overdue** cards, lowest retrievability first.
2. **Learning** cards.
3. **New** cards, in deck order within each topic.
4. Familiar and Mastered cards whose retrievability is under the target.

A card graduates out of the working set after **2 consecutive correct answers**. A replacement is then pulled in, so the session never ends.

**Re-insertion after an answer:**
- **Wrong:** reinserted 3–4 cards later, with slight jitter, and marked for the typed format next time if the item supports one.
- **Correct:** pushed further out, 6–10 cards later, or graduates.

**Hard constraints:**
- The same item never appears twice in a row.
- At least **2 other items** always come between repeats, unless the pool has fewer than 3 items.
- An item's term→definition and definition→term variants count as the same item for spacing.

**Format escalation:**

| Level | Format |
|---|---|
| New / Learning | multiple choice (or the question's native type) |
| Familiar | a typed recall format where possible (term typed from its definition; short-answer or cloze) |
| Mastered | occasional checks, mixed formats |

**Filters** apply to the pool: All / Questions / Terms, by topic, a whole folder (mixed decks), and **Weak spots** (the items with the most lapses and lowest retrievability across every deck).

**Stats per session:** cards seen, accuracy, best streak, and time. Per-item response times are also recorded, since they feed the fast/slow rating.

### 5.4 Other modes
- **Flashcards.**
  - Flip with Space. Rate Again, Hard, Good or Easy (keys 1–4).
  - Three sub-modes: term→definition, definition→term, and questions (prompt→answer + explanation).
  - A shuffle toggle, and a "due only" toggle.
- **Match.**
  - A grid of 6 term/definition pairs with a timer. Pick a term, then its definition.
  - A wrong pick adds a +1s penalty.
  - Best time per deck is recorded, and it feeds FSRS lightly (correct match = Good, wrong pick = Again).
- **Test.**
  - Configure the number of questions, types, topics and an optional timer.
  - One question per screen, with a navigator. Grading happens at the end, followed by a review of misses with their explanations.
  - Test results don't change FSRS by default. There's an option to count them.
- **Answer grading.**
  - Typed answers compare case- and accent-insensitive and trim articles. They're accepted within a Damerau-Levenshtein distance of ≤ max(1, 15% of length), showing "Did you mean…".
  - Numeric answers are accepted within `tolerance`, and parse `$2,000` or `2k`.
  - Cloze answers are checked per blank against the alternatives.
  - Ordering is correct only if the whole order is right; the review shows which positions were wrong.
  - An **"I was right" override** logs the answer as Good. It is rate-limited in the UI to discourage abuse.

### 5.5 Motivation layer
- **Streak counter** in Learn:
  - every correct answer gives a flame flicker
  - every 10 correct gives a bigger blaze
  - losing a streak gives a blue sizzle-out, a smoke puff and a soft low hiss
  - the flame animations themselves make no sound
- **Milestone celebrations** (streaks of 5, 10 and 25; deck first pass; deck mastered): a toast, a small burst animation, an arpeggio sound, and `navigator.vibrate` on phones.
- **Trophies:** a small set of about 15 with a trophy case page, for example:
  - Hot streak (10), Unshakeable (25), Centurion (100 correct in one session)
  - First pass (saw every card), Mastered (every card mastered), Polymath (5 decks mastered)
  - Night owl, Early bird
  - Consistent (study 3, 7 or 30 days in a row)
  - Perfect test
  - Speed matcher (Match under 20s)
- **Records per deck:** best streak, sessions, accuracy and time studied.
- **Reset progress:** per deck (on the deck's Overview tab) or everything (in Settings). Both need a typed confirmation and are undoable for 10 seconds.
- **Sounds** are synthesized with WebAudio, so there are no audio files.
  - Correct-answer sound options: Chime, Pop, Wood, Bell, Marimba and Pluck.
  - A mute button in the Learn bar, plus the `M` key. The setting syncs.
  - Respects "reduce motion" and the OS-level reduced-motion setting.

## 6. Data model (Postgres)

All tables have RLS enabled. `auth.uid()` scopes every private row.

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` (= auth.users.id), `display_name`, `avatar_url`, `created_at` | created by a trigger on sign-up |
| `user_settings` | `user_id`, `settings jsonb` | theme, accent, sound, retention, … |
| `folders` | `id`, `owner_id`, `parent_id` (self-FK), `name`, `position` | nested folders (course → sub-folders) |
| `decks` | `id`, `owner_id`, `folder_id`, `title`, `description`, `course`, `topics jsonb`, `visibility` (`private`/`public`), `encrypted bool`, `ciphertext bytea`, `crypto_meta jsonb`, `source_deck_id`, `item_count`, `search tsvector` (generated), `embedding vector(768)` (Phase 2), timestamps | an encrypted deck stores **only** ciphertext; it has no plaintext title in `search` and no `items` rows |
| `items` | `id`, `deck_id`, `item_key` (the deck-file id), `kind` (`term`/`question`/future kinds), `qtype`, `topic`, `payload jsonb`, `position` | unique (`deck_id`, `item_key`); GIN index on the deck's `search` |
| `card_states` | `user_id`, `deck_id`, `item_key`, FSRS fields, `mastery`, `last_answer_ms`, `updated_at` | PK (`user_id`, `deck_id`, `item_key`); index on (`user_id`, `due`). For encrypted decks, `item_key` is `HMAC(deck key, id)`, so item ids don't leak |
| `review_logs` | `id`, `user_id`, `deck_id`, `item_key`, `rating`, `mode`, `correct`, `response_ms`, `reviewed_at` | append-only (RLS allows only insert and select-own); powers stats |
| `study_sessions` | `id`, `user_id`, `deck_id`/`folder_id`, `mode`, `started_at`, `ended_at`, `seen`, `correct`, `best_streak` | |
| `user_trophies` | `user_id`, `trophy_id`, `deck_id` (nullable), `earned_at` | trophy definitions live in code |
| `deck_records` | `user_id`, `deck_id`, `best_streak`, `best_match_ms`, `sessions`, `seconds_studied` | |
| `units` | `id`, `folder_id` (the course), `label`, `position` | user-named, user-ordered groups inside a course folder |
| `notes` | `id`, `owner_id`, `folder_id`, `unit_id`, `title`, `course`, `blocks jsonb`, `topics text[]`, `visibility`, `encrypted`, `ciphertext`, `crypto_meta`, timestamps | a notes page. Decks also get a nullable `unit_id` |
| `deck_note_links` | `deck_id`, `note_id`, `created_at` | many-to-many; PK (`deck_id`, `note_id`); RLS requires the caller to own both sides |
| `action_log` | `user_id`, `action`, `created_at` | for rate-limiting triggers (publish, import-public, search RPC) |

**RPC functions** (`security definer` with `search_path` pinned, where needed):
- `search_public_decks(q, limit)`: full-text search with `ts_rank`. In Phase 2 it also combines pgvector results using reciprocal rank fusion.
- `import_public_deck(deck_id)`: copies a public deck into the caller's library.
- `deck_stats(deck_id)`, `user_stats()`: aggregates for the Stats page.
- `reset_progress(deck_id nullable)`
- `public_counts()`: total users, decks, reviews. Read by the stats Edge Function.

**Triggers:** `updated_at`; profile creation on sign-up; rate limits (e.g. 20 publishes per day and 60 searches per minute per user) that raise an exception when exceeded.

**Sync.** Signed-in writes go through the `SupabaseRepository`. Review results are queued in IndexedDB and flushed in batches (every 5 answers, on session end, and on `visibilitychange`), with retry. Nothing is lost if the network drops mid-session. On first sign-in, a guest is offered "Bring your local decks and progress into your account".

## 7. Security

A threat model is documented in `SECURITY.md` (STRIDE-style table: asset → threat → mitigation → test).

1. **Untrusted deck content (XSS).** Deck files come from LLMs and from other users' public decks.
   - Markdown is rendered through `react-markdown` with **no raw HTML**, plus `rehype-sanitize` with an allowlist, and KaTeX with `trust: false`.
   - Links and images are stripped.
   - Unit tests feed in known XSS payloads (`<img onerror>`, `javascript:` URLs, SVG, KaTeX `\href`).
2. **Content Security Policy** and headers, via Cloudflare Pages `_headers`:
   - `default-src 'self'`; `script-src 'self'`; `style-src 'self' 'unsafe-inline'` (for KaTeX and animation inline styles)
   - `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com https://mneme.goatcounter.com`
   - `frame-ancestors 'none'`, HSTS, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `X-Content-Type-Options: nosniff`
3. **Tenant isolation.**
   - RLS on every table.
   - **pgTAP tests in CI** sign in as user A and assert that selecting, updating and deleting user B's private rows returns nothing or fails. Public decks are readable, but only the owner can write them.
4. **End-to-end encrypted decks** (opt-in per deck).
   - A random 256-bit **deck key** encrypts the deck payload with **AES-256-GCM** (a random 96-bit IV per encryption, with the deck id as additional authenticated data).
   - The deck key is wrapped by a **key-encryption key** derived from the user's passphrase with **PBKDF2-SHA-256 at 600,000 iterations** (the OWASP 2023 guidance), using a random salt.
   - `crypto_meta` stores the salt, iterations, wrapped key and a key-check value.
   - The passphrase and keys never leave the browser. The unlocked key is cached in memory for the session only.
   - Encrypted decks can't be public or searchable. A lost passphrase means the deck is gone, and the UI warns about this plainly.
   - Changing the passphrase re-wraps the deck key only.
5. **The Gemini API key** (Phase 2).
   - Stored in IndexedDB, encrypted with a **non-extractable** WebCrypto AES key. This protects against copying the browser profile, not against XSS, which is why items 1–2 matter.
   - Sent only to `generativelanguage.googleapis.com`, and never to Supabase.
   - It can optionally be synced to your account wrapped by your E2EE passphrase.
6. **Auth.** Supabase OAuth with PKCE. There are no passwords to store. The session lives in Supabase's storage.
7. **Abuse.** Rate-limit triggers, a 5 MB import cap, and item-count caps (5,000 per deck).
8. **Supply chain.** Dependabot, CodeQL, `npm audit` in CI, and a lockfile.

## 8. AI features (Phase 2, bring your own key)

- **Optional.** Without a key, AI buttons are visible but muted. Hovering shows *"Add a free Gemini API key in Settings to use this."* A one-time dismissible note on the home screen mentions it too.
- **Model:** a Gemini Flash-class model on the free tier. The exact model id is decided at implementation time. Replies stream in.
- **Tutor chat:** a slide-out panel. Its **pinned context** is the item (prompt, choices, correct answer, explanation, and the user's answer), plus the deck title and topic.
  - Each item has its own thread, stored locally.
  - **Context management:** when history passes about 60% of the model's budget, older turns are summarized into a running summary that's kept pinned. A token meter uses the API's `countTokens`.
  - The panel supports stop, retry and copy, and renders Markdown and LaTeX (sanitized).
- **Other AI actions:**
  - AI grading of typed answers ("Was I right?")
  - a mnemonic for leech cards (3 or more lapses)
  - "More like this" (2–3 variations of one item, saved into a "Generated" topic)
  - an end-of-session summary
- **Semantic search:** each public deck gets an embedding when it's published, using the publisher's key. Search then combines keyword and embedding results; without a key it falls back to keyword-only.
- **Sentry** (free tier) for error tracking, with the PII scrubber on.

## 9. Public decks

- A **Publish** toggle on your own non-encrypted decks makes them visible to everyone.
- The **Public decks** page offers search (by title, course, description or content), a preview, and "Add to my library" (a copy that keeps the original as `source_deck_id`).
- The owner can unpublish at any time. Copies other people already made stay theirs.

## 10. Landing page, docs and analytics

- **Landing page** (`/`, for signed-out visitors):
  - A hero with a live-rendered app preview.
  - Feature sections: Learn plus FSRS, the deck-file workflow (your notes → any LLM → Mneme), study modes, trophies, encryption and privacy, and AI (optional).
  - "Try without an account" (guest mode) and "Sign in" buttons.
  - Written in plain, honest language, with no hype.
- **Docs** (`/docs/*`, Markdown pages rendered in-app):
  - Getting started, making a deck (with the prompt copy button), the deck format reference, study modes, how scheduling works, privacy and security, and keyboard shortcuts.
  - **"How scheduling works" has an interactive forgetting-curve chart.** Drag the timeline, add reviews at chosen times, and watch the retention curve reset and flatten (FSRS stability growing).
- **Changelog (patch notes):** a docs page with one entry per release (version, date, and 2–6 short plain lines describing what changed for users). It's written by hand, not generated from commits. The app shows a small "What's new" dot in the sidebar when there's an entry the user hasn't seen.
- **Copy style (all UI, docs, changelog and README text):**
  - Plain and specific, so it doesn't read as AI-written.
  - No chains of em dashes; none of "delve / crucial / pivotal / seamless / robust / unlock / elevate / empower"; no "not just X but Y"; no "serves as" in place of "is"; no vague claims about significance; no emoji; no title case on every heading; no bold on every line.
  - Say what a thing does, using real numbers.
  - Both prompts tell the user's LLM to write the same way, since its text is displayed in the app.
- **Analytics:** GoatCounter (free, open source, no cookies, so no banner is needed) counts visitors.
- **README badges** use shields.io's endpoint badge, fed by the `public-stats` Edge Function (cached for 1 hour), showing users, decks and cards studied.

## 11. Design system

This matches the approved "Paper" prototype.

- **Tokens:** paper light (`--bg #F3F0E8`, surface `#FBFAF6`, ink `#1C1B18`) and paper dark (`--bg #171613`, surface `#1F1E1A`, ink `#ECE7DC`).
- **Accent:** Moss by default, with Fern, Sage, Terracotta, Ochre and Slate options. Each has a light and a dark variant. Correct and wrong colours are fixed and independent of the accent.
- **Type:**
  - Newsreader (serif) for the wordmark, titles, panel headings, questions and explanation headings.
  - Hanken Grotesk for the interface.
  - Tabular numbers.
- **Logo:** a serif M whose **left stem is a pencil**, drawn as SVG in a single colour (`currentColor`). It's used as the "M" of the "Mneme" wordmark, and stands alone for the favicon and the collapsed sidebar.
- **Shell:**
  - Sidebar (248px) that collapses to a 62px icon rail (the `[` key). The rail expands on a **held** hover (about 380ms of intent).
  - **Focus mode** (the `F` key) hides the sidebar and top bar. Resting the cursor at the left or top edge for about 300ms brings them back.
  - Study modes are always full-screen focus views.
- **Learn layout:**
  - A single centred column (max 760px).
  - Question text scales down with length (over 140 and over 300 characters).
  - Answer options stay vertically centred.
  - A bottom dock holds the tutor button (centred) and Continue (Enter, on the right).
  - Deck-level panels (Mastery, Missed most) appear only on the deck's Overview tab.
- **Motion:** 150–300ms, animating transform and opacity only, with ease-out curves. Sliding segmented controls and tab underline; the view cross-fade is about 220ms. Everything respects reduced motion.
- **Keyboard:** 1–9 answer · Enter continue · Space flip · Esc exit · M mute · F focus · [ sidebar · Ctrl+K search · L learn from the deck page.

## 12. Testing and CI

- **Unit (Vitest):**
  - scheduler invariants (property tests: never back-to-back, the gap of at least 2, graduation, the infinite supply)
  - rating inference, mastery levels, grading functions
  - deck parser, repair and validation (including the example embedded in the prompt file, and the user's real decks as fixtures)
  - crypto round-trips and wrong-passphrase failure
  - the sanitizer against XSS payloads
- **Component tests (Testing Library):** Learn card interactions and keyboard shortcuts.
- **E2E (Playwright, Firefox and Chromium):**
  - Guest: import the example deck → Learn 10 answers → progress persists after reload.
  - Test mode: complete a test and see the review.
  - Settings: theme and accent persist.
- **Database:** `supabase db reset` plus the pgTAP RLS suite in CI (Supabase CLI local stack).
- **GitHub Actions:**
  - `ci.yml`: lint, typecheck, unit, e2e, db tests
  - `codeql.yml`
  - `dependabot.yml`
  - `keepalive.yml`: a cron every 3 days calls a lightweight REST query so the free Supabase project doesn't pause
- **Deploy:** Cloudflare Pages Git integration builds `main`, and each PR gets a preview URL.

## 13. README (the showcase)

- The wordmark, a one-line pitch, and badges: stack, CI, CodeQL, license, and live users/decks/reviews.
- A hero GIF of Learn mode.
- Screenshots in light and dark.
- Feature list, an architecture diagram (Mermaid), an ER diagram (Mermaid), and a security section linking `SECURITY.md`.
- "How scheduling works", the deck format with a link to the prompt, local setup, and the tech-stack table.
- **No AI or Claude attribution anywhere** in commits, PRs or docs.

## 14. Deferred / to discuss later

- Quizlet-style games and other Quizlet features. Bring these up with Shrey after M1.
- A notes-grounded tutor (RAG).
- An offline PWA, and a local-only desktop build.
- Report button and moderation (Phase 3).
