import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { MarkColor, NoteMark } from '../../data/db'
import * as notesRepo from '../../data/notes'
import { Icon } from '../../ui/Icons'
import { useContextItems, type MenuItem } from '../../ui/ContextMenu'
import { toast } from '../../ui/toasts'
import type { KeyTerm } from '../../content/keyterms'
import { describeSpan, locate, offsetsOf, rangeAt, textOf, type TextAnchor } from './anchor'

// Highlights, annotations, bookmarks, find, and key-term tips for a notes page.
// Marks are drawn with the CSS Custom Highlight API, so React's DOM is never rewritten.

export const COLORS: MarkColor[] = ['yellow', 'green', 'blue', 'pink']
const COLOR_NAME: Record<MarkColor, string> = { yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink' }
const canHighlight = typeof CSS !== 'undefined' && 'highlights' in CSS
const LAST = 'mneme.lastHighlight'
const lastColor = (): MarkColor => { try { const c = localStorage.getItem(LAST) as MarkColor; return COLORS.includes(c) ? c : 'yellow' } catch { return 'yellow' } }

type Sel = { block: number; anchor: TextAnchor; rect: DOMRect }
type Pop =
  | { kind: 'mark'; id: string; rect: DOMRect }
  | { kind: 'compose'; rect: DOMRect; draft: Sel | { markId: string }; text: string }

/** The selection inside the page, pinned to one block (a selection that runs on is cut at the block's end). */
function readSelection(article: HTMLElement): Sel | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null
  const r = sel.getRangeAt(0)
  const startEl = r.startContainer instanceof Element ? r.startContainer : r.startContainer.parentElement
  const root = startEl?.closest<HTMLElement>('[data-block]')
  if (!root || !article.contains(root) || startEl?.closest('input, textarea, button, select')) return null
  let offs = offsetsOf(root, r)
  if (!offs) { const c = r.cloneRange(); c.setEnd(root, root.childNodes.length); offs = offsetsOf(root, c) }
  if (!offs) return null
  const text = textOf(root)
  if (!text.slice(offs.start, offs.end).trim()) return null
  return { block: Number(root.dataset.block), anchor: describeSpan(text, offs.start, Math.min(offs.end, text.length)), rect: r.getBoundingClientRect() }
}

const inRect = (r: DOMRect, x: number, y: number) => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1

