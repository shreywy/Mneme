# Feedback round 1 (from Shrey's first real use, 2026-10-01)

Execution: native, on branch `feat/m0-study-ready`. Shrey's message is the brief. Each item is checked off with its verification.

## Learn
- [x] Shuffle on by default, with a toggle to go in order. Fix early repetition: the first 3–4 cards kept coming back.
  - A card answered right on the first try leaves the rotation and returns 12–25 cards later.
  - A missed card returns in 3–4.
  - Two right in a row returns 40–70 cards later.
  - Covered by scheduler tests.
- [x] Continue button sits under the answers and above the explanation, centred. Space also continues, with no hint shown.
- [x] Stats panel opened from a button next to "Ask the tutor": session seen, right, accuracy, best streak, time, mastery counts and recent misses. It stays pinned until collapsed, and the choice is remembered.
- [x] Match rounds mixed into Learn. After every ~8 cards that include terms, run a round with 4–6 recently seen terms. Results feed FSRS.

## Flashcards
- [x] Slide transition: the old card leaves to the left and the new one enters from the right (reversed for Back).
- [x] Layout: a one-line main text is centred, multi-line text is left-aligned, and the example and explanation sit lower in a left-aligned block.
- [x] Space flips; Space on a flipped card goes to the next card. Rating stays optional.
- [x] The hint line shows "Click to hide" on hover and hides permanently. Settings gets "Show hints again".

## Test
- [x] Enter in a text field with input goes to the next question. Space and Enter shortcuts are consistent across the app.
- [x] Centre the "x / n answered" progress.
- [x] Review shows every question as it looked in the quiz (all options, your pick, the correct one, the explanation), scrollable, with a "Back to deck" button.

## Deck page
- [x] Cards tab: a table with a header (Type, Question, Answer, Explanation), no "Why" button, the type label vertically centred, and the question text aligned to the top.
- [x] Manage cards: see every option, including the wrong ones; edit or delete a card; edit deck info (title, course, description).
- [x] "Are you sure" dialogs for reset and delete.
- [x] Custom-styled selects that match the theme.

## Library and folders
- [x] Subfolders: create, rename, move, delete. The move picker shows nesting.
- [x] Archive decks and folders, an Archive view, and restore.
- [x] Scales to hundreds of decks: search, sort (recent, name, progress), and grid or list view.
- [x] Sidebar: collapsible folders with nesting.

## Deck format
- [x] Prompt rule: questions must stand on their own. No references to exercise numbers ("PQ2-4") or to material the student can't see.
- [x] New `scenario` question type: one shared case (text or table) with 2–6 sub-questions, shown together and graded together.

## Mobile and iOS
- [x] Responsive layout: a drawer sidebar, touch-sized targets, `100dvh`, safe-area insets, no hover-only actions.
- [x] Web app manifest, apple-touch-icon and status-bar meta so "Add to Home Screen" runs full-screen.

## Later (noted, not this round)
- Accounts (Supabase), the AI features (Shrey's key is stored in `.env.local` for local testing), and finishing the Notes UI.
