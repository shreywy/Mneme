# Mneme deck generator

You are generating a study deck for **Mneme**, a study app with spaced repetition. The user has attached course material (slides, textbook chapters, notes, past quizzes). Turn it into one structured JSON file that Mneme imports directly.

Mneme uses the file for several study modes:

- **Learn:** an endless adaptive quiz, one item at a time.
- **Flashcards**, **Match** and **Test** modes.

The user can filter to **terms only**, **questions only** or **everything**, and by **topic**. Every explanation you write appears right after the student answers, so explanations teach; they don't just restate the answer.

---

## 1. Settings (the user fills these in; use sensible defaults for anything left blank)

```
COURSE:        (e.g. ACCT 100. Becomes the folder in Mneme)
DECK TITLE:    (e.g. Quiz 1 review)
FOCUS:         (optional: chapters, topics or learning goals to prioritise)
SIZE:          comprehensive   (comprehensive | focused | quick)
EXTRA NOTES:   (optional: e.g. "the prof loves journal-entry questions")
```

- **comprehensive** (default): cover everything in the material that could reasonably be tested. Every key term gets a term entry, and every important concept gets at least one question. Larger material means a larger deck. Don't stop early.
- **focused:** only what FOCUS names, still thoroughly.
- **quick:** only the 20–40 most important items.

---

## 2. Output rules

1. Output **only** the JSON deck: no commentary before or after it.
   - If you can create downloadable files, create one named `<deck-title-in-kebab-case>.mneme.json`.
   - Otherwise, output a single ```` ```json ```` code block.
2. The JSON must be valid: double quotes, no trailing commas, no comments.
3. **If the deck is too long for one response**, split it into parts. Each part must be a complete, valid file with the same `deck.title`, and must set `"part": { "index": N, "of": TOTAL }`. Put `topics` in part 1 only. Mneme merges the parts. After each part, stop and wait for the user to say "continue".
4. Base everything on the attached material. If you add standard knowledge the material doesn't state, set `"source": "general knowledge"` on that item.

---

## 3. File structure

```json
{
  "format": "mneme.deck",
  "version": 1,
  "deck": {
    "title": "Quiz 1 review",
    "course": "ACCT 100",
    "description": "One or two sentences on what this deck covers.",
    "sources": ["Lecture 1–3 slides", "Textbook ch. 1–3"]
  },
  "topics":    [ ...topic objects... ],
  "terms":     [ ...term objects... ],
  "questions": [ ...question objects... ]
}
```

### Topics
Group the material into 3–15 topics, roughly one per lecture section or textbook subsection. Every term and question references one topic by its `id`.

```json
{ "id": "revenue-recognition", "name": "Revenue recognition", "summary": "When and how revenue is recorded." }
```

<!-- terms -->
### Terms (vocabulary: a word or concept and its meaning)

```json
{
  "id": "t-contra-asset",
  "term": "Contra-asset account",
  "definition": "An account with a credit balance that reduces the carrying value of a related asset.",
  "topic": "adjusting-entries",
  "aliases": ["contra asset", "contra account"],
  "example": "Accumulated Depreciation offsets Equipment on the balance sheet.",
  "explanation": "Optional: why it matters or how it's commonly confused.",
  "source": "Lecture 3, slide 14"
}
```

- `term`, `definition` and `topic` are required. Everything else is optional but encouraged.
- Keep definitions **self-contained** and **under ~30 words**. They appear as multiple-choice options next to other definitions, so they must not contain the term itself.
- `aliases` are other accepted spellings or names, used for typed answers.
<!-- /terms -->

### Questions
All questions share these fields:

| field | required | notes |
|---|---|---|
| `id` | yes | `q-` + short kebab slug, unique in the deck |
| `type` | yes | one of the types below |
| `prompt` | yes | the question |
| `topic` | yes | a topic `id` |
| `explanation` | yes | 1–3 sentences on **why** the answer is right. For calculations, show the working. |
| `difficulty` | yes | `1` = recall a fact, `2` = understand or explain, `3` = apply to a scenario or calculate |
| `source` | no | where in the material this comes from |

Type-specific fields:

<!-- type:multiple_choice -->
**`multiple_choice`**: exactly one correct choice, 4 choices preferred (3–5 allowed). Every choice has a short `why`.
```json
{
  "id": "q-accrual-revenue-timing", "type": "multiple_choice", "topic": "revenue-recognition", "difficulty": 1,
  "prompt": "Under accrual accounting, when is revenue recognized?",
  "choices": [
    { "text": "When cash is received", "correct": false, "why": "That is cash-basis accounting." },
    { "text": "When it is earned", "correct": true, "why": "The performance obligation has been satisfied." },
    { "text": "At the end of the fiscal year", "correct": false, "why": "Timing follows performance, not the calendar." },
    { "text": "When the invoice is paid", "correct": false, "why": "Payment timing is irrelevant under accrual accounting." }
  ],
  "explanation": "The revenue recognition principle records revenue when it is earned, regardless of when cash changes hands."
}
```
<!-- /type -->

<!-- type:multiple_select -->
**`multiple_select`**: like `multiple_choice`, but two or more choices are correct. State in the prompt that more than one answer applies.
<!-- /type -->

<!-- type:true_false -->
**`true_false`**
```json
{ "id": "q-unearned-is-liability", "type": "true_false", "topic": "adjusting-entries", "difficulty": 1,
  "prompt": "Unearned revenue is reported as a liability.", "answer": true,
  "explanation": "The company owes the customer goods or services until the revenue is earned." }
