# Making a deck

Mneme doesn't need an AI key to make decks. It writes a prompt; you take it to the AI chat you already use, together with your course material, and bring the deck file back.

## The prompt builder

**Get the LLM prompt** opens a short form. Every field is optional, and **Copy prompt** works straight away.

| Option | What it changes |
|---|---|
| What to make | A study deck, notes, or both (a notes page with a deck linked to it) |
| Course, unit, title | Where it's filed and what it's called |
| Focus | Topics to cover more, or leave out |
| Length | How many terms and questions, or how long the notes are |
| Difficulty | Mixed, easier or harder questions |
| Hints | Three per card: the lecture, the topic, then a clue. On for a deck by itself, off when notes come too |
| Plots and figures | For notes: none, some or lots |
| Questions on the page | For notes: questions to check yourself as you read |
| Maths | For notes: brief, or step by step |

The prompt asks the AI for one JSON file, an explanation for every question, and a reason for every wrong choice. "Why is B wrong?" then works without any AI in Mneme.

## Question types

Multiple choice, multiple select, true or false, short answer (forgiving spelling), numeric (with a tolerance), fill in the blank, ordering, and **scenario**: a short case with several questions about it.

## Importing

Press **Import** and paste the reply, or drop the file. Mneme is forgiving about what the AI sends:

1. Code fences and stray text around the JSON are stripped.
2. A repair pass fixes the usual slips (a topic given by name instead of id, `"true"` instead of `true`, a missing difficulty) and tells you what it fixed.
3. The file is then checked strictly against the deck schema. Anything still wrong is shown with where it is and what to do.

Big decks can come in **parts** with the same title; Mneme merges them. Re-importing an updated deck keeps your progress on every card whose id didn't change.

## The format

A deck file is `{ "format": "mneme.deck", "version": 1, "deck", "topics", "terms", "questions" }`. The full description, with a complete example that the test suite imports on every run, is [`deck-format/mneme-deck-prompt.md`](https://github.com/shreywy/Mneme/blob/main/deck-format/mneme-deck-prompt.md). The JSON Schema is [`deck.schema.json`](https://github.com/shreywy/Mneme/blob/main/deck-format/deck.schema.json).

Text can use Markdown and LaTeX (`$$…$$`). Cards can also carry a small **demo**: an interactive HTML snippet that runs in a locked-down frame with no network, no storage and no access to the page around it.

## Exporting

Every deck exports as a `.mneme.json` file from its menu, and **Settings → Backup** saves your whole library as one file.
