# Notes: design

Approved by Shrey on 2026-10-01 after reviewing the preview canvas (https://claude.ai/artifact/SjxNTc6KryekgCXGwbJsuW) with the changes below. This file is the source of truth; the canvas shows the look.

## What it is

A notes page is a second kind of page, next to decks. The user gives an AI chat the course material for one unit; it writes a `mneme.notes` file; Mneme draws it as a study page.

## Decisions

### Pages and organisation
- **No Notes tab.** Import makes a page: a deck or notes. Both live in folders. Library cards show the kind: decks show cards learned, notes show sections read.
- **Units.** Pages carry an optional unit label ("Chapter 4", "Week 5"). Inside a folder, pages group by unit in natural order (Chapter 2 before Chapter 10), then pages with no unit. Notes and decks of the same unit sit side by side as separate cards.
- **Not 1:1.** A course can have notes per chapter and one midterm deck, or decks with no notes. Nothing assumes a pair.

### Linking
- Many-to-many, from either side: deck page has **Notes for this deck**, notes page has **Decks for these notes**, each with a picker (search, grouped by folder).
- A `both` file links its notes and deck automatically.
- Navigation is one click each way: a linked notes page has "Study the deck" (a menu when several are linked); starting Learn/Flashcards/Test from notes returns to the notes page on exit; a deck page lists its notes with Open.

### Study tools only when there's something to study
- "Study the deck", "Quiz me on this section" and the linked-deck card appear only when the notes page has a linked deck. Questions on the page appear when the file has them.
- **Questions on a notes page count** toward Learn progress when the same question (same id) is in a linked deck: the answer is recorded against that deck's card. Otherwise they're self-check only.

### Import
- One dialog for every file. It detects deck, notes, or both, shows what's inside, and offers folder and unit. Both → two pages, linked (a checkbox, on by default).

### Prompt
- Make: Study deck / Notes / Both.
- Notes options: Length (Short, Standard, Thorough); Plots and figures (None, Some, Lots); Questions on the page (None, A few, Many); Maths (Plain, Show derivations).
- The prompt tells the model to **teach**: order the lesson so each idea builds on the last, explain why as well as what, use examples, and keep the quick reference to what matters for the exam.
- **Maths only where the course has maths.** No forced formulas, plots or derivations for a course without them.

### The notes page
- Contents rail with a tick per read section; quick-reference card pinned at the top; sections fold; Focus mode.
- Reading progress: a section counts as read when scrolled through or opened. Stored on the note row, so it syncs. Shown on the page and its library card.
- Phone: contents become a dropdown showing the current section; wide maths, tables and plots scroll sideways.

### New block types and features (approved: 10, 11, 12, 14, 15, 16, 18)
- **10 Derivation block**: lines aligned on `=`, each with a short reason. LaTeX works in all text already.
- **11 Plot block**: lines (`y = mx + b`, or points), axes with labels and ranges, marked points, shaded regions; drawn by Mneme in theme colours; hover shows values.
- **12 Figure block**: an AI-drawn SVG, sanitised (no scripts, no external refs, no foreignObject), rendered in the sandboxed frame used for demos, recoloured to the theme palette so it matches the page.
- **14 Cheat sheet**: build one from one or more notes pages and decks. Density: Cozy, Balanced, Crunched (smaller type, tight margins, fills white space). Sections to include (formulas, key terms, exam tips, plots, worked example). Print or save as PDF.
- **15 Key-term hovers**: key terms are dotted-underlined on the page; hover or tap shows the definition.
- **16 Quiz me on this section**: a short Learn round from the linked deck's cards on that section's topic. "Hide answers" turns worked examples and reveal blocks into questions. Only with a linked deck or questions.
- **18 Find**: Ctrl+F style search on a notes page that jumps between matches and opens folded sections; library search also matches text inside notes.
- Dropped: 17 (make a card from a highlight).
- Parked: 13 (slide images on a free image host). On the roadmap, not in this build.

### Annotations (from the review)
- **Highlights**: select text, pick a colour.
- **Annotations**: a note attached to a selection, shown in the margin (inline under the paragraph on phones).
- **Bookmarks**: a saved position, either a spot (a block) or a selection, listed in the contents rail to jump back to.
- All stored per notes page and synced (a new `note_marks` table, owner-only like the rest).

### Right-click menu (app-wide)
- A context menu in Mneme's style replaces the browser's on the app (not inside text inputs' native editing unless it adds value).
- Always: Copy (with a selection). In inputs: Cut, Copy, Paste, Select all.
- With a selection on a notes page: Highlight, Annotate, Bookmark, Explain with Gemini (shown disabled with "Add a Gemini key" until AI ships).
- On a deck or notes card: Open, Rename, Move, Archive, Delete (same actions as their menus).
- Keyboard and accessibility: opens at the pointer or the focused element (Shift+F10 / Menu key), arrow keys move, Escape closes. Holding Shift while right-clicking shows the browser's own menu.

## Out of scope here
Writing notes yourself (Text notes, next step), AI features (after that), public sharing.

## Build phases
1. **Core**: page type in library, sidebar and search; import of notes and both; the notes page (contents, progress, quick reference, sections, focus, phone); linking both ways with navigation; study tools gated on links; questions counting when linked; prompt options and teaching rules.
2. **Reading tools**: find in page, key-term hovers, right-click menu, highlights, annotations, bookmarks.
3. **New blocks**: derivation, plot, figure; prompt and format docs for them.
4. **Cheat sheet** builder.

Each phase ships on its own, with tests for the logic (parsing, unit sort, linking, progress, marks) and a browser check.
