import type { NormalizedDeck, QuestionItem } from '../deck-format/types'

export type TreeNode = { label: string; children: TreeNode[] }
export type CalloutTone = 'tip' | 'warning' | 'exam' | 'definition' | 'note'

export type Block =
  | { type: 'quickref'; title?: string; blocks: Block[] }
  | { type: 'section'; title: string; open: boolean; blocks: Block[] }
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; columns: string[]; rows: string[][]; caption?: string }
  | { type: 'math'; tex: string; caption?: string }
  | { type: 'callout'; tone: CalloutTone; title?: string; text: string }
  | { type: 'keyterms'; items: { term: string; definition: string }[] }
  | { type: 'flow'; rows: { parts: string[]; link?: string }[] }
  | { type: 'steps'; items: { title?: string; text: string }[] }
  | { type: 'cycle'; items: string[] }
  | { type: 'compare'; columns: { title: string; points: string[] }[] }
  | { type: 'decision'; title?: string; columns: string[]; rows: string[][] }
  | { type: 'tree'; root: TreeNode }
  | { type: 'timeline'; items: { when: string; text: string }[] }
  | { type: 'chart'; kind: 'bar' | 'line' | 'pie'; title?: string; unit?: string; labels: string[]; series: { name: string; values: number[] }[] }
  | { type: 'diagram'; nodes: { id: string; label: string }[]; edges: { from: string; to: string; label?: string }[] }
  | { type: 'question'; item: QuestionItem }
  | { type: 'match'; title?: string; pairs: { left: string; right: string }[] }
  | { type: 'reveal'; prompt: string; answer: string }
  | { type: 'worked'; prompt: string; steps: string[]; answer?: string }

export type BlockType = Block['type']

export type NormalizedNotes = {
  title: string
  course?: string
  unit?: string
  summary?: string
  topics: string[]
  blocks: Block[]
}

export type NotesParseResult =
  | { ok: true; notes: NormalizedNotes; deck?: NormalizedDeck; warnings: string[] }
  | { ok: false; errors: string[] }
