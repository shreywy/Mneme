// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createElement as h, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from './Markdown'
import { sanitizeSvg, svgToReact } from './svgSafe'
import { texHtml } from '../sheets/tex'
import { compileExpr } from './expr'
import { dangers } from './dangers.testutil'

// Known XSS payloads (from the OWASP filter evasion cheat sheet and PortSwigger's list), thrown at every
// place untrusted text is turned into markup. None of it may come out able to run or load anything.
const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<a href="javascript:alert(1)">click</a>',
  '[click](javascript:alert(1))',
  '[click](JaVaScRiPt:alert(1))',
  '[click](  javascript:alert(1))',
  '[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
  '[click](vbscript:msgbox(1))',
  '![x](javascript:alert(1))',
  '![x](https://evil.example/pixel.png)',
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
  '<details open ontoggle=alert(1)>',
  '<body onload=alert(1)>',
  '<input autofocus onfocus=alert(1)>',
  '<object data="javascript:alert(1)">',
  '<embed src="javascript:alert(1)">',
  '<form action="javascript:alert(1)"><button>x</button></form>',
  '<style>@import "https://evil.example/x.css"</style>',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<base href="https://evil.example/">',
  '<link rel="stylesheet" href="https://evil.example/x.css">',
  '"><script>alert(1)</script>',
  '<scr<script>ipt>alert(1)</scr</script>ipt>',
  '<IMG SRC=JaVaScRiPt:alert(1)>',
  '<div style="background:url(javascript:alert(1))">x</div>',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  '$$\\href{javascript:alert(1)}{x}$$',
  '$$\\url{javascript:alert(1)}$$',
  '$$\\htmlData{onclick=alert(1)}{x}$$',
  '$$\\htmlStyle{background:url(https://evil.example)}{x}$$',
  '$$\\includegraphics{https://evil.example/x.png}$$',
]

describe('untrusted text never becomes live markup', () => {
  it('the checker flags the payloads themselves, so passing means something', () => {
    const raw = PAYLOADS.filter((p) => p.startsWith('<') && !/^<(scr<|math|noscript)/.test(p))
    for (const p of raw) expect(dangers(p), p).not.toEqual([])
  })

  it.each(PAYLOADS)('deck and notes Markdown: %s', (p) => {
    expect(dangers(renderToStaticMarkup(h(Markdown, { children: p })))).toEqual([])
    expect(dangers(renderToStaticMarkup(h(Markdown, { inline: true, children: `Before ${p} after` })))).toEqual([])
  })

  it.each(PAYLOADS.filter((p) => p.startsWith('$$')).map((p) => p.slice(2, -2)))('maths on a page (KaTeX HTML): %s', (tex) => {
    expect(dangers(texHtml(tex, true))).toEqual([])
    expect(dangers(texHtml(tex, false))).toEqual([])
  })

  it('maths that breaks KaTeX is shown escaped, not as markup', () => {
    for (const p of PAYLOADS) expect(dangers(texHtml(p, true))).toEqual([])
  })

  it.each(PAYLOADS)('figures (SVG): %s', (p) => {
    const tree = sanitizeSvg(`<svg viewBox="0 0 10 10"><g>${p}</g><text>${p}</text></svg>`, 'x')
    if (tree) expect(dangers(renderToStaticMarkup(h(Fragment, null, svgToReact(tree))))).toEqual([])
  })

  it('plot formulas only understand maths, so code in one is an error, not something that runs', () => {
    for (const p of ['alert(1)', 'constructor.constructor("alert(1)")()', 'x.constructor', '__proto__', 'this', 'window', 'fetch("//evil")', '1;alert(1)', 'x=>x', '`${1}`']) {
      let f: ((x: number) => number) | null = null
      try { f = compileExpr(p) } catch { /* refused: good */ }
      if (f) expect(Number.isNaN(f(1)) || typeof f(1) === 'number').toBe(true)
    }
  })
})
