import { z } from 'zod'
import type { Item, NormalizedDeck, ParseResult, QuestionType, Topic } from './types'
import { QUESTION_TYPES } from './types'

// ---------- zod schemas (mirror deck-format/deck.schema.json) ----------
const text = z.string().trim().min(1)
const choice = z.object({ text, correct: z.boolean(), why: z.string().optional() })
const base = {
  id: text, topic: text, prompt: text, explanation: z.string(), difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  source: z.string().optional(),
}
const questionSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('multiple_choice'), choices: z.array(choice).min(2).max(8) })
    .refine((q) => q.choices.filter((c) => c.correct).length === 1, 'needs exactly one correct choice'),
  z.object({ ...base, type: z.literal('multiple_select'), choices: z.array(choice).min(2).max(10) })
    .refine((q) => q.choices.filter((c) => c.correct).length >= 1, 'needs at least one correct choice'),
  z.object({ ...base, type: z.literal('true_false'), answer: z.boolean() }),
  z.object({ ...base, type: z.literal('short_answer'), answer: text, accept: z.array(z.string()).default([]) }),
  z.object({ ...base, type: z.literal('numeric'), answer: z.number().finite(), tolerance: z.number().min(0).default(0), unit: z.string().optional() }),
  z.object({ ...base, type: z.literal('cloze') }).refine((q) => /\{\{[^{}]+\}\}/.test(q.prompt), 'needs at least one {{blank}}'),
  z.object({ ...base, type: z.literal('ordering'), items: z.array(text).min(2).max(15) }),
])
const termSchema = z.object({
  id: text, term: text, definition: text, topic: text,
  aliases: z.array(z.string()).default([]), example: z.string().optional(), explanation: z.string().optional(), source: z.string().optional(),
})

// ---------- helpers ----------
type Raw = Record<string, unknown>
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

/** Find the JSON object inside LLM output: tolerates code fences and chatter before/after. */
export function extractJson(input: string): unknown {
  const s = input.replace(/^﻿/, '')
  try { return JSON.parse(s) } catch { /* fall through */ }
  const first = s.indexOf('{'), last = s.lastIndexOf('}')
  if (first === -1 || last <= first) throw new Error('no JSON object')
  return JSON.parse(s.slice(first, last + 1))
}

const toBool = (v: unknown) => (v === 'true' ? true : v === 'false' ? false : v)
const toNum = (v: unknown) => (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v.replace(/[$,\s]/g, ''))) ? Number(v.replace(/[$,\s]/g, '')) : v)

