<p align="center">
  <img src="public/favicon.svg" width="56" alt="" />
</p>

<h1 align="center">Mneme</h1>

<p align="center">Turn your own course material into a quiz that keeps bringing back what you miss.</p>

---

Mneme gives you a prompt to paste into any AI chat along with your slides or textbook pages. The chat writes a structured deck file (terms, questions and explanations). You import that file and study it one question at a time.

> **Status:** early build (M0). It runs locally in guest mode, with everything saved in your browser. Accounts, sync, notes, public decks and the full write-up are next. See the [design spec](docs/superpowers/specs/2026-09-30-mneme-design.md).

## What works now

- **Learn mode:** an endless, adaptive quiz. A missed card comes back 3 or 4 cards later, a card you get right twice in a row steps aside, and terms move from multiple choice to typing once you know them. Behind it, every answer updates an [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) memory model.
- **Flashcards** with Again, Hard, Good and Easy ratings, and **Test** mode with a score and a review of your misses.
- **Seven question types:** multiple choice, select all, true/false, typed answer (typo-tolerant), numeric (`$2,000`, `2k` and `2000.00` all count), fill in the blank, and put in order.
- **A prompt builder:** pick the course, difficulty, length and question styles, then copy or download a prompt tailored to them.
- **A forgiving importer:** it strips code fences and chatter from LLM replies, repairs common mistakes, and skips a broken question with a note instead of rejecting the whole file.
- **Streak effects and sounds,** light and dark themes, six accent colours, and a keyboard-first layout.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5178.

```bash
npm test
```

The test suite covers the parser, the grading rules, the FSRS memory model, the scheduler's no-repeat rules (a property test over 400 random sessions), the prompt builder and the IndexedDB repository.

## Stack

React 19 · TypeScript · Vite · Dexie (IndexedDB) · zod · ts-fsrs · react-markdown with KaTeX · Vitest

## License

MIT
