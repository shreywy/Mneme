import { z } from 'zod'
import { extractJson, parseDeckText, parseDemo } from '../deck-format/parse'
import type { NormalizedDeck } from '../deck-format/types'
import type { Block, NormalizedNotes, NotesParseResult, TreeNode } from './types'

type Raw = Record<string, unknown>
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = z.string().trim().min(1)

// One schema per simple block. Container blocks (quickref, section) and question are handled by hand.
const SIMPLE: Record<string, z.ZodType> = {
  heading: z.object({ text: str }),
  paragraph: z.object({ text: str }),
  list: z.object({ ordered: z.boolean().default(false), items: z.array(str).min(1) }),
  table: z.object({ columns: z.array(z.string()).min(1), rows: z.array(z.array(z.coerce.string())).min(1), caption: z.string().optional() }),
  math: z.object({ tex: str, caption: z.string().optional() }),
  callout: z.object({ tone: z.enum(['tip', 'warning', 'exam', 'definition', 'note']).catch('note'), title: z.string().optional(), text: str }),
  keyterms: z.object({ items: z.array(z.object({ term: str, definition: str })).min(1) }),
  flow: z.object({ rows: z.array(z.object({ parts: z.array(str).min(1), link: z.string().optional() })).min(1) }),
  steps: z.object({ items: z.array(z.union([str.transform((text) => ({ text })), z.object({ title: z.string().optional(), text: str })])).min(1) }),
  cycle: z.object({ items: z.array(str).min(2).max(12) }),
  compare: z.object({ columns: z.array(z.object({ title: str, points: z.array(str) })).min(2).max(4) }),
  decision: z.object({ title: z.string().optional(), columns: z.array(z.string()).min(2), rows: z.array(z.array(z.coerce.string())).min(1) }),
  timeline: z.object({ items: z.array(z.object({ when: z.coerce.string(), text: str })).min(1) }),
  chart: z.object({
    kind: z.enum(['bar', 'line', 'pie']).catch('bar'), title: z.string().optional(), unit: z.string().optional(),
    labels: z.array(z.coerce.string()).min(1), series: z.array(z.object({ name: z.string().default(''), values: z.array(z.coerce.number()) })).min(1),
  }).refine((c) => c.series.every((s) => s.values.length === c.labels.length), 'every series needs one value per label'),
  diagram: z.object({
    nodes: z.array(z.object({ id: z.coerce.string(), label: str })).min(2).max(16),
    edges: z.array(z.object({ from: z.coerce.string(), to: z.coerce.string(), label: z.string().optional() })),
  }),
  match: z.object({ title: z.string().optional(), pairs: z.array(z.object({ left: str, right: str })).min(2).max(12) }),
  reveal: z.object({ prompt: str, answer: str }),
  worked: z.object({ prompt: str, steps: z.array(str).min(1), answer: z.string().optional() }),
}

function tree(v: unknown, depth = 0): TreeNode | null {
  if (!isObj(v) || typeof v.label !== 'string' || !v.label.trim() || depth > 6) return null
  const kids = Array.isArray(v.children) ? v.children.map((c) => tree(c, depth + 1)).filter((c): c is TreeNode => !!c) : []
  return { label: v.label.trim(), children: kids }
}

