import { createElement, type ReactNode } from 'react'

// Figures drawn by an AI arrive as SVG text. Only a fixed set of drawing elements and attributes survives;
// the result is rebuilt as React elements (never innerHTML), so nothing in the file can run or load anything.
// Colours become theme roles, so a figure matches light, dark and custom themes.

export type SvgNode = { tag: string; attrs: Record<string, string>; children: (SvgNode | string)[] }

const TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'marker', 'title', 'desc'])
const TEXT_PARENTS = new Set(['text', 'tspan', 'title', 'desc'])
const ATTRS = new Set([
  'viewBox', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'width', 'height', 'dx', 'dy', 'transform',
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity',
  'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline',
  'marker-end', 'marker-start', 'marker-mid', 'id', 'refX', 'refY', 'markerWidth', 'markerHeight', 'orient', 'markerUnits',
])
const ROLES: Record<string, string> = {
  ink: 'var(--ink)', muted: 'var(--muted)', line: 'var(--line)', surface: 'var(--surface)', surface2: 'var(--surface2)', bg: 'var(--bg)',
  accent: 'var(--accent)', accent2: '#C8742C', accent3: '#6B7F95', good: 'var(--good)', bad: 'var(--bad)',
  none: 'none', currentcolor: 'currentColor', transparent: 'none',
}
const MAX_NODES = 3000

function luminance(c: string): number | null {
  let r: number, g: number, b: number
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c)
  const rgb = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(c)
  if (hex) { const h = hex[1].length === 3 ? hex[1].split('').map((x) => x + x).join('') : hex[1]; [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) }
  else if (rgb) { [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number) }
  else if (/^(black)$/i.test(c)) return 0
  else if (/^(white)$/i.test(c)) return 1
  else return null
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** A colour value → a theme role. Unknown colours go to the nearest sensible role for fills or strokes. */
function color(v: string, kind: 'fill' | 'stroke'): string {
  const k = v.trim().toLowerCase()
  if (ROLES[k]) return ROLES[k]
  const l = luminance(k)
  if (l === null) return kind === 'fill' ? 'var(--accent)' : 'var(--ink)'
  if (kind === 'fill') return l > 0.85 ? 'var(--surface)' : l > 0.6 ? 'var(--surface2)' : l < 0.2 ? 'var(--ink)' : 'var(--accent)'
  return l < 0.35 ? 'var(--ink)' : l > 0.8 ? 'var(--line)' : 'var(--muted)'
}

/** Clean an SVG string. `prefix` makes ids (markers) unique to this figure on the page. Null if it isn't usable SVG. */
export function sanitizeSvg(src: string, prefix: string): SvgNode | null {
  if (src.length > 200_000) return null
  let doc: Document
  try { doc = new DOMParser().parseFromString(src, 'image/svg+xml') } catch { return null }
  const root = doc.documentElement
  if (!root || root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) return null
  let count = 0
  const fixUrl = (v: string): string | null => {
    const m = /^url\(\s*#([\w-]+)\s*\)$/.exec(v.trim())
    return m ? `url(#${prefix}-${m[1]})` : null
  }
  const walk = (el: Element): (SvgNode | string)[] => {
    if (++count > MAX_NODES) return []
    const tag = el.localName
    const kids = (): (SvgNode | string)[] => [...el.childNodes].flatMap((c) => {
      if (c.nodeType === 3) return TEXT_PARENTS.has(tag) && c.textContent ? [c.textContent] : []
      return c.nodeType === 1 ? walk(c as Element) : []
    })
    // A disallowed wrapper (like <a>) is dropped but what it holds is kept; dangerous content is dropped whole.
    if (!TAGS.has(tag)) return ['script', 'style', 'foreignObject', 'image', 'use', 'iframe'].includes(tag) ? [] : kids()
    const attrs: Record<string, string> = {}
    for (const a of [...el.attributes]) {
      const name = a.name, v = a.value
      if (!ATTRS.has(name) || /javascript:|data:|expression\(/i.test(v)) continue
      if (name === 'fill' || name === 'stroke') { attrs[name] = /url\(/i.test(v) ? (fixUrl(v) ?? color('', name)) : color(v, name); continue }
      if (name.startsWith('marker-')) { const u = fixUrl(v); if (u) attrs[name] = u; continue }
      if (name === 'id') { attrs.id = `${prefix}-${v.replace(/[^\w-]/g, '')}`; continue }
      if (/url\(/i.test(v)) continue
      if (name === 'font-size' && !/^\d+(\.\d+)?(px)?$/.test(v.trim())) continue
      attrs[name] = v
    }
    return [{ tag, attrs, children: kids() }]
  }
  const [svg] = walk(root) as SvgNode[]
  if (!svg) return null
  // Size comes from the page, not the file: keep the drawing's coordinate box only.
  if (!svg.attrs.viewBox && svg.attrs.width && svg.attrs.height) svg.attrs.viewBox = `0 0 ${parseFloat(svg.attrs.width)} ${parseFloat(svg.attrs.height)}`
  delete svg.attrs.width; delete svg.attrs.height
  return svg.attrs.viewBox ? svg : null
}

const camel = (s: string) => (s === 'viewBox' || !s.includes('-') || s.startsWith('aria-') ? s : s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()))

/** Turn a cleaned tree into React elements. */
export function svgToReact(n: SvgNode | string, key: number | string = 0): ReactNode {
  if (typeof n === 'string') return n
  const props: Record<string, unknown> = { key }
  for (const [k, v] of Object.entries(n.attrs)) props[camel(k)] = v
  return createElement(n.tag, props, ...n.children.map((c, i) => svgToReact(c, i)))
}
