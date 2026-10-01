import type { Item, TermItem } from '../deck-format/types'
import { parseCloze, type ParsedCloze } from './grading'
import { shuffle, type Rng } from './rng'

export type Option = { text: string; correct: boolean; why?: string }

export type Exercise = { key: string; item: Item } & (
  | { kind: 'mc'; prompt: string; promptKind: 'question' | 'term' | 'definition'; options: Option[] }
  | { kind: 'ms'; prompt: string; options: Option[] }
  | { kind: 'tf'; prompt: string; answer: boolean }
  | { kind: 'typed'; prompt: string; promptKind: 'question' | 'definition'; answers: string[] }
  | { kind: 'numeric'; prompt: string; answer: number; tolerance: number; unit?: string }
  | { kind: 'cloze'; cloze: ParsedCloze }
  | { kind: 'order'; prompt: string; items: string[]; shuffled: string[] }
  | { kind: 'scenario'; prompt: string; parts: Exercise[] }
)

function distractorTerms(t: TermItem, pool: Item[], rng: Rng, n: number): TermItem[] {
  const others = pool.filter((i): i is TermItem => i.kind === 'term' && i.key !== t.key
    && i.term.toLowerCase() !== t.term.toLowerCase() && i.definition !== t.definition)
  const same = shuffle(others.filter((o) => o.topic === t.topic), rng)
  const rest = shuffle(others.filter((o) => o.topic !== t.topic), rng)
  return [...same, ...rest].slice(0, n)
}

export function buildExercise(item: Item, pool: Item[], format: 'recall' | 'typed', rng: Rng = Math.random): Exercise {
  const key = item.key
  if (item.kind === 'term') {
    const typed = { key, item, kind: 'typed' as const, prompt: item.definition, promptKind: 'definition' as const, answers: [item.term, ...item.aliases] }
    if (format === 'typed') return typed
    const ds = distractorTerms(item, pool, rng, 3)
    if (ds.length === 0) return typed
    const askDefinition = rng() < 0.5
    const options = askDefinition
      ? shuffle([{ text: item.definition, correct: true }, ...ds.map((d) => ({ text: d.definition, correct: false, why: `That describes ${d.term}.` }))], rng)
      : shuffle([{ text: item.term, correct: true }, ...ds.map((d) => ({ text: d.term, correct: false, why: `${d.term}: ${d.definition}` }))], rng)
    return askDefinition
      ? { key, item, kind: 'mc', prompt: item.term, promptKind: 'term', options }
      : { key, item, kind: 'mc', prompt: item.definition, promptKind: 'definition', options }
  }
  switch (item.qtype) {
    case 'multiple_choice': return { key, item, kind: 'mc', prompt: item.prompt, promptKind: 'question', options: shuffle(item.choices, rng) }
    case 'multiple_select': return { key, item, kind: 'ms', prompt: item.prompt, options: shuffle(item.choices, rng) }
    case 'true_false': return { key, item, kind: 'tf', prompt: item.prompt, answer: item.answer }
    case 'short_answer': return { key, item, kind: 'typed', prompt: item.prompt, promptKind: 'question', answers: [item.answer, ...item.accept] }
    case 'numeric': return { key, item, kind: 'numeric', prompt: item.prompt, answer: item.answer, tolerance: item.tolerance, ...(item.unit ? { unit: item.unit } : {}) }
    case 'cloze': return { key, item, kind: 'cloze', cloze: parseCloze(item.prompt) }
    case 'ordering': {
      let shuffled = shuffle(item.items, rng)
      for (let i = 0; i < 10 && shuffled.join('\u0000') === item.items.join('\u0000'); i++) shuffled = shuffle(item.items, rng)
      if (shuffled.join('\u0000') === item.items.join('\u0000')) shuffled = [...item.items].reverse()
      return { key, item, kind: 'order', prompt: item.prompt, items: item.items, shuffled }
    }
    case 'scenario': return { key, item, kind: 'scenario', prompt: item.prompt, parts: item.parts.map((p) => buildExercise(p, pool, 'recall', rng)) }
  }
}

/** The text shown as "the answer" for review screens and flashcard backs. */
export function answerText(item: Item): string {
  if (item.kind === 'term') return item.definition
  switch (item.qtype) {
    case 'multiple_choice': return item.choices.find((c) => c.correct)?.text ?? ''
    case 'multiple_select': return item.choices.filter((c) => c.correct).map((c) => c.text).join(' · ')
    case 'true_false': return item.answer ? 'True' : 'False'
    case 'short_answer': return item.answer
    case 'numeric': return `${item.unit === '$' ? '$' : ''}${item.answer.toLocaleString()}${item.unit && item.unit !== '$' ? ' ' + item.unit : ''}`
    case 'cloze': return parseCloze(item.prompt).blanks.map((b) => b[0]).join(' · ')
    case 'ordering': return item.items.map((s, i) => `${i + 1}. ${s}`).join('  ')
    case 'scenario': return item.parts.map((p, i) => `(${i + 1}) ${answerText(p)}`).join('  ')
  }
}

/** Plain prompt text for lists (cloze blanks shown as ____). */
export function promptText(item: Item): string {
  if (item.kind === 'term') return item.term
  return item.qtype === 'cloze' ? item.prompt.replace(/\{\{[^{}]+\}\}/g, '____') : item.prompt
}
