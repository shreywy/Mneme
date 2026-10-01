import type { Item, QuestionItem, SimpleQuestion, Topic } from './types'

type Meta = { title: string; course?: string; description?: string; sources: string[]; topics: Topic[] }
type Json = Record<string, unknown>

const opt = <T,>(k: string, v: T | undefined | '') => (v === undefined || v === '' ? {} : { [k]: v })

function simple(q: SimpleQuestion, id: string): Json {
  const base: Json = { id, type: q.qtype, prompt: q.prompt, explanation: q.explanation, difficulty: q.difficulty, ...opt('source', q.source), ...opt('demo', q.demo) }
  switch (q.qtype) {
    case 'multiple_choice': case 'multiple_select': return { ...base, choices: q.choices }
    case 'true_false': return { ...base, answer: q.answer }
    case 'short_answer': return { ...base, answer: q.answer, accept: q.accept }
    case 'numeric': return { ...base, answer: q.answer, tolerance: q.tolerance, ...opt('unit', q.unit) }
    case 'cloze': return base
    case 'ordering': return { ...base, items: q.items }
  }
}

function question(q: QuestionItem): Json {
  if (q.qtype !== 'scenario') return { ...simple(q, q.key), topic: q.topic }
  return {
    id: q.key, type: 'scenario', topic: q.topic, difficulty: q.difficulty, prompt: q.prompt, explanation: q.explanation,
    ...opt('source', q.source), ...opt('demo', q.demo),
    // Parts are stored as "<case>--<part>"; export the short part id so a re-import rebuilds the same keys.
    questions: q.parts.map((p) => simple(p, p.key.startsWith(`${q.key}--`) ? p.key.slice(q.key.length + 2) : p.key)),
  }
}

/** A deck in the public mneme.deck format: what an LLM would have written, ready to share or re-import. */
export function toDeckFile(meta: Meta, items: Item[]): Json {
  return {
    format: 'mneme.deck',
    version: 1,
    deck: { title: meta.title, ...opt('course', meta.course), ...opt('description', meta.description), sources: meta.sources },
    topics: meta.topics,
    terms: items.filter((i) => i.kind === 'term').map((t) => ({
      id: t.key, term: t.term, definition: t.definition, topic: t.topic, aliases: t.aliases,
      ...opt('example', t.example), ...opt('explanation', t.explanation), ...opt('source', t.source), ...opt('demo', t.demo),
    })),
    questions: items.filter((i): i is QuestionItem => i.kind === 'question').map(question),
  }
}

export function downloadJson(name: string, data: unknown) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export const fileSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck'
