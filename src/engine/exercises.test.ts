import { describe, expect, it } from 'vitest'
import type { Item, TermItem } from '../deck-format/types'
import { buildExercise } from './exercises'
import { mulberry32 } from './rng'

const term = (key: string, t: string, d: string, topic = 'a'): TermItem => ({ kind: 'term', key, topic, term: t, definition: d, aliases: [] })
const terms: Item[] = [
  term('t1', 'Asset', 'Owned, future benefit, past event.'),
  term('t2', 'Liability', 'Owed to a third party.'),
  term('t3', 'Equity', 'Owed to the owners.'),
  term('t4', 'Revenue', 'Earned by doing the job.', 'b'),
  term('t5', 'Expense', 'Used up to earn revenue.', 'b'),
]

describe('buildExercise', () => {
  it('turns a term into multiple choice with exactly one correct, distinct options', () => {
    for (let seed = 0; seed < 50; seed++) {
      const ex = buildExercise(terms[0], terms, 'recall', mulberry32(seed))
      expect(ex.kind).toBe('mc')
      if (ex.kind !== 'mc') return
      expect(ex.options.filter((o) => o.correct)).toHaveLength(1)
      expect(new Set(ex.options.map((o) => o.text)).size).toBe(ex.options.length)
      expect(ex.options.length).toBe(4)
    }
  })

  it('asks for the typed term when format is typed', () => {
    const ex = buildExercise(terms[1], terms, 'typed', mulberry32(1))
    expect(ex.kind).toBe('typed')
    if (ex.kind === 'typed') {
      expect(ex.prompt).toBe('Owed to a third party.')
      expect(ex.answers).toContain('Liability')
    }
  })

  it('falls back to typed when there are no other terms for distractors', () => {
    const ex = buildExercise(terms[0], [terms[0]], 'recall', mulberry32(1))
    expect(ex.kind).toBe('typed')
  })

  it('keeps a question multiple choice and shuffles its choices', () => {
    const q: Item = {
      kind: 'question', key: 'q', qtype: 'multiple_choice', topic: 'a', prompt: 'P', explanation: 'E', difficulty: 1,
      choices: [{ text: 'A', correct: true }, { text: 'B', correct: false }, { text: 'C', correct: false }, { text: 'D', correct: false }],
    }
    const orders = new Set<string>()
    for (let s = 0; s < 20; s++) {
      const ex = buildExercise(q, [q], 'recall', mulberry32(s))
      if (ex.kind === 'mc') orders.add(ex.options.map((o) => o.text).join(''))
    }
    expect(orders.size).toBeGreaterThan(1)
  })

  it('never presents an ordering question already in the right order', () => {
    const q: Item = { kind: 'question', key: 'o', qtype: 'ordering', topic: 'a', prompt: 'Order', explanation: 'E', difficulty: 2, items: ['1', '2', '3'] }
    for (let s = 0; s < 40; s++) {
      const ex = buildExercise(q, [q], 'recall', mulberry32(s))
      if (ex.kind === 'order') expect(ex.shuffled.join()).not.toBe('1,2,3')
    }
  })
})