function parseBlocks(list: unknown, warnings: string[], ctx: 'top' | 'section' | 'quickref', path: string): Block[] {
  const out: Block[] = []
  if (!Array.isArray(list)) return out
  list.forEach((raw, i) => {
    const where = `${path}[${i}]`
    if (!isObj(raw)) return
    const type = String(raw.type ?? '')
    if (type === 'section' || type === 'quickref') {
      if (ctx !== 'top') {
        // Flatten nested containers into a heading plus their blocks.
        if (typeof raw.title === 'string' && raw.title.trim()) out.push({ type: 'heading', text: raw.title.trim() })
        out.push(...parseBlocks(raw.blocks, warnings, ctx, where))
        warnings.push(`${where}: a ${type} inside another block was flattened.`)
        return
      }
      const inner = parseBlocks(raw.blocks, warnings, type, where)
      if (!inner.length) { warnings.push(`${where}: empty ${type} skipped.`); return }
      if (type === 'quickref') out.push({ type, ...(typeof raw.title === 'string' ? { title: raw.title } : {}), blocks: inner })
      else out.push({ type, title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Section', open: raw.open === true, blocks: inner })
      return
    }
    if (type === 'question') {
      const q = isObj(raw.question) ? raw.question : raw
      const id = typeof q.id === 'string' ? q.id : `n-q-${path.replace(/\W+/g, '-')}-${i}`
      const r = parseDeckText(JSON.stringify({
        format: 'mneme.deck', version: 1, deck: { title: 'notes' }, topics: [{ id: 'notes', name: 'Notes' }],
        questions: [{ ...q, id, topic: 'notes', difficulty: q.difficulty ?? 2, explanation: typeof q.explanation === 'string' ? q.explanation : '' }],
      }))
      const item = r.ok ? r.deck.items[0] : undefined
      if (!item || item.kind !== 'question') {
        warnings.push(`${where}: skipped question ${id}: ${r.ok ? r.warnings.join('; ') : r.errors.join('; ')}`)
        return
      }
      out.push({ type: 'question', item })
      return
    }
    if (type === 'demo') {
      const demo = parseDemo(raw, where, warnings)
      if (demo) out.push({ type: 'demo', demo })
      return
    }
    if (type === 'tree') {
      const root = tree(raw.root)
      if (root) out.push({ type: 'tree', root })
      else warnings.push(`${where}: tree needs a root with a label.`)
      return
    }
    const schema = SIMPLE[type]
    if (!schema) { warnings.push(`${where}: block type "${type}" isn't supported, so it was skipped.`); return }
    const r = schema.safeParse(raw)
    if (!r.success) { warnings.push(`${where}: skipped ${type} (${r.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')})`); return }
    out.push({ type, ...(r.data as object) } as Block)
  })
  return out
}

export function parseNotesText(input: string): NotesParseResult {
  let raw: unknown
  try { raw = extractJson(input) } catch {
    return { ok: false, errors: ['This is not valid JSON. Paste or upload the whole file the LLM gave you.'] }
  }
  if (!isObj(raw)) return { ok: false, errors: ['Expected a JSON object at the top level.'] }
  if (raw.format === 'mneme.deck') return { ok: false, errors: ['This is a deck file, not notes.'] }
  if (raw.format !== 'mneme.notes' || !isObj(raw.notes)) return { ok: false, errors: ['This file is not Mneme notes (missing "format": "mneme.notes").'] }
  const n = raw.notes
  const title = typeof n.title === 'string' ? n.title.trim() : ''
  if (!title) return { ok: false, errors: ['notes.title is missing.'] }
  const warnings: string[] = []
  const blocks = parseBlocks(n.blocks, warnings, 'top', 'blocks')
  if (!blocks.length) return { ok: false, errors: ['No usable blocks were found.', ...warnings.slice(0, 10)] }

  let deck: NormalizedDeck | undefined
  if (raw.deck !== undefined) {
    const d = parseDeckText(JSON.stringify(raw.deck))
    if (d.ok) { deck = d.deck; warnings.push(...d.warnings.map((w) => `deck: ${w}`)) }
    else warnings.push(`The companion deck couldn't be read: ${d.errors[0]}`)
  }
  const notes: NormalizedNotes = {
    title,
    ...(typeof n.course === 'string' && n.course.trim() ? { course: n.course.trim() } : {}),
    ...(typeof n.unit === 'string' && n.unit.trim() ? { unit: n.unit.trim() } : {}),
    ...(typeof n.summary === 'string' ? { summary: n.summary } : {}),
    topics: Array.isArray(n.topics) ? n.topics.filter((t): t is string => typeof t === 'string') : [],
    blocks,
  }
  return { ok: true, notes, ...(deck ? { deck } : {}), warnings }
}
