import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDeckText, mergeParts } from './parse'
import { extractPromptExample } from './example'

const PROMPT = readFileSync(join(__dirname, '../../deck-format/mneme-deck-prompt.md'), 'utf8')

function minimal(overrides: Record<string, unknown> = {}) {
  return {
    format: 'mneme.deck',
    version: 1,
    deck: { title: 'T' },
    topics: [{ id: 'basics', name: 'Basics' }],
    terms: [{ id: 't-a', term: 'Asset', definition: 'Something owned with future benefit.', topic: 'basics' }],
    questions: [
      {
        id: 'q-1', type: 'multiple_choice', topic: 'basics', difficulty: 1, prompt: 'Pick', explanation: 'Because.',
        choices: [{ text: 'A', correct: true }, { text: 'B', correct: false }],
      },
    ],
    ...overrides,
  }
}

describe('parseDeckText', () => {
  it('accepts the example embedded in the prompt file', () => {
    const r = parseDeckText(extractPromptExample(PROMPT))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.deck.title).toBe('Quiz 1 review')
      expect(r.deck.items.filter((i) => i.kind === 'term').length).toBe(4)
      expect(r.deck.items.filter((i) => i.kind === 'question').length).toBe(9)
    }
  })

  const privDir = join(__dirname, '../../fixtures/private')
  const privateFiles = existsSync(privDir) ? readdirSync(privDir).filter((f) => f.endsWith('.json')) : []
  it.skipIf(privateFiles.length === 0)('accepts every private real-world deck', () => {
    for (const f of privateFiles) {
      const r = parseDeckText(readFileSync(join(privDir, f), 'utf8'))
      expect(r.ok, `${f}: ${!r.ok ? r.errors.join('; ') : ''}`).toBe(true)
    }
  })

  it('strips a markdown code fence and chatter around the JSON', () => {
    const text = 'Here is your deck:\n```json\n' + JSON.stringify(minimal()) + '\n```\nLet me know if you want more!'
    const r = parseDeckText(text)
    expect(r.ok).toBe(true)
  })

  it('maps a topic name to its id and warns', () => {
    const d = minimal()
    ;(d.terms as { topic: string }[])[0].topic = 'Basics'
    const r = parseDeckText(JSON.stringify(d))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.deck.items[0].topic).toBe('basics')
      expect(r.warnings.join(' ')).toMatch(/topic/i)
    }
  })

  it('coerces "true"/"false" strings and fills a missing difficulty with 2', () => {
    const d = minimal({
      questions: [{ id: 'q-tf', type: 'true_false', topic: 'basics', prompt: 'P', explanation: 'E', answer: 'true' }],
    })
    const r = parseDeckText(JSON.stringify(d))
    expect(r.ok).toBe(true)
    if (r.ok) {
      const q = r.deck.items.find((i) => i.key === 'q-tf')
      expect(q && q.kind === 'question' && q.qtype === 'true_false' && q.answer).toBe(true)
      expect(q && q.kind === 'question' && q.difficulty).toBe(2)
    }
  })

  it('skips a multiple-choice question with two correct answers, naming it in a warning', () => {
    const d = minimal()
    ;(d.questions as { choices: { correct: boolean }[] }[])[0].choices[1].correct = true
    const r = parseDeckText(JSON.stringify(d))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.deck.items.some((i) => i.key === 'q-1')).toBe(false)
      expect(r.warnings.join(' ')).toMatch(/q-1/)
    }
  })

  it('fails when nothing usable is left', () => {
    const r = parseDeckText(JSON.stringify(minimal({ terms: [], questions: [] })))
    expect(r.ok).toBe(false)
  })

  it('skips an unknown question type with a warning instead of failing', () => {
    const d = minimal()
    ;(d.questions as unknown[]).push({ id: 'q-essay', type: 'essay', topic: 'basics', prompt: 'Write', explanation: 'x', difficulty: 2 })
    const r = parseDeckText(JSON.stringify(d))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.deck.items.some((i) => i.key === 'q-essay')).toBe(false)
      expect(r.warnings.join(' ')).toMatch(/essay/)
    }
  })

  it('gives a readable error for text that is not JSON', () => {
    const r = parseDeckText('I could not create the deck, sorry.')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/JSON/)
  })

  it('rejects a file that is not a Mneme deck', () => {
    const r = parseDeckText(JSON.stringify({ hello: 'world' }))
    expect(r.ok).toBe(false)
  })

  it('drops duplicate ids, keeping the first, with a warning', () => {
    const d = minimal()
    ;(d.terms as unknown[]).push({ id: 't-a', term: 'Dup', definition: 'Dup def', topic: 'basics' })
    const r = parseDeckText(JSON.stringify(d))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.deck.items.filter((i) => i.key === 't-a').length).toBe(1)
      expect(r.warnings.join(' ')).toMatch(/duplicate/i)
    }
  })
})