export function ReadingTools({ noteId, articleRef, marks, terms, finding, setFinding, findQuery = '', layoutKey }: {
  noteId: string
  articleRef: RefObject<HTMLElement | null>
  marks: NoteMark[]
  terms: KeyTerm[]
  finding: boolean
  setFinding: (v: boolean) => void
  /** Start the find bar with this text (from a contents search). */
  findQuery?: string
  /** Changes when the page's content changes, so ranges get recomputed. */
  layoutKey: unknown
}) {
  const [ranges, setRanges] = useState<Map<string, Range>>(new Map())
  const [gutter, setGutter] = useState<{ id: string; top: number; kind: NoteMark['kind'] }[]>([])
  const [sel, setSel] = useState<Sel | null>(null)
  const [pop, setPop] = useState<Pop | null>(null)
  const [tick, setTick] = useState(0) // bumps when the DOM under the page changes (sections open and close)
  const [hover, setHover] = useState<{ id: string; rect: DOMRect } | null>(null)

  // Recompute when the page's DOM changes.
  useEffect(() => {
    const el = articleRef.current
    if (!el) return
    let t: ReturnType<typeof setTimeout> | undefined
    const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => setTick((n) => n + 1), 60) })
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    const onResize = () => setTick((n) => n + 1)
    window.addEventListener('resize', onResize)
    return () => { mo.disconnect(); clearTimeout(t); window.removeEventListener('resize', onResize) }
  }, [articleRef])

  // Find each mark in the page and draw it.
  useLayoutEffect(() => {
    const article = articleRef.current
    if (!article) return
    const map = new Map<string, Range>()
    for (const m of marks) {
      if (!m.anchor) continue
      const root = article.querySelector<HTMLElement>(`[data-block="${m.block}"]`)
      if (!root) continue
      const loc = locate(textOf(root), m.anchor)
      const r = loc && rangeAt(root, loc.start, loc.end)
      if (r) map.set(m.id, r)
    }
    setRanges(map)
    if (canHighlight) {
      for (const c of COLORS) CSS.highlights.set(`mneme-${c}`, new Highlight(...marks.filter((m) => m.kind === 'highlight' && (m.color ?? 'yellow') === c && map.has(m.id)).map((m) => map.get(m.id)!)))
      CSS.highlights.set('mneme-note', new Highlight(...marks.filter((m) => m.kind === 'note' && map.has(m.id)).map((m) => map.get(m.id)!)))
    }
    const base = article.getBoundingClientRect().top
    setGutter(marks.filter((m) => m.kind !== 'highlight').flatMap((m) => {
      const r = map.get(m.id)?.getBoundingClientRect() ?? article.querySelector(`[data-block="${m.block}"]`)?.getBoundingClientRect()
      return r && r.height ? [{ id: m.id, top: r.top - base, kind: m.kind }] : []
    }))
  }, [marks, tick, layoutKey, articleRef])
  useEffect(() => () => { if (canHighlight) { for (const c of COLORS) CSS.highlights.delete(`mneme-${c}`); CSS.highlights.delete('mneme-note') } }, [])

  // Show the toolbar when text is selected inside the page.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const onChange = () => {
      clearTimeout(t)
      t = setTimeout(() => { const a = articleRef.current; setSel(a ? readSelection(a) : null) }, 180)
    }
    document.addEventListener('selectionchange', onChange)
    return () => { document.removeEventListener('selectionchange', onChange); clearTimeout(t) }
  }, [articleRef])

  const hitMark = useCallback((x: number, y: number) => {
    for (const m of marks) { const r = ranges.get(m.id); if (r && [...r.getClientRects()].some((c) => inRect(c, x, y))) return m }
    return null
  }, [marks, ranges])

  // Click on a highlight or annotation: show it.
  useEffect(() => {
    const el = articleRef.current
    if (!el) return
    const onClick = (e: MouseEvent) => {
      if (!window.getSelection()?.isCollapsed) return
      if ((e.target as Element).closest('button, a, input, select, textarea, .kterm')) return
      const m = hitMark(e.clientX, e.clientY)
      if (m) setPop({ kind: 'mark', id: m.id, rect: ranges.get(m.id)!.getBoundingClientRect() })
    }
    // Hovering an annotation shows it; leaving hides it (a click pins it, above).
    let raf = 0
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const m = hitMark(e.clientX, e.clientY)
        setHover((h) => (m?.kind === 'note' ? (h?.id === m.id ? h : { id: m.id, rect: ranges.get(m.id)!.getBoundingClientRect() }) : null))
      })
    }
    const onLeave = () => { cancelAnimationFrame(raf); setHover(null) }
    el.addEventListener('click', onClick)
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => { el.removeEventListener('click', onClick); el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave); cancelAnimationFrame(raf) }
  }, [articleRef, hitMark, ranges])

  const clearSelection = () => { window.getSelection()?.removeAllRanges(); setSel(null) }
  const highlight = async (s: Sel, color: MarkColor = lastColor()) => {
    try { localStorage.setItem(LAST, color) } catch { /* private mode */ }
    await notesRepo.addMark({ noteId, kind: 'highlight', block: s.block, anchor: s.anchor, color })
    clearSelection()
  }
  /** Highlights in the selection's block whose text overlaps the selection. */
  const overlapping = (s: Sel) => {
    const article = articleRef.current
    const root = article?.querySelector<HTMLElement>(`[data-block="${s.block}"]`)
    if (!root) return []
    const text = textOf(root)
    const a = s.anchor.offset, z = s.anchor.offset + s.anchor.quote.length
    return marks.filter((m) => {
      if (m.kind !== 'highlight' || m.block !== s.block || !m.anchor) return false
      const loc = locate(text, m.anchor)
      return !!loc && loc.start < z && loc.end > a
    })
  }
  const overlapsHighlight = (s: Sel) => overlapping(s).length > 0
  const erase = async (s: Sel) => {
    const hit = overlapping(s)
    for (const m of hit) await notesRepo.deleteMark(m.id)
    clearSelection()
    if (hit.length) toast(hit.length === 1 ? 'Highlight removed' : `${hit.length} highlights removed`)
  }
  const bookmark = async (s: Sel | { block: number }) => {
    await notesRepo.addMark({ noteId, kind: 'bookmark', block: s.block, ...('anchor' in s ? { anchor: s.anchor } : {}) })
    clearSelection()
    toast('Bookmarked', 'It’s in the contents, under Bookmarks', 'bookmark')
  }
  const compose = (s: Sel) => { setPop({ kind: 'compose', rect: s.rect, draft: s, text: '' }); setSel(null) }

  // Right-click on the page.
  useContextItems((e, { target }) => {
    const article = articleRef.current
    if (!article || !article.contains(target) || target.closest('input, textarea')) return null
    const s = readSelection(article)
    const items: MenuItem[] = []
    if (s) {
      items.push({ key: 'colors', custom: (close) => <ColorRow onPick={(c) => { close(); void highlight(s, c) }} onErase={() => { close(); void erase(s) }} canErase={overlapsHighlight(s)} label="Highlight" /> })
      items.push({ label: 'Add a note', icon: 'comment', onSelect: () => compose(s) })
      items.push({ label: 'Bookmark this', icon: 'bookmark', onSelect: () => bookmark(s) })
      items.push({ label: 'Explain with Gemini', icon: 'spark', disabled: true, hint: 'Coming with AI: add a Gemini key in Settings', onSelect: () => {} })
      return items
    }
    const hit = hitMark(e.clientX, e.clientY)
    if (hit) {
      if (hit.kind === 'note') items.push({ label: 'Edit note', icon: 'edit', onSelect: () => setPop({ kind: 'compose', rect: ranges.get(hit.id)!.getBoundingClientRect(), draft: { markId: hit.id }, text: hit.text ?? '' }) })
      if (hit.kind === 'highlight') items.push({ key: 'recolor', custom: (close) => <ColorRow current={hit.color} onPick={(c) => { close(); void notesRepo.updateMark(hit.id, { color: c }) }} label="Colour" /> })
      items.push({ label: hit.kind === 'highlight' ? 'Remove highlight' : hit.kind === 'note' ? 'Delete note' : 'Remove bookmark', icon: 'trash', danger: true, onSelect: () => notesRepo.deleteMark(hit.id) })
      return items
    }
    const block = target.closest<HTMLElement>('[data-block]')
    if (block) items.push({ label: 'Bookmark this spot', icon: 'bookmark', onSelect: () => bookmark({ block: Number(block.dataset.block) }) })
    items.push({ label: 'Find on this page', icon: 'search', kbd: 'Ctrl F', onSelect: () => setFinding(true) })
    return items
  })

  const popMark = pop?.kind === 'mark' ? marks.find((m) => m.id === pop.id) : undefined

  return (
    <>
      {gutter.map((g) => (
        <button key={g.id} className={`mark-pin ${g.kind}`} style={{ top: g.top }} aria-label={g.kind === 'note' ? 'Show note' : 'Bookmark'}
          onClick={(e) => {
            const m = marks.find((x) => x.id === g.id)
            if (!m) return
            const r = ranges.get(m.id)?.getBoundingClientRect() ?? (e.currentTarget as HTMLElement).getBoundingClientRect()
            setPop({ kind: 'mark', id: m.id, rect: r })
          }}>
          <Icon name={g.kind === 'note' ? 'comment' : 'bookmark'} size={13} />
        </button>
      ))}

      {sel && !pop && (
        <Floating rect={sel.rect} className="selbar" above>
          <ColorRow onPick={(c) => highlight(sel, c)} onErase={() => erase(sel)} canErase={overlapsHighlight(sel)} />
          <span className="selbar-sep" />
          <button className="selbar-btn" onClick={() => compose(sel)} title="Add a note"><Icon name="comment" size={15} /><span>Note</span></button>
          <button className="selbar-btn" onClick={() => bookmark(sel)} title="Bookmark"><Icon name="bookmark" size={15} /></button>
          <button className="selbar-btn" onClick={async () => { await navigator.clipboard.writeText(sel.anchor.quote).catch(() => {}); toast('Copied') }} title="Copy"><Icon name="copy" size={15} /></button>
        </Floating>
      )}

      {pop?.kind === 'mark' && popMark && (
        <Floating rect={pop.rect} className="markpop" onClose={() => setPop(null)}>
          {popMark.kind === 'note' && <div className="markpop-text">{popMark.text}</div>}
          {popMark.kind === 'bookmark' && <div className="markpop-text muted">{popMark.anchor ? `“${popMark.anchor.quote.slice(0, 120)}”` : 'Bookmarked spot'}</div>}
          <div className="markpop-actions">
            {popMark.kind === 'highlight' && <ColorRow current={popMark.color} onPick={(c) => { void notesRepo.updateMark(popMark.id, { color: c }); setPop(null) }} />}
            {popMark.kind === 'highlight' && popMark.anchor && <button className="btn sm" onClick={() => setPop({ kind: 'compose', rect: pop.rect, draft: { block: popMark.block, anchor: popMark.anchor!, rect: pop.rect }, text: '' })}><Icon name="comment" />Add a note</button>}
            {popMark.kind === 'note' && <button className="btn sm" onClick={() => setPop({ kind: 'compose', rect: pop.rect, draft: { markId: popMark.id }, text: popMark.text ?? '' })}><Icon name="edit" />Edit</button>}
            <button className="btn sm ghost danger" onClick={() => { void notesRepo.deleteMark(popMark.id); setPop(null) }}><Icon name="trash" />{popMark.kind === 'highlight' ? 'Remove' : 'Delete'}</button>
          </div>
        </Floating>
      )}

      {pop?.kind === 'compose' && (
        <Floating rect={pop.rect} className="markpop compose" onClose={() => setPop(null)}>
          <NoteComposer initial={pop.text} onCancel={() => setPop(null)} onSave={async (text) => {
            if ('markId' in pop.draft) await notesRepo.updateMark(pop.draft.markId, { text })
            else await notesRepo.addMark({ noteId, kind: 'note', block: pop.draft.block, anchor: pop.draft.anchor, text })
            setPop(null); clearSelection()
          }} />
        </Floating>
      )}

      {hover && !pop && (() => {
        const m = marks.find((x) => x.id === hover.id)
        if (!m?.text) return null
        const short = m.text.length <= 80 && !m.text.includes('\n')
        return <Floating rect={hover.rect} className={short ? 'notehint short' : 'notehint'}>{m.text}</Floating>
      })()}

      {finding && <FindBar key={findQuery} initial={findQuery} articleRef={articleRef} onClose={() => setFinding(false)} layoutKey={tick} />}
      <KeyTermTip articleRef={articleRef} terms={terms} />
    </>
  )
}

