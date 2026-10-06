// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDeckText } from './deck-format/parse'
import { extractPromptExample } from './deck-format/example'
import { parseAnyText, parseNotesText } from './notes-format/parse'
import { compileExpr } from './content/expr'
import { sanitizeSvg, type SvgNode } from './content/svgSafe'
import { parsePagePayload } from './sheets/sharepage'
import { decodePoints, encodePoints, type Pt } from './sheets/ink'

// Property-based tests (fast-check) for every parser that reads text from an AI or another person.
// Each property runs on a few hundred generated inputs; a failure prints the smallest input that breaks it.

const RUNS = { numRuns: 300 }
const DECK = extractPromptExample(readFileSync(join(__dirname, '../deck-format/mneme-deck-prompt.md'), 'utf8'))
const NOTES_MD = readFileSync(join(__dirname, '../deck-format/mneme-notes-prompt.md'), 'utf8')
const NOTES = NOTES_MD.slice(NOTES_MD.indexOf('## 6. Complete example')).match(/```json\r?\n([\s\S]*?)\r?\n```/)![1]

/** Replaces one value somewhere in a JSON tree, or deletes it: the kind of slip an AI makes. */
const mutate = (root: unknown) => fc.tuple(fc.nat(), fc.oneof(fc.jsonValue(), fc.constant(undefined))).map(([n, v]) => {
  const copy = structuredClone(root) as Record<string, unknown>
  const spots: [Record<string, unknown>, string][] = []
  const walk = (o: unknown) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { spots.push([o as Record<string, unknown>, k]); walk((o as Record<string, unknown>)[k]) } }
  walk(copy)
  if (!spots.length) return copy
  const [obj, key] = spots[n % spots.length]
  if (v === undefined) delete obj[key]; else obj[key] = v
  return copy
})

describe('importers never crash, whatever they are given', () => {
  it('any text at all', () => {
    fc.assert(fc.property(fc.string({ maxLength: 400 }), (s) => {
      expect(typeof parseDeckText(s).ok).toBe('boolean')
      expect(typeof parseNotesText(s).ok).toBe('boolean')
      parseAnyText(s)
    }), RUNS)
  })

  it('any JSON, possibly wrapped in prose or a code fence', () => {
    fc.assert(fc.property(fc.jsonValue(), fc.constantFrom('', 'Here you go:\n```json\n', 'Sure! '), (v, before) => {
      const text = `${before}${JSON.stringify(v)}`
      parseDeckText(text); parseNotesText(text); parseAnyText(text)
    }), RUNS)
  })

  it('the prompt’s own example with one value changed or missing', () => {
    const deck = JSON.parse(DECK), notes = JSON.parse(NOTES)
    fc.assert(fc.property(mutate(deck), (d) => {
      const r = parseDeckText(JSON.stringify(d))
      if (r.ok) {
        const ids = r.deck.items.map((it) => it.key)
        expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true)
        expect(new Set(ids).size).toBe(ids.length) // repairs never leave two cards with one key
      }
    }), RUNS)
    fc.assert(fc.property(mutate(notes), (n) => { parseNotesText(JSON.stringify(n)) }), RUNS)
  })

  it('the example cut off part way, as when a chat reply is truncated', () => {
    fc.assert(fc.property(fc.nat({ max: DECK.length }), (n) => { parseDeckText(DECK.slice(0, n)) }), RUNS)
  })

  it('shared pages: anything at all is either a valid page or refused', () => {
    fc.assert(fc.property(fc.anything(), (x) => { parsePagePayload(x) }), RUNS)
    fc.assert(fc.property(fc.jsonValue(), (doc) => {
      parsePagePayload({ format: 'mneme.page', version: 1, title: 'T', ink: [], paper: { lines: 'dots', spacing: 24, strength: 0.5, color: null, margin: false, paperColor: null }, blocks: [{ x: 0, y: 0, w: 4, h: 1, kind: 'text', data: { doc } }] })
    }), RUNS)
  })
})

