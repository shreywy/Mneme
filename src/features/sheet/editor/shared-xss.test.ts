// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { textExtensions } from './extensions'
import { parsePagePayload } from '../../../sheets/sharepage'
import { dangers } from '../../../content/dangers.testutil'

// A shared page is someone else's document. Whatever its JSON says, the text it renders must not be
// able to run script, navigate somewhere odd, or pull in something from another server.
const evil = 'background-image: url(https://evil.example/track.png)'
const link = (text: string, href: string) => ({ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] })
const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [
      link('a', 'javascript:alert(1)'),
      link('b', ' JaVaScRiPt:alert(1)'),
      link('c', 'data:text/html,<script>alert(1)</script>'),
      link('d', 'vbscript:msgbox(1)'),
      { type: 'text', text: 'e', marks: [{ type: 'textStyle', attrs: { color: `red; ${evil}`, fontFamily: `x; ${evil}`, fontSize: `1px; ${evil}` } }] },
      { type: 'text', text: 'f', marks: [{ type: 'highlight', attrs: { color: `red; ${evil}` } }] },
      link('g', 'https://example.com/ok'),
    ] },
    { type: 'image', attrs: { src: 'https://evil.example/x.png', local: 'x', stored: '../../etc', alt: '"><script>alert(1)</script>' } },
    { type: 'equation', attrs: { latex: String.raw`\href{javascript:alert(1)}{x}` } },
    { type: 'paragraph', content: [{ type: 'text', text: '<img src=x onerror=alert(1)>' }] },
  ],
}

function shared(): string {
  const p = parsePagePayload({ format: 'mneme.page', version: 1, title: 'T', ink: [],
    paper: { lines: 'dots', spacing: 24, strength: 0.5, color: null, margin: false, paperColor: null },
    blocks: [{ x: 3, y: 2, w: 24, h: 6, kind: 'text', data: { doc } }] })!
  const ed = new Editor({ extensions: textExtensions(false), content: p.blocks[0].data.doc as object, editable: false })
  const html = ed.getHTML()
  ed.destroy()
  return html
}

describe("a shared page's text", () => {
  it('can’t run script, navigate somewhere odd, or load from elsewhere', () => {
    expect(dangers(shared(), ['a', 'img'])).toEqual([])
  })
  it('keeps ordinary https links', () => {
    expect(shared()).toContain('href="https://example.com/ok"')
  })
  it('drops CSS smuggled in through colours and fonts', () => {
    expect(shared()).not.toMatch(/url\(/i)
  })
  it('drops pictures from anywhere but Imgur or Mneme’s signed links', () => {
    expect(shared()).not.toContain('evil.example')
  })
})