function ColorRow({ onPick, current, label, onErase, canErase = true }: { onPick: (c: MarkColor) => void; current?: MarkColor; label?: string; onErase?: () => void; canErase?: boolean }) {
  return (
    <div className="colorrow" role="group" aria-label={label ?? 'Highlight colour'}>
      {label && <span className="cr-label"><Icon name="highlight" size={15} />{label}</span>}
      {COLORS.map((c) => (
        <button key={c} className={`swatch ${c} ${current === c ? 'on' : ''}`} aria-label={`${label ?? 'Highlight'} ${COLOR_NAME[c]}`} title={COLOR_NAME[c]} onClick={() => onPick(c)} />
      ))}
      {onErase && (
        <button className="swatch erase" aria-label="Remove highlighting in the selection" title={canErase ? 'Remove highlighting' : 'Nothing highlighted here'} disabled={!canErase} onClick={onErase}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M6 18L18 6" /></svg>
        </button>
      )}
    </div>
  )
}

function NoteComposer({ initial, onSave, onCancel }: { initial: string; onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial)
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) onSave(text.trim()) }}>
      <textarea className="textarea" autoFocus value={text} maxLength={2000} placeholder="Your note about this…" onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (text.trim()) onSave(text.trim()) } if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }} />
      <div className="markpop-actions">
        <span className="muted small">Ctrl+Enter to save</span>
        <button type="button" className="btn sm ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn sm primary" disabled={!text.trim()}>Save note</button>
      </div>
    </form>
  )
}

