# Studying

## Learn

Learn is an endless queue. It keeps going for as long as you do, and it asks whatever needs you most:

- **Cards that are due**, the ones you're closest to forgetting, come first. Each card is scheduled with [FSRS](https://github.com/open-spaced-repetition/fsrs4anki/wiki/ABC-of-FSRS), the spaced-repetition model Anki uses.
- **New cards** come in a few at a time, in the deck's topic order, with terms and questions mixed in proportion.
- **A miss** comes back three or four cards later and stays close until you get it right twice in a row.
- **A right answer** steps aside and comes back later, harder: a term you picked from a list comes back as one you type.
- **Match rounds** turn up between questions: pair terms with their meanings.

The panel beside the queue shows how much of the deck is new, learning, familiar and mastered.

## How scheduling works

Every card has a **stability**: how many days until you'd have a 90% chance of still remembering it. Each time you get it right, stability grows, and it grows more when you remember it after a long gap. A miss cuts it back. The next review is set for the day your chance of remembering drops to your target.

<forgetting-curve></forgetting-curve>

## Flashcards

Flip a card with **Space**, and use **←** and **→** to move. More options are behind the cog.

## Test

A practice test: pick how many questions and, if you like, a time limit per question. Answer them all, then get a score and go over your misses (or every question) with their explanations.

## While you study

| Key | Does |
|---|---|
| **1**–**9** | Pick an answer |
| **Enter** or **Space** | Check, then continue |
| **M** | Sound on or off |
| **F** | Focus mode (hides everything else) |
| **Esc** | Leave |

## With a Gemini key

Add a free key in **Settings → AI** and these appear in Learn:

- **Ask the tutor**: a chat about the card in front of you. It knows the question, the answer and what you put, and gives hints before answers. Each card keeps its own chat; long chats are summarised so they stay quick.
- **Was I right?**: after a typed answer is marked wrong, Gemini checks whether it means the same thing.
- **Why was I wrong?**: explains the mistake in your thinking.
- **Make a mnemonic**: on cards you've missed three or more times.
- **More like this**: two or three new cards on the same idea, saved in a "Generated" topic.
- **Summarise this session**: in Session stats, what you know and what to review.

The free tier has a limit per minute. When the main model is busy or out of requests, Mneme switches to a lighter one.

