import { describe, expect, it } from 'vitest'
import { gatherSheet, type SheetSource } from './cheatsheet'
import type { Block } from './types'

const blocks: Block[] = [
  { type: 'quickref', blocks: [{ type: 'paragraph', text: 'A = L + E' }] },
  { type: 'section', title: 'Elements', open: false, blocks: [
    { type: 'paragraph', text: 'Long explanation that should not be on a cheat sheet.' },
    { type: 'math', tex: 'A = L + E', caption: 'The equation' },
    { type: 'keyterms', items: [{ term: 'Asset', definition: 'Owned' }] },
    { type: 'callout', tone: 'exam', text: 'Always balances' },
    { type: 'callout', tone: 'tip', text: 'A tip, not for the sheet' },
    { type: 'worked', prompt: 'Find E', steps: ['E = A - L'], answer: '40' },
    { type: 'chart', kind: 'bar', labels: ['a'], series: [{ name: 's', values: [1] }] },
  ] },
]
const notes: SheetSource = { kind: 'note', id: 'n', title: 'Ch 2', blocks }
const deck: SheetSource = { kind: 'deck', id: 'd', title: 'Ch 2 deck', terms: [{ term: 'Asset', definition: 'Owned, duplicate' }, { term: 'Liability', definition: 'Owed' }] }

describe('gatherSheet', () => {
  it('collects the parts a cheat sheet needs and leaves out explanations', () => {
    const s = gatherSheet([notes], { quickref: true, formulas: true, terms: true, tips: true, worked: true, charts: true })
    const kinds = s[0].parts.map((p) => p.kind)
    expect(kinds).toEqual(['quickref', 'formulas', 'terms', 'tips', 'worked', 'charts'])
    expect(JSON.stringify(s)).not.toContain('Long explanation')
    expect(JSON.stringify(s)).not.toContain('A tip, not for the sheet')
  })
  it('respects what is switched off', () => {
    const s = gatherSheet([notes], { quickref: false, formulas: true, terms: false, tips: false, worked: false, charts: false })
    expect(s[0].parts.map((p) => p.kind)).toEqual(['formulas'])
  })
  it('adds deck terms, skipping ones the notes already define', () => {
    const s = gatherSheet([notes, deck], { quickref: false, formulas: false, terms: true, tips: false, worked: false, charts: false })
    const deckTerms = s.find((x) => x.id === 'd')!.parts[0]
    expect(deckTerms.kind === 'terms' && deckTerms.items.map((t) => t.term)).toEqual(['Liability'])
  })
  it('drops sources that end up empty', () => {
    expect(gatherSheet([{ kind: 'note', id: 'x', title: 'Empty', blocks: [{ type: 'paragraph', text: 'only prose' }] }], { quickref: true, formulas: true, terms: true, tips: true, worked: true, charts: true })).toEqual([])
  })
})

describe('gatherSheet with derivations and plots', () => {
  it('puts a derivation with the formulas, lined up, and a plot with the charts', () => {
    const s = gatherSheet([{ kind: 'note', id: 'n', title: 'T', blocks: [
      { type: 'derivation', lines: [{ lhs: 'A', rhs: 'L + E' }, { rhs: '10' }] },
      { type: 'plot', x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, lines: [{ fn: 'x' }] },
    ] }], { quickref: false, formulas: true, terms: false, tips: false, worked: false, charts: true })
    const f = s[0].parts[0]
    expect(f.kind === 'formulas' && f.items[0].tex).toBe(String.raw`\begin{aligned}A &= L + E \\  &= 10\end{aligned}`)
    expect(s[0].parts[1].kind).toBe('charts')
  })
})
