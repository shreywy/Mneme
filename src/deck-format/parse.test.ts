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
      expect(r.deck.items.filter((i) => i.kind === 'question').length).toBe(8)
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
