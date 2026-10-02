import { describe, expect, it } from 'vitest'
import { texHtml } from './tex'

describe('maths to HTML', () => {
  it('renders LaTeX with KaTeX', () => {
    expect(texHtml('x^2', false)).toContain('katex')
  })

  it('when KaTeX gives up, shows the source as text, never as HTML', () => {
    const evil = '\\frac<img src=x onerror=alert(1)>' + '{'.repeat(5000)
    const out = texHtml(evil, true)
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })

  it('an empty formula shows a box to click', () => {
    expect(texHtml('', true)).toContain('katex')
  })
})
