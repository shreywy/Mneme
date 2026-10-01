import { createContext } from 'react'

// Key terms on a notes page: the first mention of each term in a block gets a dotted underline, and
// hovering or tapping it shows the definition. The notes page provides the terms; elsewhere there are none.

export type KeyTerm = { term: string; definition: string }
export const KeyTermsCtx = createContext<KeyTerm[]>([])

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Split text into plain parts and term mentions. `used` carries terms already marked in this block. */
export function splitByTerms(text: string, terms: string[], used: Set<string>): { text: string; term?: string }[] {
  const todo = terms.filter((t) => t.trim() && !used.has(t.toLowerCase())).sort((a, b) => b.length - a.length)
  if (!todo.length) return [{ text }]
  // Word boundaries that also work next to punctuation: not preceded or followed by a letter or digit.
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${todo.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'giu')
  const out: { text: string; term?: string }[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const term = todo.find((t) => t.toLowerCase() === m[0].toLowerCase())!
    if (used.has(term.toLowerCase())) continue
    used.add(term.toLowerCase())
    if (m.index! > last) out.push({ text: text.slice(last, m.index) })
    out.push({ text: m[0], term })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out.length ? out : [{ text }]
}

type HastNode = { type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: HastNode[] }

/** Rehype plugin: wrap term mentions in <span class="kterm" data-term>. Skips code and rendered maths. */
export function rehypeKeyTerms(terms: string[]) {
  return () => (tree: HastNode) => {
    const used = new Set<string>()
    const visit = (node: HastNode) => {
      if (!node.children) return
      const cls = node.properties?.className
      if (node.tagName === 'code' || node.tagName === 'pre' || (Array.isArray(cls) && cls.some((c) => String(c).startsWith('katex')))) return
      const next: HastNode[] = []
      for (const child of node.children) {
        if (child.type === 'text' && child.value) {
          for (const p of splitByTerms(child.value, terms, used)) {
            next.push(p.term
              ? { type: 'element', tagName: 'span', properties: { className: ['kterm'], dataTerm: p.term, tabIndex: 0 }, children: [{ type: 'text', value: p.text }] }
              : { type: 'text', value: p.text })
          }
        } else { visit(child); next.push(child) }
      }
      node.children = next
    }
    visit(tree)
  }
}