describe('LaTeX escaping mistakes from LLMs', () => {
  const withExplanation = (raw: string) =>
    `{"format":"mneme.deck","version":1,"deck":{"title":"T"},"topics":[{"id":"a","name":"A"}],"terms":[],"questions":[{"id":"q","type":"true_false","topic":"a","difficulty":1,"prompt":"P","answer":true,"explanation":"${raw}"}]}`
  const explanation = (raw: string) => {
    const r = parseDeckText(withExplanation(raw))
    if (!r.ok) throw new Error(r.errors.join())
    const q = r.deck.items[0]
    return q.kind === 'question' ? q.explanation : ''
  }

  it('repairs single backslashes that JSON reads as control characters (\\frac, \\text, \\neq, \\beta)', () => {
    expect(explanation('$$\\frac{1}{2}$$')).toBe('$$\\frac{1}{2}$$')
    expect(explanation('$$\\text{Profit}$$')).toBe('$$\\text{Profit}$$')
    expect(explanation('$$a \\neq b$$')).toBe('$$a \\neq b$$')
    expect(explanation('$$\\beta$$')).toBe('$$\\beta$$')
  })

  it('repairs backslashes JSON does not allow at all (\\epsilon, \\underline)', () => {
    expect(explanation('$$\\epsilon + \\underline{x}$$')).toBe('$$\\epsilon + \\underline{x}$$')
  })

  it('leaves correctly escaped LaTeX and real line breaks alone', () => {
    expect(explanation('$$\\\\frac{a}{b}$$')).toBe('$$\\frac{a}{b}$$')
    expect(explanation('Line one\\nLine two')).toBe('Line one\nLine two')
    expect(explanation('$$\\\\begin{aligned} a &= b \\\\\\\\ c &= d \\\\end{aligned}$$')).toBe('$$\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}$$')
  })
})

describe('chat-safe encoding', () => {
  it('turns ⟦…⟧ math into $$…$$ and decodes \\u003c-escaped demo HTML', () => {
    const raw = `{"format":"mneme.deck","version":1,"deck":{"title":"T"},"topics":[{"id":"a","name":"A"}],"terms":[],"questions":[{"id":"q","type":"true_false","topic":"a","difficulty":1,"prompt":"Is ⟦\\\\frac{1}{2}⟧ a half?","answer":true,"explanation":"Yes: ⟦\\\\text{half} = 0.5⟧","demo":{"html":"\\u003csvg\\u003e\\u003c/svg\\u003e"}}]}`
    const r = parseDeckText(raw)
    if (!r.ok) throw new Error(r.errors.join())
    const q = r.deck.items[0]
    expect(q.kind === 'question' && q.prompt).toBe('Is $$\\frac{1}{2}$$ a half?')
    expect(q.kind === 'question' && q.explanation).toBe('Yes: $$\\text{half} = 0.5$$')
    expect(q.demo?.html).toBe('<svg></svg>')
  })
})

describe('demos', () => {
  it('keeps a demo on a question and a term, defaulting placement to explanation', () => {
    const d = minimal()
    ;(d.questions as Record<string, unknown>[])[0].demo = { title: 'Slide it', html: '<svg></svg>', height: 200 }
    ;(d.terms as Record<string, unknown>[])[0].demo = { html: '<p>x</p>', placement: 'question' }
    const r = parseDeckText(JSON.stringify(d))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const q = r.deck.items.find((i) => i.key === 'q-1')!
    const t = r.deck.items.find((i) => i.key === 't-a')!
    expect(q.demo).toEqual({ title: 'Slide it', html: '<svg></svg>', height: 200, placement: 'explanation' })
    expect(t.demo?.placement).toBe('question')
  })

  it('drops an oversized demo with a warning but keeps the card', () => {
    const d = minimal()
    ;(d.questions as Record<string, unknown>[])[0].demo = { html: 'x'.repeat(70_000) }
    const r = parseDeckText(JSON.stringify(d))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.deck.items.find((i) => i.key === 'q-1')?.demo).toBeUndefined()
    expect(r.warnings.join(' ')).toMatch(/demo/i)
  })
})

