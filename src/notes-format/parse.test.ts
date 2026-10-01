import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseNotesText } from './parse'

const PROMPT = readFileSync(join(__dirname, '../../deck-format/mneme-notes-prompt.md'), 'utf8')
const example = () => {
  const tail = PROMPT.slice(PROMPT.indexOf('## 6. Complete example'))
  return tail.match(/```json\r?\n([\s\S]*?)\r?\n```/)![1]
}
const wrap = (blocks: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ format: 'mneme.notes', version: 1, notes: { title: 'T', unit: 'Week 1', blocks }, ...extra })

describe('parseNotesText', () => {
  it('accepts the example in the notes prompt', () => {
    const r = parseNotesText(example())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.notes.title).toBe('Supply and demand')
    expect(r.notes.blocks[0].type).toBe('quickref')
    expect(r.notes.blocks.filter((b) => b.type === 'section')).toHaveLength(3)
    expect(r.warnings).toEqual([])
  })

  it('skips unknown or unsafe block types with a warning', () => {
    const r = parseNotesText(wrap([{ type: 'html', html: '<script>x</script>' }, { type: 'paragraph', text: 'ok' }]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.notes.blocks.map((b) => b.type)).toEqual(['paragraph'])
    expect(r.warnings.join(' ')).toMatch(/html/)
  })

  it('flattens a section nested inside a section', () => {
    const r = parseNotesText(wrap([{ type: 'section', title: 'A', blocks: [{ type: 'section', title: 'B', blocks: [{ type: 'paragraph', text: 'x' }] }] }]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const a = r.notes.blocks[0]
    expect(a.type === 'section' && a.blocks.map((b) => b.type)).toEqual(['heading', 'paragraph'])
  })

  it('turns a question block into a normal deck question', () => {
    const r = parseNotesText(wrap([{ type: 'question', question: { id: 'n-1', type: 'true_false', prompt: 'P', answer: 'false', explanation: 'E' } }]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const b = r.notes.blocks[0]
    expect(b.type === 'question' && b.item.qtype === 'true_false' && b.item.answer).toBe(false)
  })

  it('drops a broken question block but keeps the page', () => {
    const r = parseNotesText(wrap([{ type: 'question', question: { id: 'n-2', type: 'multiple_choice', prompt: 'P', explanation: 'E', choices: [{ text: 'a', correct: true }, { text: 'b', correct: true }] } }, { type: 'paragraph', text: 'still here' }]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.notes.blocks.map((b) => b.type)).toEqual(['paragraph'])
    expect(r.warnings.join(' ')).toMatch(/n-2/)
  })

  it('parses a companion deck when one is included', () => {
    const deck = { format: 'mneme.deck', version: 1, deck: { title: 'T' }, topics: [{ id: 'a', name: 'A' }], terms: [{ id: 't1', term: 'X', definition: 'Y', topic: 'a' }], questions: [] }
    const r = parseNotesText(wrap([{ type: 'paragraph', text: 'x' }], { deck }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.deck?.items).toHaveLength(1)
  })

  it('rejects a deck file and says which importer to use', () => {
    const r = parseNotesText(JSON.stringify({ format: 'mneme.deck', version: 1, deck: { title: 'x' } }))
    expect(r.ok).toBe(false)
  })

  it('rejects notes with no usable blocks', () => {
    const r = parseNotesText(wrap([{ type: 'nope' }]))
    expect(r.ok).toBe(false)
  })
})

describe('parseAnyText', () => {
  it('reads a deck file as a deck', async () => {
    const { parseAnyText } = await import('./parse')
    const r = parseAnyText(JSON.stringify({ format: 'mneme.deck', version: 1, deck: { title: 'D' }, topics: [{ id: 'a', name: 'A' }], terms: [{ id: 't', term: 'T', definition: 'D', topic: 'a' }] }))
    expect(r.kind).toBe('deck')
    expect(r.result.ok).toBe(true)
  })
  it('reads a notes file as notes, with its bundled deck', async () => {
    const { parseAnyText } = await import('./parse')
    const deck = { format: 'mneme.deck', version: 1, deck: { title: 'D' }, topics: [{ id: 'a', name: 'A' }], terms: [{ id: 't', term: 'T', definition: 'D', topic: 'a' }] }
    const r = parseAnyText(wrap([{ type: 'paragraph', text: 'x' }], { deck }))
    expect(r.kind).toBe('notes')
    expect(r.result.ok && r.kind === 'notes' && !!r.result.deck).toBe(true)
  })
  it('finds the JSON inside a chat reply', async () => {
    const { parseAnyText } = await import('./parse')
    const r = parseAnyText('Here you go:\n```json\n' + wrap([{ type: 'paragraph', text: 'x' }]) + '\n```\nHope that helps')
    expect(r.kind).toBe('notes')
  })
  it('treats unreadable text as a deck attempt, so the deck errors show', async () => {
    const { parseAnyText } = await import('./parse')
    const r = parseAnyText('not json')
    expect(r.kind).toBe('deck')
    expect(r.result.ok).toBe(false)
  })
})

describe('splitObjects', () => {
  it('finds each top-level JSON object in pasted text, ignoring braces inside strings', async () => {
    const { splitObjects } = await import('./parse')
    const a = '{"format":"mneme.notes","notes":{"title":"Has a } brace"}}'
    const b = '{"format":"mneme.notes","notes":{"title":"Two"}}'
    const text = `Part 1:\n\`\`\`json\n${a}\n\`\`\`\nSay next.\n\nPart 2:\n\`\`\`json\n${b}\n\`\`\``
    expect(splitObjects(text)).toEqual([a, b])
  })
  it('returns the whole text when there is only one object or none', async () => {
    const { splitObjects } = await import('./parse')
    expect(splitObjects('{"a":1}')).toEqual(['{"a":1}'])
    expect(splitObjects('no json here')).toEqual(['no json here'])
  })
})

describe('derivation, plot and figure blocks', () => {
  it('reads all three', () => {
    const r = parseNotesText(wrap([
      { type: 'derivation', title: 'Break-even', lines: [{ lhs: '0', rhs: '(P - V)Q - F', why: 'profit is zero' }, { rhs: '15Q - 24{,}000' }] },
      { type: 'plot', x: { label: 'Units', min: 0, max: 3000 }, y: { min: 0, max: 120000, unit: '$' }, lines: [{ label: 'Revenue', fn: '40x' }, { label: 'Cost', fn: '24000 + 25x' }], points: [{ x: 1600, y: 64000, label: 'Break-even' }], areas: [{ between: [0, 1], from: 1600, label: 'Profit', tone: 'good' }] },
      { type: 'figure', svg: '<svg viewBox="0 0 10 10"><rect width="5" height="5" fill="accent"/></svg>', alt: 'A square' },
    ]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.warnings).toEqual([])
    expect(r.notes.blocks.map((b) => b.type)).toEqual(['derivation', 'plot', 'figure'])
  })
  it('skips a plot whose formula is not maths, with a reason', () => {
    const r = parseNotesText(wrap([{ type: 'paragraph', text: 'x' }, { type: 'plot', x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, lines: [{ fn: 'alert(1)' }] }]))
    expect(r.ok && r.notes.blocks.length).toBe(1)
    expect(r.ok && r.warnings.join(' ')).toMatch(/not a formula/)
  })
  it('skips a figure that is not an svg', () => {
    const r = parseNotesText(wrap([{ type: 'paragraph', text: 'x' }, { type: 'figure', svg: '<div>no</div>', alt: 'x' }]))
    expect(r.ok && r.notes.blocks.length).toBe(1)
  })
})

describe('the prompt teaches valid blocks', () => {
  it('every derivation, plot and figure example in the prompt imports without warnings', () => {
    const catalog = PROMPT.slice(PROMPT.indexOf('## 4. Block catalog'), PROMPT.indexOf('## 5.'))
    const examples = [...catalog.matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g)].map((m) => m[1]).filter((j) => /"type": "(derivation|plot|figure)"/.test(j))
    expect(examples.length).toBe(3)
    for (const ex of examples) {
      const r = parseNotesText(wrap([JSON.parse(ex)]))
      expect(r.ok && r.warnings).toEqual([])
    }
  })
})
