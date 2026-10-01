import type { NormalizedDeck, QuestionItem } from '../deck-format/types'

export type TreeNode = { label: string; children: TreeNode[] }
export type PlotAxis = { label?: string; min: number; max: number; unit?: string }
/** A line on a plot: a formula in x ("24000 + 25x") or a list of [x, y] points. */
export type PlotLine = { label?: string; fn?: string; points?: [number, number][]; dashed?: boolean }
export type PlotPoint = { x: number; y: number; label?: string }
/** Shade between two lines (by index), or between one line and the x-axis, from x = `from` to `to`. */
export type PlotArea = { between: number[]; from?: number; to?: number; label?: string; tone?: 'good' | 'bad' | 'accent' }
export type DerivationLine = { lhs?: string; rel?: string; rhs: string; why?: string }
export type CalloutTone = 'tip' | 'warning' | 'exam' | 'definition' | 'note'

export type Block =
  | { type: 'quickref'; title?: string; blocks: Block[] }
  /** A chapter divider: notes that cover several chapters come in parts, each starting with one. */
  | { type: 'part'; title: string; index?: number }
  | { type: 'section'; title: string; open: boolean; blocks: Block[] }
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; columns: string[]; rows: string[][]; caption?: string }
  | { type: 'math'; tex: string; caption?: string }
  /** Maths worked one step per line, lined up on the relation, each step with a short reason. */
  | { type: 'derivation'; title?: string; lines: DerivationLine[] }
  /** A graph Mneme draws from a description: functions or points, axes, shaded areas, marked points. */
  | { type: 'plot'; title?: string; caption?: string; x: PlotAxis; y: PlotAxis; lines: PlotLine[]; points?: PlotPoint[]; areas?: PlotArea[] }
  /** A picture the AI drew as SVG. Cleaned and recoloured before it's shown. */
  | { type: 'figure'; svg: string; alt: string; caption?: string }
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
  | { type: 'demo'; demo: import('../deck-format/types').Demo }

export type BlockType = Block['type']

export type NormalizedNotes = {
  title: string
  course?: string
  unit?: string
  summary?: string
  topics: string[]
  blocks: Block[]
  /** Set when the notes came in several files (one per chapter): which file this is. */
  part?: { index: number; of: number }
}

export type NotesParseResult =
  | { ok: true; notes: NormalizedNotes; deck?: NormalizedDeck; warnings: string[] }
  | { ok: false; errors: string[] }