describe('scenario questions', () => {
  const scenario = (parts: unknown[]) => minimal({
    questions: [{
      id: 'q-case', type: 'scenario', topic: 'basics', difficulty: 3, explanation: 'Overall.',
      prompt: 'Harbor Co. received $12,000 on Dec 1 for 6 months of work.',
      questions: parts,
    }],
  })
  const tf = { id: 'p1', type: 'true_false', prompt: 'Revenue is earned evenly.', answer: true, explanation: 'Yes.' }
  const num = { id: 'p2', type: 'numeric', prompt: 'Revenue earned by Dec 31?', answer: 2000, explanation: '12,000 / 6.' }

  it('parses a shared case with its sub-questions', () => {
    const r = parseDeckText(JSON.stringify(scenario([tf, num])))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const q = r.deck.items.find((i) => i.key === 'q-case')
    expect(q?.kind === 'question' && q.qtype === 'scenario' && q.parts.map((p) => p.qtype)).toEqual(['true_false', 'numeric'])
  })

  it('drops a broken part with a warning and keeps the rest', () => {
    const r = parseDeckText(JSON.stringify(scenario([tf, num, { id: 'p3', type: 'multiple_choice', prompt: 'x', explanation: 'y', choices: [] }])))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const q = r.deck.items.find((i) => i.key === 'q-case')
    expect(q?.kind === 'question' && q.qtype === 'scenario' && q.parts.length).toBe(2)
    expect(r.warnings.join(' ')).toMatch(/p3/)
  })

  it('skips a scenario with fewer than two usable parts', () => {
    const r = parseDeckText(JSON.stringify(scenario([tf])))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.deck.items.some((i) => i.key === 'q-case')).toBe(false)
  })
})

describe('mergeParts', () => {
  it('keeps the union of items by key and prefers the incoming version', () => {
    const a = parseDeckText(JSON.stringify(minimal({ deck: { title: 'T', part: { index: 1, of: 2 } } })))
    const bDeck = minimal({
      deck: { title: 'T', part: { index: 2, of: 2 } },
      topics: [],
      terms: [
        { id: 't-a', term: 'Asset', definition: 'Updated definition.', topic: 'basics' },
        { id: 't-b', term: 'Liability', definition: 'Owed to a third party.', topic: 'basics' },
      ],
      questions: [],
    })
    const b = parseDeckText(JSON.stringify(bDeck))
    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) {
      const m = mergeParts(a.deck, b.deck)
      expect(m.items.map((i) => i.key).sort()).toEqual(['q-1', 't-a', 't-b'])
      const ta = m.items.find((i) => i.key === 't-a')
      expect(ta && ta.kind === 'term' && ta.definition).toBe('Updated definition.')
      expect(m.topics.map((t) => t.id)).toEqual(['basics'])
    }
  })
})

describe('hints', () => {
  const H = ['Lecture 2', 'Balance sheet basics', 'Think of what a company owns']
  it('keeps up to three hints on terms and questions, in order', () => {
    const r = parseDeckText(JSON.stringify(minimal({
      terms: [{ id: 't-a', term: 'Asset', definition: 'Something owned with future benefit.', topic: 'basics', hints: [...H, 'a fourth'] }],
      questions: [{ id: 'q-1', type: 'true_false', topic: 'basics', difficulty: 1, prompt: 'Cash is an asset', explanation: 'It is.', answer: true, hints: 'Lecture 1' }],
    })))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.deck.items[0].hints).toEqual(H)
    expect(r.deck.items[1].hints).toEqual(['Lecture 1'])
    expect(r.warnings.some((w) => w.includes('first three'))).toBe(true)
  })
  it('drops a hint that names the answer', () => {
    const r = parseDeckText(JSON.stringify(minimal({
      terms: [{ id: 't-a', term: 'Asset', definition: 'Something owned.', topic: 'basics', hints: ['Lecture 2', 'It is an asset.', 'Assets are listed first'] }],
      questions: [
        { id: 'q-1', type: 'short_answer', topic: 'basics', difficulty: 1, prompt: 'Opposite of debit?', explanation: '.', answer: 'Credit', accept: [], hints: ['Starts with C', 'credit side'] },
        { id: 'q-2', type: 'cloze', topic: 'basics', difficulty: 1, prompt: 'A = {{Liabilities|Debts}} + E', explanation: '.', hints: ['Think debts'] },
      ],
    })))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // "Assets" isn't the whole word "Asset", so it stays.
    expect(r.deck.items.map((i) => i.hints)).toEqual([['Lecture 2', 'Assets are listed first'], ['Starts with C'], undefined])
    expect(r.warnings.filter((w) => w.includes('gave the answer away'))).toHaveLength(3)
  })
})
