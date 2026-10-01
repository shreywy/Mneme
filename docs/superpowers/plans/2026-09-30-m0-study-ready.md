# M0 "study-ready" implementation plan

>
> **Execution method:** Native (inline). Shrey delegated execution while away ("take control and keep working until I'm back"), with a hard deadline of 2026-10-01 4pm.

**Goal:** Shrey can import his real `super-quiz-1-review.mneme.json` in Firefox and study it in Learn, Flashcards and Test modes, with progress saved in the browser.

**Architecture:** A Vite + React + TypeScript single-page app with no backend yet (guest mode only).
- Pure, unit-tested modules: `deck-format` (parse, repair, validate, normalize), `engine` (FSRS adapter, Learn scheduler, grading, exercise generation) and `prompt` (prompt builder).
- A Dexie (IndexedDB) repository behind a small interface, so Supabase can slot in during M1.
- The UI is ported from the approved prototype (`docs/design/prototype.html`).

**Tech stack:**
- React 19, TypeScript (strict), Vite, React Router, Zustand
- Dexie, zod, ts-fsrs
- react-markdown + remark-gfm + remark-math + rehype-katex
- Vitest
- `@fontsource/newsreader` and `@fontsource/hanken-grotesk`

**Deviation from the spec (to be recorded in it):** styling uses plain CSS with design tokens, ported directly from the prototype, instead of Tailwind. It's faster to get pixel-faithful, and there's one fewer dependency.

**Spec:** `docs/superpowers/specs/2026-09-30-mneme-design.md`

## Global constraints
- All user-facing copy follows the spec's copy style (§10): no chains of em dashes, no AI vocabulary, plain and specific.
- No raw HTML from deck content is ever rendered. Markdown goes through react-markdown without rehype-raw, and images and links are stripped.
- The Learn scheduler never shows the same item twice in a row, and keeps at least 2 other items between repeats when the pool has 3 or more items.
- Personal course decks stay in `fixtures/private/` (git-ignored). The public build only ships the example deck from the prompt.
- No AI or Claude attribution in commits or any repo text.
- Firefox is the primary browser. Everything must work there.

## Review focus
1. **Malformed LLM output:** code fences around the JSON, a trailing chat sentence, topic *names* used instead of ids, `"true"` strings, a missing `difficulty`. The importer should repair these where it's safe and otherwise give a readable error with the JSON path, not crash. *Tested in Task 2.*
2. **Multi-part decks and re-imports:** importing part 2 before part 1, or re-importing an updated deck. It should merge by title and keep progress for unchanged item ids. *Tested in Task 2 (merge) and Task 4 (repo keeps card state).*
3. **Tiny pools:** a filter leaving 1–2 items (e.g. Terms only on a deck with 2 terms). Learn must still work and never lock up. *Tested in Task 3.*
4. **Typed-answer tolerance:** `$2,000`, `2000.00`, `2k`, "Accumulated depreciation" vs "accumulated depreciation - equipment", accents and articles. All must be accepted; clearly different answers must be rejected. *Tested in Task 3.*
5. **Reload mid-session:** progress already answered must persist; the session itself may restart. *Covered by writing every answer to IndexedDB immediately (Task 4).*

---