```
<!-- /type -->

<!-- type:short_answer -->
**`short_answer`**: a typed answer of one word or a short phrase. `accept` lists other correct phrasings.
```json
{ "id": "q-principle-expenses-match", "type": "short_answer", "topic": "revenue-recognition", "difficulty": 1,
  "prompt": "Which principle says expenses are recorded in the same period as the revenue they help generate?",
  "answer": "Matching principle", "accept": ["expense recognition principle", "matching"],
  "explanation": "Matching pairs costs with the revenue they produced, so each period's profit is meaningful." }
```
<!-- /type -->

<!-- type:numeric -->
**`numeric`**: a typed number. `tolerance` is the allowed absolute error (0 = exact). `unit` is shown next to the input.
```json
{ "id": "q-harbor-adjustment", "type": "numeric", "topic": "adjusting-entries", "difficulty": 3,
  "prompt": "Harbor Co. received $12,000 on Dec 1 for a 6-month contract starting that day. How much revenue is earned by Dec 31?",
  "answer": 2000, "tolerance": 0, "unit": "$",
  "explanation": "$12,000 ÷ 6 months = $2,000 per month; one month has passed." }
```
<!-- /type -->

<!-- type:cloze -->
**`cloze`**: fill in the blank. Wrap each blank's answer in double braces, and separate other accepted answers with `|`.
```json
{ "id": "q-cloze-equation", "type": "cloze", "topic": "accounting-equation", "difficulty": 1,
  "prompt": "Assets = {{Liabilities}} + {{Equity|Owner's equity|Shareholders' equity}}",
  "explanation": "The accounting equation must always balance." }
```
<!-- /type -->

<!-- type:ordering -->
**`ordering`**: list `items` in the **correct** order. Mneme shuffles them.
```json
{ "id": "q-accounting-cycle-order", "type": "ordering", "topic": "accounting-cycle", "difficulty": 2,
  "prompt": "Put these steps of the accounting cycle in order.",
  "items": ["Analyze transactions", "Journalize", "Post to ledger", "Prepare trial balance", "Adjusting entries", "Financial statements"],
  "explanation": "Each step feeds the next, and statements come only after adjustments." }
```
<!-- /type -->

<!-- type:scenario -->
**`scenario`**: one shared case with 2 to 6 questions about it. The case is shown once, and all the questions under it are answered together.
- Use it when several questions depend on the same facts, such as a business's numbers, a set of transactions, or a passage.
- The case goes in `prompt`. A table is fine.
- The questions go in `questions`. They use the same types as above, but have no `topic` or `difficulty` of their own.
```json
{ "id": "q-case-harbor", "type": "scenario", "topic": "adjusting-entries", "difficulty": 3,
  "prompt": "On December 1, Harbor Co. received $12,000 cash for a six-month consulting contract that started that day. It prepares statements on December 31.",
  "questions": [
    { "id": "earned", "type": "numeric", "prompt": "How much revenue is earned by December 31?", "answer": 2000, "unit": "$", "explanation": "$12,000 ÷ 6 = $2,000 per month; one month has passed." },
    { "id": "liability", "type": "numeric", "prompt": "What is the Unearned Revenue balance on December 31?", "answer": 10000, "unit": "$", "explanation": "$12,000 received − $2,000 earned." },
    { "id": "cash-entry", "type": "true_false", "prompt": "The December 31 adjustment debits Cash.", "answer": false, "explanation": "Cash was recorded on December 1; the adjustment moves $2,000 from Unearned Revenue to Revenue." }
  ],
  "explanation": "Cash came in first, so the adjustment only shifts the earned part from the liability to revenue." }
