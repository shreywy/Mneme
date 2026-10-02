import { describe, expect, it } from 'vitest'
import { classifyPaste } from './paste'

const origin = 'https://mnemee.pages.dev'

describe('smart paste', () => {
  it('cells from Sheets or Excel (tab-separated) become a table', () => {
    expect(classifyPaste({ text: 'x\ty\n1\t2\n3\t4\n', origin })).toEqual({ kind: 'table', rows: [['x', 'y'], ['1', '2'], ['3', '4']] })
  })

  it('LaTeX becomes an equation, with $$ or \\[ \\] taken off', () => {
    expect(classifyPaste({ text: '\\frac{mv^2}{r}', origin })).toEqual({ kind: 'latex', tex: '\\frac{mv^2}{r}' })
    expect(classifyPaste({ text: '$$ F = ma $$', origin })).toEqual({ kind: 'latex', tex: 'F = ma' })
    expect(classifyPaste({ text: '\\[ \\sqrt{2} \\]', origin })).toEqual({ kind: 'latex', tex: '\\sqrt{2}' })
  })

  it('code from an editor becomes a code block, with the language when the editor says it', () => {
    expect(classifyPaste({ text: 'def f(x):\n    return x * 2', origin, editorLanguage: 'python' })).toEqual({ kind: 'code', code: 'def f(x):\n    return x * 2', lang: 'python' })
    expect(classifyPaste({ text: 'function f(x) {\n  return x * 2;\n}', origin })).toMatchObject({ kind: 'code' })
  })

  it('a link to a deck, notes page or page in this app becomes a card', () => {
    expect(classifyPaste({ text: `${origin}/deck/abc-1`, origin })).toEqual({ kind: 'link', target: { kind: 'deck', id: 'abc-1' } })
    expect(classifyPaste({ text: ` ${origin}/write/p9 `, origin })).toEqual({ kind: 'link', target: { kind: 'sheet', id: 'p9' } })
    expect(classifyPaste({ text: `${origin}/notes/n1/anything`, origin })).toEqual({ kind: 'link', target: { kind: 'note', id: 'n1' } })
    expect(classifyPaste({ text: 'https://example.com/deck/abc', origin })).toBeNull()
  })

  it('ordinary writing is left alone', () => {
    expect(classifyPaste({ text: 'Moving in a circle still counts as accelerating.', origin })).toBeNull()
    expect(classifyPaste({ text: 'Two lines\nof plain notes, nothing special.', origin })).toBeNull()
    expect(classifyPaste({ text: 'costs $5 and $10', origin })).toBeNull()
  })
})