### Task 1: Scaffold, design tokens and the app shell
**Files:** `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `public/_redirects`, `public/favicon.svg`, `src/main.tsx`, `src/app/App.tsx`, `src/app/Shell.tsx`, `src/styles/{tokens,base,components}.css`, `src/ui/{Icons.tsx,Wordmark.tsx,Seg.tsx,Tabs.tsx,Sheet.tsx,Toasts.tsx}`, `src/settings/store.ts`
- [ ] Vite React-TS scaffold, deps installed, and a `vitest` script.
- [ ] Port tokens (light and dark, accents) and the component CSS from the prototype. Self-host the fonts.
- [ ] Shell: sidebar with the wordmark, nav (Library, Notes), a folder tree, collapse-to-rail with the `[` key, held-hover peek, and focus mode with the `F` key and edge hot zones.
- [ ] Settings store (Zustand + localStorage): theme, accent, sound on/off, correct sound, reduce motion. Settings sheet UI.
- [ ] Verify: `npm run dev` opens in the browser pane with both themes rendering. Commit.

### Task 2: The deck-format module
**Files:** `src/deck-format/{types.ts,schema.ts,repair.ts,parse.ts,merge.ts}`, `src/deck-format/parse.test.ts`
**Interfaces (produces):**
```ts
type ParseResult = { ok: true; deck: NormalizedDeck; warnings: string[] } | { ok: false; errors: string[] }
function parseDeckText(text: string): ParseResult
function mergeParts(existing: NormalizedDeck, incoming: NormalizedDeck): NormalizedDeck
type NormalizedDeck = { title; course?; description?; sources: string[]; part?: {index; of}; topics: Topic[]; items: Item[] }
type Item = TermItem | QuestionItem  // key = the file's id; kind = 'term' | 'question'
```
- [ ] Tests:
  - the prompt's example validates
  - `fixtures/private/*.json` validate, if present (skipped in CI)
  - fenced and trailing-text input is repaired
  - a topic name is mapped to its id
  - `"true"` is coerced
  - a missing difficulty defaults to 2
  - a multiple-choice question with 2 correct answers gives an error that includes the path
  - an unknown question type is skipped with a warning
  - merging parts keeps a union of items by key
- [ ] Implement with zod, mirroring `deck.schema.json`. Commit.

### Task 3: The engine
**Files:** `src/engine/{rng.ts,grading.ts,fsrs.ts,mastery.ts,exercises.ts,scheduler.ts}` + `*.test.ts`
**Interfaces (produces):**
```ts
normalizeAnswer(s): string
gradeTyped(input, answers: string[]): { correct: boolean; close?: string }
gradeNumeric(input, answer, tolerance=0): boolean
parseCloze(prompt): { parts: (string | { answers: string[] })[] }
rateAnswer({ correct, ms, medianMs, mastery }): Rating
masteryOf(state: CardState | undefined): 'new' | 'learning' | 'familiar' | 'mastered'
buildExercise(item, pool, format, rng): Exercise        // term → MC / typed; question → native type
class LearnSession { constructor(entries: PoolEntry[], opts?); next(): Pick; record(key, correct): void }
```
- [ ] Tests:
  - **grading:** `$2,000` vs 2000, `2k` vs 2000, articles, accents and a small typo are accepted; "Accounts payable" vs "Accounts receivable" is rejected
  - **scheduler property test:** 5,000 random runs over pool sizes 1–40 and random correctness — never back-to-back; gap of at least 2 when the pool has 3 or more items; `next()` always returns
  - **graduation:** after 2 correct answers in a row the item leaves the working set
  - **wrong answers:** a wrong item comes back within 3–5 turns
- [ ] Commit.

### Task 4: The repository (Dexie)
**Files:** `src/data/{db.ts,repo.ts}`, `src/data/repo.test.ts` (fake-indexeddb)
**Interfaces (produces):**
```ts
importDeck(d: NormalizedDeck): Promise<{ deckId; merged: boolean }>
listLibrary(): Promise<{ folders; decks }>
getDeck(id); getItems(deckId); getCardStates(deckId): Map<key, CardState>
recordAnswer({ deckId, key, correct, ms, mode, rating }): Promise<CardState>
resetDeckProgress(deckId); deleteDeck(id); moveDeck(id, folderId); createFolder(name)
getDeckRecord / bumpDeckRecord
```
- [ ] Tests: re-importing keeps card states for matching keys; `recordAnswer` updates FSRS and appends a review; reset clears state. Commit.

### Task 5: Library, import dialog and deck page
**Files:** `src/features/library/*`, `src/features/import/*`, `src/features/deck/*`, `src/content/Markdown.tsx`
- [ ] Home or library: an empty state (Import, Get the LLM prompt, Try the sample deck), then folder groups with deck cards.
- [ ] Import dialog: drag and drop or pick files (multiple, for parts), or paste text. Shows a preview with counts and warnings before importing.
- [ ] Deck page: title, counts, mode buttons, the All / Questions / Terms filter, and Overview and Cards tabs. Cards show the answer and the explanation. Reset and delete ask for confirmation.
- [ ] Verify in the browser with the real deck. Commit.

### Task 6: Learn mode
**Files:** `src/features/learn/*` (`LearnPage.tsx`, `QuestionView.tsx`, one renderer per type, `Streak.tsx`, `effects.ts`), `src/sound/sfx.ts`
- [ ] Focus layout from the prototype; one card at a time; keyboard 1–9, Enter, Esc and M.
- [ ] Renderers: multiple choice, multiple select, true/false, short answer, numeric, cloze, ordering, and term MC or typed.
- [ ] After answering: correct and wrong states, the chosen wrong choice's `why`, the explanation, "I was right" on typed answers, and Continue.
- [ ] Streak flame effects (flicker, blaze at every 10, sizzle and hiss on loss), milestone toast and burst at 5, 10 and 25, and sounds.
- [ ] Progress bar: learned (familiar or better) out of total.
- [ ] Verify by answering 20+ cards on the real deck. Commit.

### Task 7: Flashcards and Test
**Files:** `src/features/flashcards/*`, `src/features/test/*`
- [ ] **Flashcards:** flip with Space, rate 1–4 into FSRS, a term→definition / definition→term toggle, a shuffle option, and questions show the answer and explanation on the back.
- [ ] **Test:** setup (count, filter, timer off or on), one question per screen with a navigator, submit, then a score and a review of misses with explanations. No FSRS writes.
- [ ] Verify in the browser. Commit.

### Task 8: Prompt builder and the Notes placeholder
**Files:** `src/prompt/{build.ts,build.test.ts}`, `src/features/prompt/PromptDialog.tsx`, `src/features/notes/NotesPage.tsx`; mark type sections in `deck-format/mneme-deck-prompt.md` with `<!-- type:x -->` markers
- [ ] `buildPrompt(opts)` fills the Settings block, adds difficulty and style rules, and removes unticked type sections. The test checks that every combination still contains a valid example.
- [ ] Dialog with Copy and Download; blank fields fall back to defaults; the Notes option is disabled with "coming soon".
- [ ] Notes page: an empty state explaining what's coming.
- [ ] Commit, then run the full test suite and a manual pass in the browser.

## After M0 (next plans)
M1 per the spec: Notes format, notes prompt and renderer · deck↔notes links and course units · the new question types · Supabase · the rest of Phase 1.
