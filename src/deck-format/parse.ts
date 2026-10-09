import { z } from 'zod'
import type { Demo, Item, NormalizedDeck, ParseResult, QuestionItem, QuestionType, SimpleQuestion, Topic } from './types'
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

/**
 * Inside JSON strings, turn backslashes that JSON doesn't allow (\epsilon, \underline) into escaped ones,
 * so a LaTeX-heavy reply doesn't fail to parse. Valid escapes are left alone.
 */
function escapeStrayBackslashes(s: string): string {
  let out = '', inString = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (!inString) { if (c === '"') inString = true; out += c; continue }
    if (c === '"') { inString = false; out += c; continue }
    if (c !== '\\') { out += c; continue }
    const n = s[i + 1] ?? ''
    if ('"\\/bfnrt'.includes(n) || (n === 'u' && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6)))) { out += c + n; i++ }
    else out += '\\\\'
  }
  return out
}

/**
 * Single backslashes that happen to be valid JSON escapes (\f in \frac, \t in \text, \b in \beta, \n in \neq)
 * arrive as control characters. Inside $$…$$ math, put the LaTeX command back.
 */
function repairMath(input: string): string {
  // Chat-safe math delimiters from the prompt: ⟦…⟧ means $$…$$.
  const str = input.includes('⟦') ? input.replace(/⟦/g, '$$$$').replace(/⟧/g, '$$$$') : input
  if (!str.includes('$$')) return str
  return str.replace(/\$\$([\s\S]*?)\$\$/g, (_, m: string) => '$$' + m
    .replace(/\f/g, '\\f')
    .replace(/\x08/g, '\\b')
    .replace(/\t(?=[a-zA-Z])/g, '\\t')
    .replace(/\r(?=[a-zA-Z])/g, '\\r')
    .replace(/\n(?=(eq|e\b|ot|abla|u\b|ewline|eg|i\b|leq|geq|mid|exists|ormalsize))/g, '\\n') + '$$')
}

function deepRepair(v: unknown): unknown {
  if (typeof v === 'string') return repairMath(v)
  if (Array.isArray(v)) return v.map(deepRepair)
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepRepair(x)]))
  return v
}

/** Find the JSON object inside LLM output: tolerates code fences, chatter and LaTeX backslash mistakes. */
export function extractJson(input: string): unknown {
  const s = input.replace(/^\uFEFF/, '')
  const attempts = [s]
  const first = s.indexOf('{'), last = s.lastIndexOf('}')
  if (first !== -1 && last > first) attempts.push(s.slice(first, last + 1))
  for (const a of attempts) {
    for (const t of [a, escapeStrayBackslashes(a)]) {
      try { return deepRepair(JSON.parse(t)) } catch { /* try the next form */ }
    }
  }
  throw new Error('no JSON object')
}

const toBool = (v: unknown) => (v === 'true' ? true : v === 'false' ? false : v)
const toNum = (v: unknown) => (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v.replace(/[$,\s]/g, ''))) ? Number(v.replace(/[$,\s]/g, '')) : v)