describe('plot formulas', () => {
  const tokens = fc.constantFrom('x', '1', '2.5', 'pi', 'e', '+', '-', '*', '/', '^', '(', ')', 'sin', 'cos', 'sqrt', 'ln', 'abs', ' ', 'alert', 'constructor', '.', '[', ']', '"', '=>', ';', 'this', '__proto__')
  it('either refuse a formula or give a number for every x', () => {
    fc.assert(fc.property(fc.array(tokens, { maxLength: 30 }).map((t) => t.join('')), fc.double(), (src, x) => {
      let f: ((x: number) => number) | null = null
      try { f = compileExpr(src) } catch (e) { expect(e).toBeInstanceOf(Error); return }
      expect(typeof f(x)).toBe('number')
    }), RUNS)
  })
  it('never reach a global, however the formula is spelled', () => {
    fc.assert(fc.property(fc.string({ maxLength: 60 }), (src) => {
      const before = Object.keys(globalThis).length
      try { compileExpr(src)(1) } catch { /* refused */ }
      expect(Object.keys(globalThis).length).toBe(before)
    }), RUNS)
  })
})

describe('figures (SVG)', () => {
  const tag = fc.constantFrom('svg', 'g', 'path', 'rect', 'text', 'script', 'a', 'image', 'use', 'foreignObject', 'style', 'iframe', 'animate', 'set', 'feImage', 'div')
  const attr = fc.tuple(
    fc.constantFrom('fill', 'stroke', 'd', 'x', 'href', 'xlink:href', 'onload', 'onclick', 'style', 'src', 'id', 'marker-end', 'transform', 'begin', 'attributeName', 'values'),
    fc.oneof(fc.string({ maxLength: 20 }), fc.constantFrom('javascript:alert(1)', 'url(https://evil.example/x)', 'url(#m)', 'expression(alert(1))', '#ff0000', 'accent')),
  )
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const tree = fc.letrec<{ node: string; el: string }>((t) => ({
    node: fc.oneof({ maxDepth: 4 }, fc.string({ maxLength: 10 }).map(esc), t('el')),
    el: fc.tuple(tag, fc.array(attr, { maxLength: 4 }), fc.array(t('node'), { maxLength: 3 }))
      .map(([name, attrs, kids]) => `<${name} ${attrs.map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}>${kids.join('')}</${name}>`),
  })).el

  const ALLOWED = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'marker', 'title', 'desc'])
  it('keep only drawing elements, no event handlers, and no links or styles', () => {
    fc.assert(fc.property(tree, (body) => {
      const out = sanitizeSvg(`<svg viewBox="0 0 10 10">${body}</svg>`, 'p')
      const check = (n: SvgNode | string) => {
        if (typeof n === 'string') return
        expect(ALLOWED.has(n.tag)).toBe(true)
        for (const [k, v] of Object.entries(n.attrs)) {
          expect(k).not.toMatch(/^on|href|style|src|begin|values/i)
          expect(v).not.toMatch(/javascript:|expression\(|url\((?!#p-)/i)
        }
        n.children.forEach(check)
      }
      if (out) check(out)
    }), RUNS)
  })
})

describe('ink storage', () => {
  it('gets every point back to within a quarter pixel and 1/64 of pressure', () => {
    const pt = fc.tuple(fc.double({ min: -1e5, max: 1e5, noNaN: true }), fc.double({ min: -1e5, max: 1e5, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true })).map((p) => p as Pt)
    fc.assert(fc.property(fc.array(pt, { maxLength: 200 }), (pts) => {
      const back = decodePoints(encodePoints(pts))
      expect(back).toHaveLength(pts.length)
      back.forEach(([x, y, p], i) => {
        expect(Math.abs(x - pts[i][0])).toBeLessThanOrEqual(0.125 + 1e-9)
        expect(Math.abs(y - pts[i][1])).toBeLessThanOrEqual(0.125 + 1e-9)
        expect(Math.abs(p - pts[i][2])).toBeLessThanOrEqual(1 / 128 + 1e-9)
      })
    }), RUNS)
  })
})