/** A small panel pinned next to a rectangle on screen, kept inside the window. */
function Floating({ rect, children, className, above, onClose }: { rect: DOMRect; children: React.ReactNode; className: string; above?: boolean; onClose?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth, h = el.offsetHeight
    const left = Math.min(innerWidth - w - 8, Math.max(8, rect.left + rect.width / 2 - w / 2))
    const top = above && rect.top - h - 10 > 8 ? rect.top - h - 10 : Math.min(innerHeight - h - 8, rect.bottom + 10)
    setPos({ left, top })
  }, [rect, above])
  useEffect(() => {
    if (!onClose) return
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    const t = setTimeout(() => document.addEventListener('pointerdown', away), 0)
    window.addEventListener('keydown', esc, true)
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc, true) }
  }, [onClose])
  return createPortal(
    <div ref={ref} className={`floating ${className}`} style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: 0, top: 0 }}
      onMouseDown={(e) => { if (className.includes('selbar')) e.preventDefault() /* keep the text selected */ }}>
      {children}
    </div>,
    document.body,
  )
}

// ---------- find on the page ----------

function FindBar({ articleRef, onClose, layoutKey, initial = '' }: { articleRef: RefObject<HTMLElement | null>; onClose: () => void; layoutKey: unknown; initial?: string }) {
  const [q, setQ] = useState(initial)
  const [i, setI] = useState(0)
  const [hits, setHits] = useState<Range[]>([])
  useLayoutEffect(() => {
    const article = articleRef.current
    const needle = q.trim().toLowerCase()
    if (!article || needle.length < 2) { setHits([]); return }
    const out: Range[] = []
    for (const root of article.querySelectorAll<HTMLElement>('[data-block]')) {
      const text = textOf(root).toLowerCase()
      for (let at = text.indexOf(needle); at !== -1 && out.length < 500; at = text.indexOf(needle, at + needle.length)) {
        const r = rangeAt(root, at, at + needle.length)
        if (r) out.push(r)
      }
    }
    setHits(out)
  }, [q, layoutKey, articleRef])
  const cur = hits.length ? ((i % hits.length) + hits.length) % hits.length : -1
  useEffect(() => {
    if (!canHighlight) return
    CSS.highlights.set('mneme-find', new Highlight(...hits))
    CSS.highlights.set('mneme-find-now', new Highlight(...(cur >= 0 ? [hits[cur]] : [])))
    if (cur >= 0) {
      const r = hits[cur].getBoundingClientRect()
      if (r.top < 90 || r.bottom > innerHeight - 40) window.scrollBy({ top: r.top - innerHeight / 3, behavior: 'auto' })
    }
    return () => { CSS.highlights.delete('mneme-find'); CSS.highlights.delete('mneme-find-now') }
  }, [hits, cur])
  return (
    <div className="findbar" role="search">
      <Icon name="search" size={15} />
      <input className="input" autoFocus placeholder="Find on this page" value={q} onChange={(e) => { setQ(e.target.value); setI(0) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); setI((n) => n + (e.shiftKey ? -1 : 1)) }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
        }} />
      <span className="muted small count">{q.trim().length < 2 ? '' : hits.length ? `${cur + 1} of ${hits.length}` : 'No matches'}</span>
      <button className="iconbtn" aria-label="Previous match" disabled={!hits.length} onClick={() => setI((n) => n - 1)}><Icon name="chev" className="up" /></button>
      <button className="iconbtn" aria-label="Next match" disabled={!hits.length} onClick={() => setI((n) => n + 1)}><Icon name="chev" className="down" /></button>
      <button className="iconbtn" aria-label="Close find" onClick={onClose}><Icon name="x" /></button>
    </div>
  )
}

