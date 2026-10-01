// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sanitizeSvg, type SvgNode } from './svgSafe'

const flat = (n: SvgNode | string): string => (typeof n === 'string' ? n : `<${n.tag} ${Object.entries(n.attrs).map(([k, v]) => `${k}=${v}`).join(' ')}>${n.children.map(flat).join('')}</${n.tag}>`)

describe('sanitizeSvg', () => {
  it('keeps drawing elements and drops everything that can run or load', () => {
    const t = sanitizeSvg(`<svg viewBox="0 0 100 50" onload="alert(1)"><script>alert(1)</script>
      <rect x="1" y="2" width="10" height="10" fill="accent" onclick="x()" style="fill:red"/>
      <a href="javascript:alert(1)"><text x="5" y="20">hi</text></a>
      <foreignObject><div>html</div></foreignObject><image href="https://evil/x.png"/>
      <use href="#r"/><path d="M0 0L10 10" stroke="ink"/></svg>`, 'f1')
    const s = flat(t!)
    expect(s).toContain('<rect')
    expect(s).toContain('<path')
    for (const bad of ['script', 'onload', 'onclick', 'style', 'href', 'foreignObject', 'image', '<use', '<a ', 'javascript', 'html']) expect(s).not.toContain(bad)
    expect(s).toContain('hi') // text inside a removed <a> is kept, without the link
  })
  it('maps colour roles to the theme and other colours to the nearest role', () => {
    const s = flat(sanitizeSvg('<svg viewBox="0 0 10 10"><rect fill="accent" stroke="#000000"/><circle fill="#ffffff" stroke="none"/></svg>', 'f1')!)
    expect(s).toContain('fill=var(--accent)')
    expect(s).toContain('stroke=var(--ink)')
    expect(s).toContain('fill=var(--surface)')
    expect(s).toContain('stroke=none')
  })
  it('keeps arrowheads, with ids made unique to this figure', () => {
    const s = flat(sanitizeSvg('<svg viewBox="0 0 10 10"><defs><marker id="arrow"><path d="M0 0L5 5"/></marker></defs><line x1="0" y1="0" x2="5" y2="5" marker-end="url(#arrow)"/></svg>', 'f7')!)
    expect(s).toContain('id=f7-arrow')
    expect(s).toContain('marker-end=url(#f7-arrow)')
  })
  it('refuses things that are not SVG, and external urls anywhere', () => {
    expect(sanitizeSvg('<div>hi</div>', 'f1')).toBeNull()
    expect(sanitizeSvg('not xml at all <', 'f1')).toBeNull()
    expect(flat(sanitizeSvg('<svg viewBox="0 0 10 10"><rect fill="url(https://evil/x)"/></svg>', 'f1')!)).not.toContain('evil')
  })
})