```
<!-- /type -->

### Formatting inside text fields
Mneme renders Markdown and LaTeX, so format for reading, not as one long line.

**Where formatting works:** `prompt`, `definition`, `explanation`, `example`, the scenario case, choice `text` and `why`.

**Markdown**
- Use `\n` for a line break and `\n\n` for a new paragraph inside a JSON string.
- Use **bold** for the key word, lists for steps or conditions, and tables for anything with rows and columns (journal entries, comparisons, data). A table goes on its own lines:
  `"| Account | Debit | Credit |\n|---|---|---|\n| Cash | 500 | |\n| Revenue | | 500 |"`
- Don't use HTML, images or links in these fields. Mneme removes them. For visuals, use `demo` (below).

**Math with LaTeX**
- Put LaTeX between **double** dollar signs: `$$\\frac{a}{b}$$`. It can sit inside a sentence or on its own line. A single `$` always means money, so write `$12,000` as normal.
- **Escape every backslash in JSON**: write `\\frac`, `\\text`, `\\times`, `\\begin{aligned}`. (Mneme repairs most single-backslash mistakes, but don't rely on it.)
- Inside LaTeX, write thousands as `12{,}000` so the comma doesn't add a space.
- Put words inside math in `\\text{}`: `$$\\text{Profit} = \\text{Revenue} - \\text{Expenses}$$`.

**Calculations in explanations** (this matters most for math-heavy courses)
1. If a formula is used, state it first, on its own line, with each symbol named.
2. Then show the working one step per line, using `aligned` with `&=` so the equals signs line up.
3. Finish with the answer in a short sentence.

Example `explanation` value (as it appears inside the JSON string):
```
"Formula: $$\\text{Ending equity} = \\text{Opening equity} + \\text{Contributions} + \\text{Revenue} - \\text{Expenses} - \\text{Dividends}$$\n\n$$\\begin{aligned} \\text{Ending equity} &= 98{,}250 + 20{,}000 + 324{,}600 - 296{,}750 - 7{,}000 \\\\ &= 139{,}100 \\\\ \\text{Assets} &= \\text{Liabilities} + \\text{Equity} \\\\ &= 209{,}200 + 139{,}100 \\\\ &= 348{,}300 \\end{aligned}$$\n\nSo assets are **$348,300**."
```
- Terms can use LaTeX too. For example, a ratio's `definition` can end with its formula.
- Multi-line `prompt`s are fine when a question needs data. Put the numbers in a list or table instead of one long sentence.

### Visual demos (optional, for ideas that need a picture or interaction)
Any term or question can carry a `demo`: a small, self-contained HTML page that Mneme runs in a sandbox.

Use one when a static explanation isn't enough:
- a physics simulation
- an algorithm stepping through
- a slider showing how a curve shifts
- a labelled diagram
- an animated process

Leave it out otherwise. Most cards don't need one.

```json
"demo": {
  "title": "Shift the demand curve",
  "placement": "explanation",
  "height": 320,
  "html": "<style>body{font:14px system-ui;margin:12px}</style><input type=range id=s min=-50 max=50 value=0><svg id=g width=100% height=240></svg><script>/* draw and redraw on input */</script>"
}
```

**Fields**
- `html`: one HTML snippet with inline `<style>` and `<script>`. Keep it under 40 KB.
- `placement`:
  - `"explanation"` (the default) shows the demo after the student answers.
  - `"question"` shows it with the question, when the student needs it to answer.
- `height`: the starting height in pixels. The frame grows to fit its content.

**Rules**
- **No network.** External scripts, fonts, CDNs, images, `fetch` and iframes are all blocked. Draw with SVG, canvas or CSS. Inline `data:` images are fine.
- **Use the theme colours,** so the demo matches light and dark mode. These CSS variables are provided: `var(--bg)`, `var(--surface)`, `var(--ink)`, `var(--muted)`, `var(--line)`, `var(--accent)`, `var(--good)`, `var(--bad)`, and the font `var(--font)`.
- Keep it small and focused on one idea, with plain labels. It must work with mouse and touch.

**Style (so the demo looks like part of Mneme, not an embedded web page)**
- **Leave the background transparent.** Don't set a background on `html` or `body`, so the demo sits on Mneme's page. If you need a panel, use `var(--surface)` with a 1px `var(--line)` border and 8px corners.
- **Type:**
  - `font-family: var(--font)` for everything, and `var(--serif)` for a heading if you use one.
  - 13–14px for labels, in `var(--muted)`.
  - Sentence case, no all-caps, no emoji.
- **Colour:** draw in `var(--ink)` and use `var(--accent)` only for the thing being demonstrated (the moving point, the highlighted bar). Use `var(--good)` and `var(--bad)` only for right and wrong. Don't use any other colours.
- **Shapes:**
  - Lines and strokes are 1–1.5px.
  - Corners are 6–10px.
  - No drop shadows, gradients, glows or 3D effects.
- **Controls:** use plain native inputs (`<input type=range>`, `<button>`). They're already styled to match. Give each one a short label.
- **Motion:** 150–300ms ease-out. Nothing loops forever unless the loop is the point (a wave, a cycle). Offer a pause button for anything that moves on its own.
- **Static images:** if you only need a labelled picture, a demo with a single inline `<svg>` in this style is right.

---

## 4. Quality rules (these matter most)

**Coverage**
- Decide what an exam on this material would test, then make sure all of it is covered.
- Aim for a real **mix**: about 55–65% `multiple_choice`, and the rest spread across `true_false`, `short_answer`, `numeric`, `cloze`, `ordering`, `multiple_select` and `scenario`, wherever they fit naturally. Worked examples and multi-step problems from the material make good `scenario` cards.
- Calculation-heavy material should get plenty of `numeric` questions.
- Include `difficulty: 3` scenario questions like the ones on real exams, not just recall.

**Every question stands on its own**
- The student sees one question at a time, without the textbook. Never refer to exercise numbers, page numbers or anything outside the question ("the PQ2-4 business", "the company in Example 3", "as shown in Figure 2").
- If a question needs facts from a worked example, either put those facts in the question itself, or make a `scenario` that contains the case and several questions about it.
- Don't ask about the material itself ("What does slide 12 show?"). Ask about the ideas.

**Terms vs. questions**
- Every important vocabulary word goes in `terms`, even if a question also covers it. Mneme builds its own term drills from `terms`, so don't also write "What does X mean?" questions.
- Put everything else in `questions`: reasoning, application, calculation, cause and effect, comparisons.

**Multiple-choice craft**
- Wrong choices must be **plausible**: common misconceptions, near-miss numbers from typical calculation mistakes, or related terms.
- Choices should be similar in length and grammar, so the right one doesn't stand out.
- Never use "All of the above", "None of the above" or joke options.
- Don't repeat the same question with slightly different wording.

**Explanations**
- Teach the idea in 1–3 sentences.
- For calculations, show the steps.
- For misconceptions, say why the tempting wrong answer is wrong.

**Writing style** (students read every word of this in the app)
- Write like a sharp teaching assistant's notes: plain, direct and specific. Use short sentences with real numbers and examples.
- Don't use filler or AI-sounding wording:
  - no chains of em dashes
  - none of these words: "delve", "crucial", "pivotal", "key takeaway", "it's important to note", "not just X but Y"
  - no hype adjectives, no emoji
- Wrong-choice `why` notes are one short clause, e.g. "That is cash-basis accounting."

**Ids**
- Short and descriptive (`q-harbor-adjustment`, `t-contra-asset`), and unique across the whole deck and all parts.

**Self-check before you output**
- Every `multiple_choice` has exactly one `"correct": true`, and every `multiple_select` has at least two.
- No question mentions an exercise number, page, figure or example the student can't see.
- Every `topic` value matches a topic `id`.
- There are no duplicate ids or duplicate questions.
- Numbers in explanations match the answers.
- The JSON is valid.

---

## 5. Complete example

A small but complete deck showing every item type. Your real deck should be much larger, as set by SIZE.

```json
{
  "format": "mneme.deck",
  "version": 1,
  "deck": {
    "title": "Quiz 1 review",
    "course": "ACCT 100",
    "description": "Accrual basics, adjusting entries and the accounting cycle. A small sample showing every item type.",
    "sources": [
      "Lecture 1–3 slides",
      "Textbook ch. 1–3"
    ]
  },
  "topics": [
    {
      "id": "accounting-equation",
      "name": "The accounting equation"
    },
    {
      "id": "revenue-recognition",
      "name": "Revenue recognition",
      "summary": "When and how revenue is recorded."
    },
    {
      "id": "adjusting-entries",
      "name": "Adjusting entries"
    },
    {
      "id": "accounting-cycle",
      "name": "The accounting cycle"
    }
  ],
  "terms": [
    {
      "id": "t-contra-asset",
      "term": "Contra-asset account",
      "definition": "An account with a credit balance that reduces the carrying value of a related asset.",
      "topic": "adjusting-entries",
      "aliases": [
        "contra asset",
        "contra account"
      ],
      "example": "Accumulated Depreciation offsets Equipment on the balance sheet.",
      "source": "Lecture 3, slide 14"
    },
    {
      "id": "t-unearned-revenue",
      "term": "Unearned revenue",
      "definition": "Cash received before goods or services are delivered; recorded as a liability until earned.",
      "topic": "adjusting-entries",
      "aliases": [
        "deferred revenue"
      ]
    },
    {
      "id": "t-matching-principle",
      "term": "Matching principle",
      "definition": "Expenses are recorded in the same period as the revenue they help generate.",
      "topic": "revenue-recognition",
      "aliases": [
        "expense recognition principle"
      ]
    },
    {
      "id": "t-accrual-basis",
      "term": "Accrual basis",
      "definition": "Records revenue when earned and expenses when incurred, regardless of cash timing.",
      "topic": "revenue-recognition",
      "explanation": "Required under GAAP and IFRS for most companies; contrast with cash basis."
    }
  ],
  "questions": [
    {
      "id": "q-accrual-revenue-timing",
      "type": "multiple_choice",
      "topic": "revenue-recognition",
      "difficulty": 1,
      "prompt": "Under accrual accounting, when is revenue recognized?",
      "choices": [
        {
          "text": "When cash is received from the customer",
          "correct": false,
          "why": "That is cash-basis accounting."
        },
        {
          "text": "When it is earned, regardless of when cash changes hands",
          "correct": true,
          "why": "The performance obligation has been satisfied."
        },
        {
          "text": "At the end of the fiscal period",
          "correct": false,
          "why": "Timing follows performance, not the calendar."
        },
        {
          "text": "When the invoice is sent",
          "correct": false,
          "why": "Billing is paperwork; it does not decide when revenue is earned."
        }
      ],
      "explanation": "The revenue recognition principle ties revenue to when the performance obligation is satisfied. Cash timing only matters under cash-basis accounting."
    },
    {
      "id": "q-harbor-adjusting-entry",
      "type": "multiple_choice",
      "topic": "adjusting-entries",
      "difficulty": 3,
      "prompt": "On December 1, Harbor Co. received $12,000 cash in advance for a six-month consulting contract that began that day. No adjusting entries have been recorded yet. Which adjusting entry must Harbor Co. record on December 31?",
      "choices": [
        {
          "text": "Dr Unearned Revenue $2,000; Cr Service Revenue $2,000",
          "correct": true,
          "why": "One month of six has been earned."
        },
        {
          "text": "Dr Cash $2,000; Cr Service Revenue $2,000",
          "correct": false,
          "why": "Cash was already recorded on December 1."
        },
        {
          "text": "Dr Service Revenue $10,000; Cr Unearned Revenue $10,000",
          "correct": false,
          "why": "Reverses the direction; revenue was never recorded."
        },
        {
          "text": "No entry until the contract is complete",
          "correct": false,
          "why": "Accrual accounting recognizes revenue as it is earned."
        }
      ],
      "explanation": "$12,000 ÷ 6 = $2,000 earned in December. The liability shrinks and revenue is recognized:\n\n| Account | Debit | Credit |\n|---|---|---|\n| Unearned Revenue | 2,000 | |\n| Service Revenue | | 2,000 |",
      "source": "Textbook ch. 3, exercise 3-4"
    },
    {
      "id": "q-debits-that-increase",
      "type": "multiple_select",
      "topic": "accounting-equation",
      "difficulty": 2,
      "prompt": "Which of these accounts normally **increase** with a debit? Select all that apply.",
      "choices": [
        {
          "text": "Cash",
          "correct": true
        },
        {
          "text": "Rent Expense",
          "correct": true
        },
        {
          "text": "Unearned Revenue",
          "correct": false,
          "why": "Liabilities increase with credits."
        },
        {
          "text": "Common Stock",
          "correct": false,
          "why": "Equity increases with credits."
        }
      ],
      "explanation": "Assets and expenses have normal debit balances; liabilities, equity and revenue have normal credit balances."
    },
    {
      "id": "q-unearned-is-liability",
      "type": "true_false",
      "topic": "adjusting-entries",
      "difficulty": 1,
      "prompt": "Unearned revenue is reported as a liability on the balance sheet.",
      "answer": true,
      "explanation": "The company owes the customer goods or services until the revenue is earned."
    },
    {
      "id": "q-contra-example",
      "type": "short_answer",
      "topic": "adjusting-entries",
      "difficulty": 1,
      "prompt": "Name the contra-asset account paired with Equipment.",
      "answer": "Accumulated Depreciation",
      "accept": [
        "accumulated depreciation - equipment",
        "acc. depreciation"
      ],
      "explanation": "Accumulated Depreciation carries a credit balance that reduces Equipment to its book value."
    },
    {
      "id": "q-harbor-earned-amount",
      "type": "numeric",
      "topic": "adjusting-entries",
      "difficulty": 3,
      "prompt": "Harbor Co. received $12,000 on Dec 1 for a 6-month contract starting that day. How much revenue has been earned by Dec 31?",
      "answer": 2000,
      "tolerance": 0,
      "unit": "$",
      "explanation": "$12,000 ÷ 6 months = $2,000 per month, and one month has passed."
    },
    {
      "id": "q-cloze-equation",
      "type": "cloze",
      "topic": "accounting-equation",
      "difficulty": 1,
      "prompt": "Assets = {{Liabilities}} + {{Equity|Owner's equity|Shareholders' equity}}",
      "explanation": "The accounting equation must always balance after every transaction."
    },
    {
      "id": "q-accounting-cycle-order",
      "type": "ordering",
      "topic": "accounting-cycle",
      "difficulty": 2,
      "prompt": "Put these steps of the accounting cycle in order.",
      "items": [
        "Analyze transactions",
        "Journalize",
        "Post to the ledger",
        "Prepare a trial balance",
        "Record adjusting entries",
        "Prepare financial statements"
      ],
      "explanation": "Each step feeds the next; statements come only after adjustments so they reflect accrual-basis numbers."
    },
    {
      "id": "q-case-harbor",
      "type": "scenario",
      "topic": "adjusting-entries",
      "difficulty": 3,
      "prompt": "On December 1, Harbor Co. received $12,000 cash for a six-month consulting contract that started that day. It prepares statements on December 31.",
      "questions": [
        {
          "id": "earned",
          "type": "numeric",
          "prompt": "How much revenue is earned by December 31?",
          "answer": 2000,
          "unit": "$",
          "explanation": "$12,000 ÷ 6 = $2,000 per month; one month has passed."
        },
        {
          "id": "liability",
          "type": "numeric",
          "prompt": "What is the Unearned Revenue balance on December 31?",
          "answer": 10000,
          "unit": "$",
          "explanation": "$12,000 received − $2,000 earned."
        },
        {
          "id": "cash-entry",
          "type": "true_false",
          "prompt": "The December 31 adjustment debits Cash.",
          "answer": false,
          "explanation": "Cash was recorded on December 1. The adjustment moves $2,000 from Unearned Revenue to revenue."
        }
      ],
      "explanation": "Cash came in first, so the adjustment only shifts the earned part from the liability to revenue."
    }
  ]
}
```
