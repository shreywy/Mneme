import { question } from '../deck-format/export'
import type { Block, NormalizedNotes } from './types'

type Json = Record<string, unknown>

function block(b: Block): Json {
  switch (b.type) {
    case 'section': return { type: 'section', title: b.title, open: b.open, blocks: b.blocks.map(block) }
    case 'quickref': return { type: 'quickref', ...(b.title ? { title: b.title } : {}), blocks: b.blocks.map(block) }
    case 'part': return { type: 'part', title: b.title, ...(b.summary ? { summary: b.summary } : {}) }
    case 'question': return { type: 'question', question: question(b.item) }
    case 'demo': return { type: 'demo', ...b.demo }
    default: return { ...b }
  }
}

/** A notes page in the public mneme.notes format, ready to share or import again. */
export function notesToFile(n: Pick<NormalizedNotes, 'title' | 'course' | 'unit' | 'summary' | 'topics' | 'blocks'>): Json {
  return {
    format: 'mneme.notes',
    version: 1,
    notes: {
      title: n.title,
      ...(n.course ? { course: n.course } : {}),
      ...(n.unit ? { unit: n.unit } : {}),
      ...(n.summary ? { summary: n.summary } : {}),
      ...(n.topics.length ? { topics: n.topics } : {}),
      blocks: n.blocks.map(block),
    },
  }
}