function describeIssue(e: z.ZodError): string {
  return e.issues.map((i) => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`).join('; ')
}

// ---------- main ----------
export function parseDeckText(input: string): ParseResult {
  let raw: unknown
  try { raw = extractJson(input) } catch {
    return { ok: false, errors: ['This is not valid JSON. Paste or upload the whole file the LLM gave you, starting with { and ending with }.'] }
  }
  if (!isObj(raw)) return { ok: false, errors: ['Expected a JSON object at the top level.'] }
  const warnings: string[] = []

  if (raw.format !== 'mneme.deck') {
    if (isObj(raw.deck) && (Array.isArray(raw.terms) || Array.isArray(raw.questions))) warnings.push('The file has no "format": "mneme.deck" line. Imported anyway.')
    else return { ok: false, errors: ['This file is not a Mneme deck (missing "format": "mneme.deck").'] }
  }
  const deckMeta = isObj(raw.deck) ? raw.deck : {}
  const title = typeof deckMeta.title === 'string' && deckMeta.title.trim() ? deckMeta.title.trim() : ''
  if (!title) return { ok: false, errors: ['deck.title is missing.'] }

  // topics
  const topics: Topic[] = []
  const topicIds = new Set<string>()
  const byName = new Map<string, string>()
  for (const t of Array.isArray(raw.topics) ? raw.topics : []) {
    if (!isObj(t)) continue
    const name = typeof t.name === 'string' ? t.name.trim() : ''
    const id = typeof t.id === 'string' && t.id.trim() ? slug(t.id) : slug(name)
    if (!id || topicIds.has(id)) continue
    topics.push({ id, name: name || id, ...(typeof t.summary === 'string' ? { summary: t.summary } : {}) })
    topicIds.add(id)
    byName.set(name.toLowerCase(), id)
  }
  const fixTopic = (v: unknown, itemId: string): string => {
    const s = typeof v === 'string' ? v.trim() : ''
    if (topicIds.has(s)) return s
    const bySlug = slug(s)
    if (topicIds.has(bySlug)) { warnings.push(`${itemId}: topic "${s}" matched to "${bySlug}".`); return bySlug }
    const named = byName.get(s.toLowerCase())
    if (named) { warnings.push(`${itemId}: topic "${s}" matched by name.`); return named }
    const id = bySlug || 'general'
    if (!topicIds.has(id)) {
      topics.push({ id, name: s || 'General' })
      topicIds.add(id)
      byName.set((s || 'General').toLowerCase(), id)
      if (topicIds.size > 0 && s) warnings.push(`${itemId}: topic "${s}" was not listed, so it was added.`)
    }
    return id
  }

  const items: Item[] = []
  const seen = new Set<string>()
  const keep = (key: string, item: Item) => {
    if (seen.has(key)) { warnings.push(`Skipped a duplicate id "${key}".`); return }
    seen.add(key)
    items.push(item)
  }

  // terms
  ;(Array.isArray(raw.terms) ? raw.terms : []).forEach((t, i) => {
    if (!isObj(t)) return
    const id = typeof t.id === 'string' && t.id.trim() ? slug(t.id) : `t-${i + 1}`
    const r = termSchema.safeParse({ ...t, id, topic: fixTopic(t.topic, id), aliases: Array.isArray(t.aliases) ? t.aliases : [] })
    if (!r.success) { warnings.push(`Skipped term ${id}: ${describeIssue(r.error)}`); return }
    const d = r.data
    keep(id, { kind: 'term', key: id, topic: d.topic, term: d.term, definition: d.definition, aliases: d.aliases,
      ...(d.example ? { example: d.example } : {}), ...(d.explanation ? { explanation: d.explanation } : {}), ...(d.source ? { source: d.source } : {}) })
  })

  // questions
  ;(Array.isArray(raw.questions) ? raw.questions : []).forEach((q, i) => {
    if (!isObj(q)) return
    const id = typeof q.id === 'string' && q.id.trim() ? slug(q.id) : `q-${i + 1}`
    const type = String(q.type ?? '')
    if (!QUESTION_TYPES.includes(type as QuestionType)) { warnings.push(`Skipped ${id}: question type "${type}" isn't supported yet.`); return }
    let difficulty = toNum(q.difficulty)
    if (difficulty !== 1 && difficulty !== 2 && difficulty !== 3) difficulty = 2
    if (typeof q.explanation !== 'string') warnings.push(`${id}: no explanation.`)
    const fixed: Raw = {
      ...q, id, topic: fixTopic(q.topic, id), difficulty,
      explanation: typeof q.explanation === 'string' ? q.explanation : '',
    }
    if (Array.isArray(q.choices)) fixed.choices = q.choices.map((c) => (isObj(c) ? { ...c, correct: toBool(c.correct) } : c))
    if (type === 'true_false') fixed.answer = toBool(q.answer)
    if (type === 'numeric') { fixed.answer = toNum(q.answer); fixed.tolerance = toNum(q.tolerance ?? 0) }
    if (type === 'short_answer' && !Array.isArray(q.accept)) fixed.accept = []
    const r = questionSchema.safeParse(fixed)
    if (!r.success) { warnings.push(`Skipped ${id}: ${describeIssue(r.error)}`); return }
    const d = r.data
    const common = { kind: 'question' as const, key: id, topic: d.topic, prompt: d.prompt, explanation: d.explanation, difficulty: d.difficulty, ...(d.source ? { source: d.source } : {}) }
    switch (d.type) {
      case 'multiple_choice': keep(id, { ...common, qtype: 'multiple_choice', choices: d.choices }); break
      case 'multiple_select': keep(id, { ...common, qtype: 'multiple_select', choices: d.choices }); break
      case 'true_false': keep(id, { ...common, qtype: 'true_false', answer: d.answer }); break
      case 'short_answer': keep(id, { ...common, qtype: 'short_answer', answer: d.answer, accept: d.accept }); break
      case 'numeric': keep(id, { ...common, qtype: 'numeric', answer: d.answer, tolerance: d.tolerance, ...(d.unit ? { unit: d.unit } : {}) }); break
      case 'cloze': keep(id, { ...common, qtype: 'cloze' }); break
      case 'ordering': keep(id, { ...common, qtype: 'ordering', items: d.items }); break
    }
  })

  if (items.length === 0) return { ok: false, errors: ['No usable terms or questions were found.', ...warnings.slice(0, 10)] }

  const part = isObj(deckMeta.part) && typeof deckMeta.part.index === 'number' && typeof deckMeta.part.of === 'number'
    ? { index: deckMeta.part.index, of: deckMeta.part.of } : undefined
  const deck: NormalizedDeck = {
    title,
    ...(typeof deckMeta.course === 'string' && deckMeta.course.trim() ? { course: deckMeta.course.trim() } : {}),
    ...(typeof deckMeta.description === 'string' ? { description: deckMeta.description } : {}),
    sources: Array.isArray(deckMeta.sources) ? deckMeta.sources.filter((s): s is string => typeof s === 'string') : [],
    ...(part ? { part } : {}),
    topics,
    items,
  }
  return { ok: true, deck, warnings }
}

/** Merge a later part (or an updated re-import) into an existing deck. Items are keyed by id; incoming wins. */
export function mergeParts(existing: NormalizedDeck, incoming: NormalizedDeck): NormalizedDeck {
  const map = new Map(existing.items.map((i) => [i.key, i]))
  for (const it of incoming.items) map.set(it.key, it)
  const topics = [...existing.topics]
  for (const t of incoming.topics) if (!topics.some((x) => x.id === t.id)) topics.push(t)
  return {
    ...existing,
    description: existing.description ?? incoming.description,
    course: existing.course ?? incoming.course,
    sources: [...new Set([...existing.sources, ...incoming.sources])],
    topics,
    items: [...map.values()],
  }
}
