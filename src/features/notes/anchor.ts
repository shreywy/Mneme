// Text anchors for highlights, annotations and bookmarks.
// A span of text is remembered as the quote itself plus a little context on each side and its rough
// position, so it can be found again after the page re-renders, even if the same phrase appears twice.

export type TextAnchor = { quote: string; prefix: string; suffix: string; offset: number }

const CONTEXT = 32

export function describeSpan(text: string, start: number, end: number): TextAnchor {
  return {
    quote: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(end, end + CONTEXT),
    offset: start,
  }
}

/** Characters the two strings share from the given end (prefixes compare from their ends, suffixes from their starts). */
function shared(a: string, b: string, fromEnd: boolean): number {
  let n = 0
  while (n < a.length && n < b.length && (fromEnd ? a[a.length - 1 - n] === b[b.length - 1 - n] : a[n] === b[n])) n++
  return n
}

/** Where the anchored span is in `text` now, or null if the quote no longer appears. */
export function locate(text: string, a: TextAnchor): { start: number; end: number } | null {
  if (!a.quote) return null
  let best: { start: number; score: number } | null = null
  for (let i = text.indexOf(a.quote); i !== -1; i = text.indexOf(a.quote, i + 1)) {
    const ctx = shared(text.slice(Math.max(0, i - CONTEXT), i), a.prefix, true) + shared(text.slice(i + a.quote.length, i + a.quote.length + CONTEXT), a.suffix, false)
    // Context matters most; distance from the old position breaks ties.
    const score = ctx * 1000 - Math.min(999, Math.abs(i - a.offset))
    if (!best || score > best.score) best = { start: i, score }
  }
  return best ? { start: best.start, end: best.start + a.quote.length } : null
}

// ---------- DOM helpers (browser only) ----------

/** The text of an element as the anchors see it: its text nodes joined, skipping hidden KaTeX source. */
function textNodes(root: Node): Text[] {
  const out: Text[] = []
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => ((n.parentElement?.closest('.katex-mathml, .end-marker') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)),
  })
  for (let n = walk.nextNode(); n; n = walk.nextNode()) out.push(n as Text)
  return out
}

export function textOf(root: Node): string {
  return textNodes(root).map((t) => t.data).join('')
}

/** Character offsets of a range inside `root`, or null if the range isn't inside it. */
export function offsetsOf(root: Node, range: Range): { start: number; end: number } | null {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  let pos = 0, start = -1, end = -1
  for (const t of textNodes(root)) {
    if (t === range.startContainer) start = pos + range.startOffset
    if (t === range.endContainer) end = pos + range.endOffset
    pos += t.data.length
  }
  // A range that starts or ends on an element (not a text node): fall back to measuring with a probe range.
  if (start < 0 || end < 0) {
    const pre = document.createRange(); pre.selectNodeContents(root); pre.setEnd(range.startContainer, range.startOffset)
    start = pre.toString().length
    end = start + range.toString().length
  }
  return end > start ? { start, end } : null
}

/** A DOM range covering characters [start, end) of `root`'s text. */
export function rangeAt(root: Node, start: number, end: number): Range | null {
  let pos = 0
  const r = document.createRange()
  let started = false
  for (const t of textNodes(root)) {
    const len = t.data.length
    if (!started && start <= pos + len) { r.setStart(t, Math.max(0, start - pos)); started = true }
    if (started && end <= pos + len) { r.setEnd(t, Math.max(0, end - pos)); return r }
    pos += len
  }
  return null
}
