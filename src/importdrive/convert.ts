import type { JSONContent } from '@tiptap/core'
import type { FileType } from './tree'

// A Drive file as the content of a page's main column (top-level editor nodes, without the title line).
// Word and Markdown go to HTML, then through the editor's own schema (generateJSON), which keeps only what
// a page can hold: that's the sanitiser, and the HTML is only ever parsed in an inert DOMParser document.
// The converters load only when an import runs.

/** A picture from a Word file, waiting to be stored. Its image node has `local: key` until then. */
export type Pic = { key: string; type: string; data: Uint8Array }
export type Converted = { content: JSONContent[]; pics: Pic[] }

const text = (t: string): JSONContent[] => (t ? [{ type: 'text', text: t }] : [])
const para = (t: string): JSONContent => ({ type: 'paragraph', content: text(t) })

/** Plain text: paragraphs at blank lines, line breaks kept. */
export function textNodes(s: string): JSONContent[] {
  return s.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((p) => p.replace(/^\n+|\s+$/g, '')).filter(Boolean).map((p) => ({
    type: 'paragraph',
    content: p.split('\n').flatMap((line, i) => [...(i ? [{ type: 'hardBreak' }] : []), ...text(line)]),
  }))
}

export async function htmlNodes(html: string): Promise<JSONContent[]> {
  const [{ generateJSON }, { textExtensions }] = await Promise.all([import('@tiptap/core'), import('../features/sheet/editor/extensions')])
  return (generateJSON(html, textExtensions(false)).content ?? []) as JSONContent[]
}

export async function markdownNodes(md: string): Promise<JSONContent[]> {
  const [{ createElement }, { renderToStaticMarkup }, { default: ReactMarkdown }, { default: remarkGfm }] = await Promise.all([
    import('react'), import('react-dom/server'), import('react-markdown'), import('remark-gfm'),
  ])
  // react-markdown escapes any raw HTML in the file.
  return htmlNodes(renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, md)))
}

export async function docxNodes(data: Uint8Array): Promise<Converted> {
  const mammoth = (await import('mammoth')).default
  const pics: Pic[] = []
  const ab = data.slice().buffer
  // The browser build reads `arrayBuffer`; the Node one (tests) reads `buffer`.
  const { value } = await mammoth.convertToHtml({ arrayBuffer: ab, buffer: ab } as { arrayBuffer: ArrayBuffer }, {
    styleMap: ['u => u'],
    convertImage: mammoth.images.imgElement(async (img) => {
      const key = `drive-pic:${pics.length}`
      pics.push({ key, type: img.contentType, data: new Uint8Array(await img.readAsArrayBuffer()) })
      return { src: key }
    }),
  })
  // Pictures come in as the editor's own picture blocks, pointing at the stored copy once it's made.
  const html = value.replace(/<img [^>]*src="(drive-pic:\d+)"[^>]*>/g, '<figure data-image data-local="$1"></figure>')
  return { content: await htmlNodes(html), pics }
}

// ---------- PDF ----------

/** One run of text on a PDF page: where it starts, how wide, and the font size. y grows up the page. */
export type PdfRun = { str: string; x: number; y: number; w: number; size: number }
type Line = { text: string; y: number; size: number; end: number }

/**
 * Paragraphs and headings from a PDF's text runs, one array per page. Runs at the same height make a line;
 * lines close together at the body size make a paragraph; lines in a clearly bigger font are headings.
 */
export function pdfNodes(pages: PdfRun[][]): JSONContent[] {
  const linesOf = (runs: PdfRun[]): Line[] => {
    const lines: Line[] = []
    for (const r of [...runs].filter((r) => r.str).sort((a, b) => b.y - a.y || a.x - b.x)) {
      const cur = lines.at(-1)
      if (cur && Math.abs(cur.y - r.y) <= Math.max(cur.size, r.size) * 0.4) {
        const gap = r.x - cur.end > r.size * 0.15 && !cur.text.endsWith(' ') && !r.str.startsWith(' ')
        cur.text += (gap ? ' ' : '') + r.str
        cur.end = Math.max(cur.end, r.x + r.w)
        cur.size = Math.max(cur.size, r.size)
      } else lines.push({ text: r.str, y: r.y, size: r.size, end: r.x + r.w })
    }
    // Lone page numbers aren't text.
    return lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text && !/^\d{1,4}$/.test(l.text))
  }
  const all = pages.map(linesOf)
  // The body size is the one most text is set in.
  const weight = new Map<number, number>()
  for (const l of all.flat()) { const k = Math.round(l.size * 2) / 2; weight.set(k, (weight.get(k) ?? 0) + l.text.length) }
  const body = [...weight].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12
  const level = (size: number) => (size >= body * 1.5 ? 2 : size >= body * 1.2 ? 3 : 0)

  const out: JSONContent[] = []
  for (const lines of all) {
    let cur: { level: number; text: string; prev: Line } | null = null
    const flush = () => { if (cur) out.push(cur.level ? { type: 'heading', attrs: { level: cur.level }, content: text(cur.text) } : para(cur.text)) ; cur = null }
    for (const l of lines) {
      const lv = level(l.size)
      const apart = cur && (cur.prev.y - l.y > cur.prev.size * 1.6 || lv !== cur.level || Math.abs(l.size - cur.prev.size) > 0.75)
      if (!cur || apart) { flush(); cur = { level: lv, text: l.text, prev: l }; continue }
      // "logi-" then "cal" is "logical".
      cur.text = /[a-z]-$/.test(cur.text) && /^[a-z]/.test(l.text) ? cur.text.slice(0, -1) + l.text : `${cur.text} ${l.text}`
      cur.prev = l
    }
    flush()
  }
  return out
}

export async function pdfRuns(data: Uint8Array): Promise<PdfRun[][]> {
  const [pdfjs, { default: workerSrc }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
  const task = pdfjs.getDocument({ data })
  const doc = await task.promise
  try {
    const pages: PdfRun[][] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const { items } = await page.getTextContent()
      pages.push(items.flatMap((it) => ('str' in it ? [{ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, size: Math.hypot(it.transform[2], it.transform[3]) || it.height }] : [])))
    }
    return pages
  } finally { void task.destroy() }
}

/** Any supported file as page content. Throws if it can't be read. */
export async function convert(type: FileType, data: Uint8Array): Promise<Converted> {
  const str = () => new TextDecoder().decode(data)
  switch (type) {
    case 'txt': return { content: textNodes(str()), pics: [] }
    case 'md': return { content: await markdownNodes(str()), pics: [] }
    case 'docx': return docxNodes(data)
    case 'pdf': {
      const content = pdfNodes(await pdfRuns(data))
      if (!content.length) throw new Error('No text in it (a scan, maybe)')
      return { content, pics: [] }
    }
  }
}

// ---------- long documents ----------

const size = (n: unknown) => new TextEncoder().encode(JSON.stringify(n)).byteLength

/**
 * Splits top-level nodes into runs that each stay under `max` bytes as JSON, so every text block's synced row
 * stays under the server's per-row limit. ponytail: a single node bigger than `max` stays whole (and won't sync).
 */
export function splitNodes(nodes: JSONContent[], max = 180_000): JSONContent[][] {
  const out: JSONContent[][] = [[]]
  let used = 0
  for (const n of nodes) {
    const s = size(n) + 1
    if (used + s > max && out.at(-1)!.length) { out.push([]); used = 0 }
    out.at(-1)!.push(n)
    used += s
  }
  return out
}
