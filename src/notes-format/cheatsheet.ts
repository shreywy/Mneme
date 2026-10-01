import type { Block } from './types'

// A cheat sheet keeps what you'd write on an exam crib sheet: quick references, formulas, key terms,
// exam tips, worked examples (prompt and answer only) and charts. Explanations stay on the notes page.

export type SheetSource =
  | { kind: 'note'; id: string; title: string; blocks: Block[] }
  | { kind: 'deck'; id: string; title: string; terms: { term: string; definition: string }[] }

export type SheetInclude = { quickref: boolean; formulas: boolean; terms: boolean; tips: boolean; worked: boolean; charts: boolean }

export type SheetPart =
  | { kind: 'quickref'; blocks: Block[] }
  | { kind: 'formulas'; items: { tex: string; caption?: string }[] }
  | { kind: 'terms'; items: { term: string; definition: string }[] }
  | { kind: 'tips'; items: string[] }
  | { kind: 'worked'; items: { prompt: string; answer?: string; last?: string }[] }
  | { kind: 'charts'; blocks: Block[] }

export type SheetSection = { id: string; kind: SheetSource['kind']; title: string; parts: SheetPart[] }

const walk = (blocks: Block[], fn: (b: Block) => void) => blocks.forEach((b) => { fn(b); if (b.type === 'section' || b.type === 'quickref') walk(b.blocks, fn) })

export function gatherSheet(sources: SheetSource[], inc: SheetInclude): SheetSection[] {
  const seenTerms = new Set<string>()
  const out: SheetSection[] = []
  for (const src of sources) {
    const parts: SheetPart[] = []
    if (src.kind === 'note') {
      const quick: Block[] = [], formulas: { tex: string; caption?: string }[] = [], terms: { term: string; definition: string }[] = []
      const tips: string[] = [], worked: { prompt: string; answer?: string; last?: string }[] = [], charts: Block[] = []
      for (const b of src.blocks) if (b.type === 'quickref') quick.push(...b.blocks)
      walk(src.blocks, (b) => {
        if (b.type === 'math') formulas.push({ tex: b.tex, ...(b.caption ? { caption: b.caption } : {}) })
        if (b.type === 'derivation') formulas.push({ tex: '\\begin{aligned}' + b.lines.map((l) => `${l.lhs ?? ''} &${l.rel ?? '='} ${l.rhs}`).join(' \\\\ ') + '\\end{aligned}', ...(b.title ? { caption: b.title } : {}) })
        if (b.type === 'keyterms') for (const t of b.items) if (!seenTerms.has(t.term.toLowerCase())) { seenTerms.add(t.term.toLowerCase()); terms.push(t) }
        if (b.type === 'callout' && (b.tone === 'exam' || b.tone === 'warning')) tips.push(b.text)
        if (b.type === 'worked') worked.push({ prompt: b.prompt, ...(b.answer ? { answer: b.answer } : {}), ...(b.steps.length ? { last: b.steps[b.steps.length - 1] } : {}) })
        if (b.type === 'chart' || b.type === 'flow' || b.type === 'compare' || b.type === 'plot' || b.type === 'figure') charts.push(b)
      })
      if (inc.quickref && quick.length) parts.push({ kind: 'quickref', blocks: quick })
      if (inc.formulas && formulas.length) parts.push({ kind: 'formulas', items: formulas })
      if (inc.terms && terms.length) parts.push({ kind: 'terms', items: terms })
      if (inc.tips && tips.length) parts.push({ kind: 'tips', items: tips })
      if (inc.worked && worked.length) parts.push({ kind: 'worked', items: worked })
      if (inc.charts && charts.length) parts.push({ kind: 'charts', blocks: charts })
    } else if (inc.terms) {
      const terms = src.terms.filter((t) => { const k = t.term.toLowerCase(); if (seenTerms.has(k)) return false; seenTerms.add(k); return true })
      if (terms.length) parts.push({ kind: 'terms', items: terms })
    }
    if (parts.length) out.push({ id: src.id, kind: src.kind, title: src.title, parts })
  }
  return out
}
