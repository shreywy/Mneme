import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractPromptExample } from './example'
import { parseDeckText } from './parse'
import { toDeckFile } from './export'

const PROMPT = readFileSync(join(__dirname, '../../deck-format/mneme-deck-prompt.md'), 'utf8')

describe('toDeckFile', () => {
  it('round-trips: exporting then importing gives back the same cards', () => {
    const a = parseDeckText(extractPromptExample(PROMPT))
    if (!a.ok) throw new Error(a.errors.join())
    const file = toDeckFile({ title: a.deck.title, course: a.deck.course, description: a.deck.description, sources: a.deck.sources, topics: a.deck.topics }, a.deck.items)
    const b = parseDeckText(JSON.stringify(file))
    if (!b.ok) throw new Error(b.errors.join())
    expect(b.warnings).toEqual([])
    expect(b.deck.items).toEqual(a.deck.items)
    expect(b.deck.topics).toEqual(a.deck.topics)
    expect(b.deck.title).toBe(a.deck.title)
  })

  it('keeps demos and scenario parts', () => {
    const items = [
      { kind: 'term' as const, key: 't', topic: 'a', term: 'T', definition: 'D', aliases: [], demo: { html: '<p>x</p>', placement: 'question' as const } },
      {
        kind: 'question' as const, key: 'q-case', qtype: 'scenario' as const, topic: 'a', prompt: 'Case', explanation: '', difficulty: 3 as const,
        parts: [
          { kind: 'question' as const, key: 'q-case--p1', qtype: 'true_false' as const, topic: 'a', prompt: 'P1', explanation: 'E', difficulty: 3 as const, answer: true },
          { kind: 'question' as const, key: 'q-case--p2', qtype: 'true_false' as const, topic: 'a', prompt: 'P2', explanation: 'E', difficulty: 3 as const, answer: false },
        ],
      },
    ]
    const b = parseDeckText(JSON.stringify(toDeckFile({ title: 'X', sources: [], topics: [{ id: 'a', name: 'A' }] }, items)))
    if (!b.ok) throw new Error(b.errors.join())
    expect(b.deck.items).toEqual(items)
  })
})