function describeIssue(e: z.ZodError): string {
  return e.issues.map((i) => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`).join('; ')
}

const MAX_DEMO = 60_000

/** Read an optional demo; oversized or malformed ones are dropped with a warning. */
export function parseDemo(v: unknown, id: string, warnings: string[]): Demo | undefined {
  if (v === undefined || v === null) return undefined
  const o = typeof v === 'string' ? { html: v } : isObj(v) ? v : null
  if (!o || typeof o.html !== 'string' || !o.html.trim()) { warnings.push(`${id}: demo has no html, so it was dropped.`); return undefined }
  if (o.html.length > MAX_DEMO) { warnings.push(`${id}: demo is over 60 KB, so it was dropped.`); return undefined }
  const height = typeof o.height === 'number' && o.height > 0 ? Math.min(1200, Math.round(o.height)) : undefined
  return {
    ...(typeof o.title === 'string' && o.title.trim() ? { title: o.title.trim() } : {}),
    html: o.html,
    ...(height ? { height } : {}),
    placement: o.placement === 'question' ? 'question' : 'explanation',
  }
}

/**
 * Up to three hints. One that names the answer (a typed answer, a blank, or the term) is dropped, since it
 * would give the card away.
 */
export function parseHints(v: unknown, answers: string[], id: string, warnings: string[]): { hints?: string[] } {
  const list = (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []).filter((h): h is string => typeof h === 'string' && !!h.trim()).map((h) => h.trim().slice(0, 300))
  const esc = (a: string) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const leaks = answers.map((a) => a.trim()).filter((a) => a.length >= 3).map((a) => new RegExp(`(^|\\W)${esc(a)}($|\\W)`, 'i'))
  const kept = list.filter((h) => !leaks.some((r) => r.test(h)))
  if (kept.length < list.length) warnings.push(`${id}: a hint gave the answer away, so it was dropped.`)
  if (kept.length > 3) warnings.push(`${id}: only the first three hints are kept.`)
  return kept.length ? { hints: kept.slice(0, 3) } : {}
}
/** What a hint mustn't say, per question type. */
const answersOf = (q: Raw): string[] => {
  if (q.type === 'short_answer') return [String(q.answer ?? ''), ...(Array.isArray(q.accept) ? q.accept.map(String) : [])]
  if (q.type === 'cloze' && typeof q.prompt === 'string') return [...q.prompt.matchAll(/\{\{([^{}]+)\}\}/g)].flatMap((m) => m[1].split('|'))
  return []
}

function normalizeSimple(q: Raw, id: string, topic: string, warnings: string[]): SimpleQuestion | null {
  const type = String(q.type ?? '')
  if (!QUESTION_TYPES.includes(type as QuestionType) || type === 'scenario') { warnings.push(`Skipped ${id}: question type "${type}" isn't supported yet.`); return null }
  let difficulty = toNum(q.difficulty)
  if (difficulty !== 1 && difficulty !== 2 && difficulty !== 3) difficulty = 2
  if (typeof q.explanation !== 'string') warnings.push(`${id}: no explanation.`)
  const fixed: Raw = { ...q, id, topic, difficulty, explanation: typeof q.explanation === 'string' ? q.explanation : '' }
  if (Array.isArray(q.choices)) fixed.choices = q.choices.map((c) => (isObj(c) ? { ...c, correct: toBool(c.correct) } : c))
  if (type === 'true_false') fixed.answer = toBool(q.answer)
  if (type === 'numeric') { fixed.answer = toNum(q.answer); fixed.tolerance = toNum(q.tolerance ?? 0) }
  if (type === 'short_answer' && !Array.isArray(q.accept)) fixed.accept = []
  const r = questionSchema.safeParse(fixed)
  if (!r.success) { warnings.push(`Skipped ${id}: ${describeIssue(r.error)}`); return null }
  const d = r.data
  const demo = parseDemo(q.demo, id, warnings)
  const common = { kind: 'question' as const, key: id, topic: d.topic, prompt: d.prompt, explanation: d.explanation, difficulty: d.difficulty, ...(d.source ? { source: d.source } : {}), ...parseHints(q.hints, answersOf(q), id, warnings), ...(demo ? { demo } : {}) }
  switch (d.type) {
    case 'multiple_choice': return { ...common, qtype: 'multiple_choice', choices: d.choices }
    case 'multiple_select': return { ...common, qtype: 'multiple_select', choices: d.choices }
    case 'true_false': return { ...common, qtype: 'true_false', answer: d.answer }
    case 'short_answer': return { ...common, qtype: 'short_answer', answer: d.answer, accept: d.accept }
    case 'numeric': return { ...common, qtype: 'numeric', answer: d.answer, tolerance: d.tolerance, ...(d.unit ? { unit: d.unit } : {}) }
    case 'cloze': return { ...common, qtype: 'cloze' }
    case 'ordering': return { ...common, qtype: 'ordering', items: d.items }
  }
}

function normalizeQuestion(q: Raw, id: string, topic: string, warnings: string[]): QuestionItem | null {
  if (String(q.type ?? '') !== 'scenario') return normalizeSimple(q, id, topic, warnings)
  const prompt = typeof q.prompt === 'string' ? q.prompt.trim() : typeof q.scenario === 'string' ? q.scenario.trim() : ''
  if (!prompt) { warnings.push(`Skipped ${id}: the scenario has no case text.`); return null }
  const rawParts = Array.isArray(q.questions) ? q.questions : Array.isArray(q.parts) ? q.parts : []
  const parts: SimpleQuestion[] = []
  rawParts.forEach((pq, k) => {
    if (!isObj(pq)) return
    const pid = `${id}--${typeof pq.id === 'string' && pq.id.trim() ? slug(pq.id) : k + 1}`
    const part = normalizeSimple({ ...pq, difficulty: pq.difficulty ?? q.difficulty }, pid, topic, warnings)
    if (part) parts.push(part)
  })
  if (parts.length < 2) { warnings.push(`Skipped ${id}: a scenario needs at least two working questions.`); return null }
  let difficulty = toNum(q.difficulty)
  if (difficulty !== 1 && difficulty !== 2 && difficulty !== 3) difficulty = 3
  return {
    kind: 'question', key: id, qtype: 'scenario', topic, prompt, parts, difficulty: difficulty as 1 | 2 | 3,
    explanation: typeof q.explanation === 'string' ? q.explanation : '',
    ...(typeof q.source === 'string' && q.source.trim() ? { source: q.source.trim() } : {}),
    ...parseHints(q.hints, [], id, warnings),
    ...((() => { const demo = parseDemo(q.demo, id, warnings); return demo ? { demo } : {} })()),
  }
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
    const demo = parseDemo(t.demo, id, warnings)
    keep(id, { kind: 'term', key: id, topic: d.topic, term: d.term, definition: d.definition, aliases: d.aliases, ...(demo ? { demo } : {}),
      ...(d.example ? { example: d.example } : {}), ...(d.explanation ? { explanation: d.explanation } : {}), ...(d.source ? { source: d.source } : {}),
      ...parseHints(t.hints, [d.term, ...d.aliases], id, warnings) })
  })

  // questions
  ;(Array.isArray(raw.questions) ? raw.questions : []).forEach((q, i) => {
    if (!isObj(q)) return
    const id = typeof q.id === 'string' && q.id.trim() ? slug(q.id) : `q-${i + 1}`
    const item = normalizeQuestion(q, id, fixTopic(q.topic, id), warnings)
    if (item) keep(id, item)
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
