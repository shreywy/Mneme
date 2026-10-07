import type { Img } from './chat'

// A snapshot of part of the screen without screen-capture permission: the text inside the box (maths
// as its LaTeX source) and a picture of the drawings, pictures and canvases in it. Instant, because it
// reads what the app already drew.

const SKIP = 'button, input, textarea, select, script, style, .aipanel, .snap-layer, .sel-bar, .toasts, [aria-hidden="true"]'
// Not part of what you're looking at: our own controls and panels.
const NOT_DRAWN = 'button, .aipanel, .snap-layer, .sel-bar, .toasts'
const hits = (r: DOMRect, b: DOMRect) => r.width > 0 && r.height > 0 && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top

/** The text inside the box, in reading order. KaTeX maths becomes $…$ from its annotation. */
export function textIn(box: DOMRect, root: Element = document.body): string {
  const out: string[] = []
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (n.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT
      const el = n as Element
      if (el.matches(SKIP)) return NodeFilter.FILTER_REJECT
      if (el.classList.contains('katex')) {
        if (hits(el.getBoundingClientRect(), box)) {
          const tex = el.querySelector('annotation')?.textContent
          out.push(tex ? ` $${tex}$ ` : el.textContent ?? '')
        }
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_SKIP
    },
  })
  const range = document.createRange()
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.nodeType !== Node.TEXT_NODE || !n.textContent?.trim()) continue
    range.selectNodeContents(n)
    if ([...range.getClientRects()].some((r) => hits(r, box))) {
      const block = getComputedStyle(n.parentElement!).display !== 'inline'
      out.push(block ? `\n${n.textContent}` : n.textContent)
    }
  }
  return out.join('').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()
}

/**
 * An SVG cut to the box, ready to draw standalone. It's mapped through its screen transform, so ink
 * layers (1px boxes their drawing spills out of) and zoomed or scaled drawings come out where they show.
 * Colours are written in, because CSS variables and currentColor don't travel. Null if nothing is in the box.
 */
function cut(svg: SVGSVGElement, box: DOMRect): string | null {
  const m = svg.getScreenCTM()
  if (!m) return null
  const bb = svg.getBBox()
  const a = new DOMPoint(bb.x, bb.y).matrixTransform(m), z = new DOMPoint(bb.x + bb.width, bb.y + bb.height).matrixTransform(m)
  const shown = new DOMRect(Math.min(a.x, z.x), Math.min(a.y, z.y), Math.abs(z.x - a.x), Math.abs(z.y - a.y))
  // Icons are small and say nothing.
  if (!hits(shown, box) || (shown.width < 24 && shown.height < 24)) return null
  const inv = m.inverse()
  const p0 = new DOMPoint(box.left, box.top).matrixTransform(inv), p1 = new DOMPoint(box.right, box.bottom).matrixTransform(inv)
  const copy = svg.cloneNode(true) as SVGSVGElement
  const from = [svg, ...svg.querySelectorAll('*')], to = [copy, ...copy.querySelectorAll('*')]
  from.forEach((el, i) => {
    const cs = getComputedStyle(el)
    for (const p of ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'mix-blend-mode', 'font', 'color']) (to[i] as SVGElement).style.setProperty(p, cs.getPropertyValue(p))
  })
  copy.removeAttribute('class')
  copy.removeAttribute('style')
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  copy.setAttribute('width', String(box.width))
  copy.setAttribute('height', String(box.height))
  copy.setAttribute('viewBox', `${p0.x} ${p0.y} ${p1.x - p0.x} ${p1.y - p0.y}`)
  copy.setAttribute('preserveAspectRatio', 'none')
  return new XMLSerializer().serializeToString(copy)
}

const load = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src })

/** A PNG of the drawings, pictures and canvases inside the box (null when there are none). */
export async function pictureIn(box: DOMRect, root: Element = document.body): Promise<Img | null> {
  const scale = Math.min(2, devicePixelRatio || 1, 1600 / Math.max(box.width, box.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(box.width * scale))
  c.height = Math.max(1, Math.round(box.height * scale))
  const ctx = c.getContext('2d')!
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.scale(scale, scale)
  let drew = 0
  for (const el of root.querySelectorAll<HTMLElement | SVGSVGElement>('svg, img, canvas')) {
    if (el.closest(NOT_DRAWN) || el.parentElement?.closest('svg')) continue
    try {
      if (el instanceof SVGSVGElement) {
        const svg = cut(el, box)
        if (!svg) continue
        ctx.drawImage(await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`), 0, 0, box.width, box.height)
      } else {
        const r = el.getBoundingClientRect()
        // Another site's picture would taint the canvas and lose the whole snapshot.
        const src = el instanceof HTMLImageElement ? el.currentSrc : ''
        if (!hits(r, box) || (src && !/^(blob|data):/.test(src) && new URL(src, location.href).origin !== location.origin)) continue
        ctx.drawImage(el as HTMLImageElement | HTMLCanvasElement, r.left - box.left, r.top - box.top, r.width, r.height)
      }
      drew++
    } catch { /* a picture that won't draw: left out */ }
  }
  if (!drew) return null
  try { return { mimeType: 'image/png', data: c.toDataURL('image/png').split(',')[1] } }
  catch { return null } // a picture from another site tainted the canvas
}

export async function snap(box: DOMRect, root?: Element): Promise<{ text: string; image: Img | null }> {
  return { text: textIn(box, root), image: await pictureIn(box, root) }
}