// ---------- key-term tips ----------

function KeyTermTip({ articleRef, terms }: { articleRef: RefObject<HTMLElement | null>; terms: KeyTerm[] }) {
  const [tip, setTip] = useState<{ term: KeyTerm; rect: DOMRect; pinned: boolean } | null>(null)
  const byName = useMemo(() => new Map(terms.map((t) => [t.term.toLowerCase(), t])), [terms])
  useEffect(() => {
    const el = articleRef.current
    if (!el || !terms.length) return
    const find = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>('.kterm') : null)
    const show = (k: HTMLElement, pinned: boolean) => {
      const term = byName.get((k.dataset.term ?? '').toLowerCase())
      if (term) setTip({ term, rect: k.getBoundingClientRect(), pinned })
    }
    const over = (e: Event) => { const k = find(e.target); if (k) show(k, false) }
    const out = (e: Event) => { if (find(e.target)) setTip((t) => (t?.pinned ? t : null)) }
    const click = (e: Event) => { const k = find(e.target); if (k) { e.preventDefault(); show(k, true) } }
    el.addEventListener('mouseover', over)
    el.addEventListener('mouseout', out)
    el.addEventListener('focusin', over)
    el.addEventListener('focusout', out)
    el.addEventListener('click', click)
    return () => {
      el.removeEventListener('mouseover', over); el.removeEventListener('mouseout', out)
      el.removeEventListener('focusin', over); el.removeEventListener('focusout', out); el.removeEventListener('click', click)
    }
  }, [articleRef, byName, terms.length])
  if (!tip) return null
  return (
    <Floating rect={tip.rect} className="ktip" onClose={tip.pinned ? () => setTip(null) : undefined}>
      <b>{tip.term.term}</b>
      <span>{tip.term.definition.replace(/\$\$([^$]+)\$\$/g, '$1')}</span>
    </Floating>
  )
}
