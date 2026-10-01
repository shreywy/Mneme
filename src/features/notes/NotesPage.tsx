import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Rating } from 'ts-fsrs'
import { TopBar } from '../../app/Shell'
import { db, type DeckRow, type Folder, type NoteRow } from '../../data/db'
import * as notesRepo from '../../data/notes'
import * as repo from '../../data/repo'
import { allDeckMastery, plural } from '../../data/stats'
import { Icon } from '../../ui/Icons'
import { confirmAction } from '../../ui/confirm'
import { toast } from '../../ui/toasts'
import { FolderSelect } from '../library/FolderSelect'
import { BlockIndexCtx, BlockView, EndMarker, NotesHooksCtx, type NotesHooks } from './blocks'
import { LinkPicker } from './LinkPicker'
import { ReadingTools } from './ReadingTools'
import { DropMenu } from '../../ui/DropMenu'
import { notesToFile } from '../../notes-format/export'
import { downloadJson } from '../../deck-format/export'
import { useSettings } from '../../settings/store'
import { KeyTermsCtx, type KeyTerm } from '../../content/keyterms'
import type { Block } from '../../notes-format/types'

/** Key terms the page defines (keyterms blocks), plus the terms of its linked decks. Page terms win. */
function collectTerms(blocks: Block[], deckTerms: KeyTerm[]): KeyTerm[] {
  const out = new Map<string, KeyTerm>()
  const walk = (bs: Block[]) => bs.forEach((b) => {
    if (b.type === 'keyterms') b.items.forEach((t) => out.set(t.term.toLowerCase(), t))
    if (b.type === 'section' || b.type === 'quickref') walk(b.blocks)
  })
  walk(blocks)
  for (const t of deckTerms) if (!out.has(t.term.toLowerCase()) && t.term.length >= 3) out.set(t.term.toLowerCase(), t)
  return [...out.values()]
}

export function NotesPage() {
  const { noteId = '' } = useParams()
  const note = useLiveQuery(() => db.notes.get(noteId), [noteId])
  const decks = useLiveQuery(() => notesRepo.decksForNote(noteId), [noteId])
  const folders = useLiveQuery(() => db.folders.toArray(), [])
  useEffect(() => { if (noteId) void notesRepo.updateNote(noteId, { lastOpenedAt: Date.now() }) }, [noteId])
  if (note === undefined || !decks || !folders) return null
  if (!note) return <div className="page"><h1 className="title">Notes not found</h1><p className="empty-note" style={{ marginTop: 12 }}>They may have been deleted. <Link to="/">Back to the library</Link></p></div>
  return <NotesView key={note.id} note={note} decks={decks} folders={folders} />
}

function NotesView({ note, decks, folders }: { note: NoteRow; decks: DeckRow[]; folders: Folder[] }) {
  const nav = useNavigate()
  const [picker, setPicker] = useState(false)
  const progress = notesRepo.readingProgress(note)
  const sections = useMemo(() => note.blocks.flatMap((b, i) => (b.type === 'section' ? [{ i, title: b.title }] : b.type === 'quickref' ? [{ i, title: b.title ?? 'Quick reference' }] : [])), [note.blocks])
  const hasSections = note.blocks.some((b) => b.type === 'section')
  const [current, setCurrent] = useState<number | null>(null)
  const [finding, setFinding] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [tocQuery, setTocQuery] = useState('')

  // Notes made of parts (one per chapter) show one chapter at a time, each with its own contents.
  const chapters = useMemo(() => {
    const starts = note.blocks.flatMap((b, i) => (b.type === 'part' ? [i] : []))
    return starts.map((start, k) => {
      const b = note.blocks[start] as Extract<Block, { type: 'part' }>
      return { start: k === 0 ? 0 : start, end: starts[k + 1] ?? note.blocks.length, title: b.title, summary: b.summary }
    })
  }, [note.blocks])
  const CH_KEY = `mneme.notes.chapter.${note.id}`
  const [ch, setChState] = useState<number>(() => { try { const v = Number(localStorage.getItem(CH_KEY)); return Number.isInteger(v) && v >= -1 ? v : 0 } catch { return 0 } })
  const chapter = chapters.length ? (ch === -1 ? -1 : Math.min(ch, chapters.length - 1)) : -1
  const setCh = (v: number) => { setChState(v); try { localStorage.setItem(CH_KEY, String(v)) } catch { /* private mode */ } ; window.scrollTo({ top: 0 }) }
  const chapterOf = (i: number) => Math.max(0, chapters.findIndex((c) => i >= c.start && i < c.end))
  const shown = (i: number) => chapter === -1 || (i >= chapters[chapter].start && i < chapters[chapter].end)
  const [pendingJump, setPendingJump] = useState<number | null>(null)
  const marks = useLiveQuery(() => notesRepo.marksFor(note.id), [note.id]) ?? []
  const deckTerms = useLiveQuery(async () => {
    const ids = decks.map((d) => d.id)
    if (!ids.length) return []
    const items = await db.items.where('deckId').anyOf(ids).toArray()
    return items.flatMap((it) => (it.kind === 'term' ? [{ term: it.term, definition: it.definition }] : []))
  }, [decks.map((d) => d.id).join()]) ?? []
  const terms = useMemo(() => collectTerms(note.blocks, deckTerms), [note.blocks, deckTerms])
  const bookmarks = marks.filter((m) => m.kind === 'bookmark').sort((a, b) => a.block - b.block || (a.anchor?.offset ?? 0) - (b.anchor?.offset ?? 0))
  // Ctrl+F opens Mneme's find bar on a notes page (it can see inside folded sections).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !e.shiftKey && !e.altKey) { e.preventDefault(); setFinding(true) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const [openSignal, setOpenSignal] = useState<{ index: number; n: number }>()
  const [printing, setPrinting] = useState(false)
  const showContents = useSettings((s) => s.notesContents)
  const setSettings = useSettings((s) => s.set)
  const hooks = useMemo<NotesHooks>(() => ({
    openSignal,
    reached: (i) => { if (hasSections ? note.blocks[i]?.type === 'section' : i === 0) void notesRepo.markRead(note.id, i) },
    answered: async (key, correct, ms) => {
      const deckId = await notesRepo.deckForQuestion(note.id, key)
      if (deckId) await repo.recordAnswer({ deckId, key, correct, ms, mode: 'learn', rating: correct ? Rating.Good : Rating.Again })
    },
  }), [note.id, note.blocks, hasSections, openSignal])

  // Which section is on screen, for the contents rail and the phone dropdown.
  const articleRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const els = articleRef.current?.querySelectorAll<HTMLElement>('[data-block]')
    if (!els?.length) return
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).dataset.block))
      if (vis.length) setCurrent(Math.min(...vis))
    }, { rootMargin: '-80px 0px -60% 0px' })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [note.blocks, chapter])
  // Open a folded section before scrolling to it, so the page (and "where am I") settle on the right place.
  const jump = (i: number) => {
    if (!shown(i)) { setChState(chapterOf(i)); try { localStorage.setItem(CH_KEY, String(chapterOf(i))) } catch { /* private mode */ } setPendingJump(i); return }
    setOpenSignal({ index: i, n: Date.now() })
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`b-${i}`)?.scrollIntoView({ behavior: document.documentElement.dataset.motion === 'reduced' ? 'auto' : 'smooth', block: 'start' })))
  }
  useEffect(() => { if (pendingJump !== null && shown(pendingJump)) { const i = pendingJump; setPendingJump(null); jump(i) } }) // eslint-disable-line react-hooks/exhaustive-deps
  const print = () => {
    setPrinting(true)
    const done = () => { setPrinting(false); window.removeEventListener('afterprint', done) }
    window.addEventListener('afterprint', done)
    setTimeout(() => window.print(), 150) // let every section open first
  }
  const exportFile = () => downloadJson(`${note.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'notes'}.mneme.json`, notesToFile(note))

  const path: Folder[] = []
  for (let f = folders.find((x) => x.id === note.folderId); f; f = folders.find((x) => x.id === f!.parentId)) path.unshift(f)
  const read = new Set(note.read ?? [])
  const chapterProgress = (c: { start: number; end: number }) => {
    const secs = note.blocks.slice(c.start, c.end).flatMap((b, k) => (b.type === 'section' ? [c.start + k] : []))
    return { read: secs.filter((i) => read.has(i)).length, total: secs.length }
  }
  // Search every chapter's sections (titles and text) from the contents rail.
  const tocNeedle = tocQuery.trim().toLowerCase()
  const tocHits = tocNeedle.length < 2 ? [] : note.blocks.flatMap((b, i) => {
    if (b.type !== 'section' && b.type !== 'quickref') return []
    const title = b.type === 'section' ? b.title : b.title ?? 'Quick reference'
    const text = notesRepo.plainText(b.blocks)
    const at = text.toLowerCase().indexOf(tocNeedle)
    if (!title.toLowerCase().includes(tocNeedle) && at < 0) return []
    const snippet = at < 0 ? '' : `${at > 30 ? '…' : ''}${text.slice(Math.max(0, at - 30), at + tocNeedle.length + 50)}…`
    return [{ i, title, snippet, chapter: chapters.length ? chapters[chapterOf(i)].title : '' }]
  })
  // The section on screen; above the first section (a chapter heading), that's the first section.
  const activeSection = current !== null ? [...sections].reverse().find((s) => s.i <= current && shown(s.i))?.i ?? sections.find((s) => shown(s.i))?.i ?? null : null

  return (
    <>
      <TopBar crumbs={<>{path.length ? path.map((f) => <span key={f.id}><Link to={`/folder/${f.id}`}>{f.name}</Link> / </span>) : <><Link to="/">Library</Link> / </>}<b>{note.title}</b></>}>
        <button className={`btn sm ghost toc-toggle ${showContents ? 'on' : ''}`} onClick={() => setSettings({ notesContents: !showContents })} aria-pressed={showContents} title={showContents ? 'Hide the contents' : 'Show the contents'}><Icon name="list" /><span className="hide-sm">Contents</span></button>
        <PageMenu onCheat={() => nav(`/cheatsheet?n=${note.id}${decks.length ? `&d=${decks.map((d) => d.id).join(',')}` : ''}`)} onExport={exportFile} onPrint={print} onUnread={() => notesRepo.updateNote(note.id, { read: [] })}
          onReset={async () => {
            if (!await confirmAction({ title: 'Remove all highlights and notes?', body: 'Every highlight and annotation on this page is deleted, on all your devices. Bookmarks stay.', confirm: 'Remove them', danger: true })) return
            const n = await notesRepo.clearMarks(note.id)
            toast(n ? `Removed ${plural(n, 'highlight or note', 'highlights and notes')}` : 'Nothing to remove')
          }} />
        {decks.length > 0 && <StudyButton noteId={note.id} decks={decks} />}
      </TopBar>
      <div className={`page notes-page ${showContents ? '' : 'no-toc'} ${printing ? 'printing' : ''}`}>
        <nav className="toc" aria-label="Contents">
          <div className="toc-search searchbar"><Icon name="search" /><input className="input" value={tocQuery} onChange={(e) => setTocQuery(e.target.value)} placeholder={chapters.length ? 'Search all chapters' : 'Search this page'} aria-label="Search this page" /></div>
          {tocNeedle.length >= 2 ? (
            <div className="toc-results">
              {tocHits.length === 0 && <div className="muted small" style={{ padding: '4px 10px' }}>Nothing matches.</div>}
              {tocHits.map((h) => (
                <button key={h.i} className="toc-hit" onClick={() => { setFindQuery(tocQuery.trim()); setFinding(true); jump(h.i) }}>
                  {h.chapter && <span className="muted small">{h.chapter}</span>}
                  <b>{h.title}</b>
                  {h.snippet && <span className="snip">{h.snippet}</span>}
                </button>
              ))}
            </div>
          ) : <>
          {chapters.length > 0 && (
            <div className="toc-chapters">
              {chapters.map((c, k) => { const pr = chapterProgress(c); return (
                <button key={k} className={`toc-ch ${chapter === k ? 'on' : ''}`} onClick={() => setCh(k)}>
                  <span className="t">{c.title}</span><span className="n">{pr.read}/{pr.total}</span>
                </button>
              ) })}
              <button className={`toc-ch all ${chapter === -1 ? 'on' : ''}`} onClick={() => setCh(-1)}><span className="t">All chapters</span><span className="n">{progress.read}/{progress.total}</span></button>
            </div>
          )}
          <div className="toc-h">{chapter >= 0 ? chapters[chapter].title : 'Contents'}{hasSections ? ` · ${(chapter >= 0 ? chapterProgress(chapters[chapter]) : progress).read} of ${(chapter >= 0 ? chapterProgress(chapters[chapter]) : progress).total} read` : ''}</div>
          {note.blocks.map((blk, i) => {
            if (!shown(i)) return null
            if (blk.type === 'part') return chapter === -1 ? <div key={i} className="toc-part">{blk.title}</div> : null
            if (blk.type !== 'section' && blk.type !== 'quickref') return null
            const isRead = read.has(i)
            const here = activeSection === i
            return (
              <div key={i} className={`toc-row ${here ? 'on' : ''}`} aria-current={here ? 'location' : undefined}>
                {blk.type === 'section'
                  ? <button className={`tick ${isRead ? 'done' : ''}`} aria-pressed={isRead} aria-label={isRead ? `Mark "${blk.title}" unread` : `Mark "${blk.title}" read`} title={isRead ? 'Read. Click to mark unread' : 'Mark as read'}
                      onClick={() => notesRepo.setRead(note.id, i, !isRead)}>{isRead && <Icon name="check" size={11} />}</button>
                  : <span className="tick pin" aria-hidden="true"><Icon name="pin" size={11} /></span>}
                <button className="t" onClick={() => jump(i)}>{blk.type === 'section' ? blk.title : blk.title ?? 'Quick reference'}</button>
                {here && <span className="eye" title="On screen now"><Icon name="eye" size={13} /></span>}
              </div>
            )
          })}
          </>}
          {!sections.length && !tocNeedle && <div className="muted small">One page, no sections.</div>}
          {bookmarks.length > 0 && (
            <>
              <div className="toc-h" style={{ marginTop: 16 }}>Bookmarks</div>
              {bookmarks.map((m) => (
                <div key={m.id} className="toc-bm">
                  <button className="toc-row" onClick={() => jump(m.block)} title={m.anchor?.quote}>
                    <Icon name="bookmark" size={13} />
                    <span className="t">{m.text || (m.anchor ? `“${m.anchor.quote.slice(0, 48)}${m.anchor.quote.length > 48 ? '…' : ''}”` : sections.slice().reverse().find((s) => s.i <= m.block)?.title ?? 'Top of the page')}</span>
                  </button>
                  <button className="iconbtn" aria-label="Remove bookmark" onClick={() => notesRepo.deleteMark(m.id)}><Icon name="x" size={12} /></button>
                </div>
              ))}
            </>
          )}
        </nav>

        <article ref={articleRef} className="notes-body">
          <header className="notes-head">
            <span className="kind"><Icon name="notes" size={13} />Notes{note.unit ? ` · ${note.unit}` : ''}</span>
            <h1 className="title">{note.title}</h1>
            <div className="meta">
              {hasSections && <span>{plural(progress.total, 'section')}</span>}
              {hasSections && <><i>/</i><span>{progress.read} read</span></>}
              {note.course && <><i>/</i><span>{note.course}</span></>}
            </div>
            {chapters.length > 0 ? (
              <>
                <div className="ch-tabs" role="tablist" aria-label="Chapters">
                  {chapters.map((c, k) => { const pr = chapterProgress(c); return (
                    <button key={k} role="tab" aria-selected={chapter === k} className={`ch-tab ${chapter === k ? 'on' : ''}`} onClick={() => setCh(k)}>
                      {c.title}<span className="n">{pr.read}/{pr.total}</span>
                    </button>
                  ) })}
                  <button role="tab" aria-selected={chapter === -1} className={`ch-tab ${chapter === -1 ? 'on' : ''}`} onClick={() => setCh(-1)}>All</button>
                </div>
                {chapter >= 0
                  ? chapters[chapter].summary && <p className="notes-summary">{chapters[chapter].summary}</p>
                  : <ul className="ch-overview">{chapters.map((c, k) => <li key={k}><button className="linkbtn" onClick={() => setCh(k)}>{c.title}</button>{c.summary && <span className="muted"> {c.summary}</span>}</li>)}</ul>}
              </>
            ) : note.summary && <p className="notes-summary">{note.summary}</p>}
            {hasSections && <div className="readbar" aria-label={`${progress.read} of ${progress.total} sections read`}><i style={{ width: `${(progress.read / progress.total) * 100}%` }} /></div>}
          </header>

          {sections.length > 1 && (
            <label className="toc-mobile">
              {chapters.length > 0 && (
                <select className="select ch-select" value={chapter} onChange={(e) => setCh(Number(e.target.value))} aria-label="Chapter">
                  {chapters.map((c, k) => <option key={k} value={k}>{c.title}</option>)}
                  <option value={-1}>All chapters</option>
                </select>
              )}
              {!chapters.length && <span className="muted small">{activeSection !== null ? `${sections.findIndex((s) => s.i === activeSection) + 1} of ${sections.length}` : 'Jump to'}</span>}
              <select className="select" value={activeSection ?? ''} onChange={(e) => jump(Number(e.target.value))} aria-label="Jump to a section">
                {activeSection === null && <option value="">Contents</option>}
                {sections.filter((s) => shown(s.i)).map((s) => <option key={s.i} value={s.i}>{s.title}{read.has(s.i) ? '  ✓' : ''}</option>)}
                {bookmarks.length > 0 && <optgroup label="Bookmarks">{bookmarks.map((m) => <option key={m.id} value={m.block}>{m.text || m.anchor?.quote.slice(0, 40) || 'Bookmark'}</option>)}</optgroup>}
              </select>
            </label>
          )}

          <NotesHooksCtx.Provider value={hooks}>
            <KeyTermsCtx.Provider value={terms}>
              {note.blocks.map((b, i) => shown(i) && (
                <div key={i} id={`b-${i}`} data-block={i} className={`nblock nbw-${b.type}`}>
                  <BlockIndexCtx.Provider value={i}><BlockView b={b} openAll={finding || printing ? true : null} /></BlockIndexCtx.Provider>
                </div>
              ))}
            </KeyTermsCtx.Provider>
            {!hasSections && <BlockIndexCtx.Provider value={0}><EndMarker /></BlockIndexCtx.Provider>}
          </NotesHooksCtx.Provider>
          {chapter >= 0 && (
            <nav className="ch-nav" aria-label="Chapters">
              {chapter > 0 ? <button className="btn" onClick={() => setCh(chapter - 1)}><Icon name="chev" />{chapters[chapter - 1].title}</button> : <span />}
              {chapter < chapters.length - 1 && <button className="btn primary" onClick={() => setCh(chapter + 1)}>Next: {chapters[chapter + 1].title}<Icon name="chev" className="flip-x" /></button>}
            </nav>
          )}
          <ReadingTools noteId={note.id} articleRef={articleRef} marks={marks} terms={terms} finding={finding} setFinding={(v) => { setFinding(v); if (!v) setFindQuery('') }} findQuery={findQuery} layoutKey={`${chapter}`} />

          <LinkedDecks noteId={note.id} decks={decks} onLink={() => setPicker(true)} />
          <Manage note={note} folders={folders} />
        </article>
      </div>
      {picker && <LinkPicker kind="decks" noteId={note.id} onClose={() => setPicker(false)} />}
    </>
  )
}

/** One linked deck: a straight button. Several: a small menu. Learn returns here when you leave. */
function StudyButton({ noteId, decks }: { noteId: string; decks: DeckRow[] }) {
  const nav = useNavigate()
  const from = `from=${encodeURIComponent(`/notes/${noteId}`)}`
  if (decks.length === 1) return <Link className="btn sm primary" to={`/deck/${decks[0].id}/learn?${from}`}><Icon name="cards" />Study the deck</Link>
  return (
    <DropMenu label="Study a deck" button={({ open, toggle }) => <button className="btn sm primary" onClick={toggle} aria-expanded={open}><Icon name="cards" />Study a deck<Icon name="down2" size={12} /></button>}>
      {(close) => decks.map((d) => <button key={d.id} role="menuitem" onClick={() => { close(); nav(`/deck/${d.id}/learn?${from}`) }}><Icon name="cards" size={15} />{d.title}</button>)}
    </DropMenu>
  )
}

function LinkedDecks({ noteId, decks, onLink }: { noteId: string; decks: DeckRow[]; onLink: () => void }) {
  const mastery = useLiveQuery(() => allDeckMastery(), [])
  const from = `?from=${encodeURIComponent(`/notes/${noteId}`)}`
  return (
    <section className="linked">
      <div className="linked-h"><b>Decks for these notes</b><button className="btn sm ghost" onClick={onLink}><Icon name="plus" />Link</button></div>
      {decks.length === 0 && <p className="muted small">No deck linked. Link one to study it from here; questions on this page then count toward it.</p>}
      {decks.map((d) => {
        const m = mastery?.get(d.id); const total = d.termCount + d.questionCount
        const pct = total && m ? Math.round(((m.familiar + m.mastered) / total) * 100) : 0
        return (
          <div key={d.id} className="linked-row">
            <Icon name="cards" size={14} />
            <Link to={`/deck/${d.id}`} className="t">{d.title}</Link>
            <span className="muted small">{pct}% learned</span>
            <Link className="btn sm" to={`/deck/${d.id}/learn${from}`}>Learn</Link>
            <button className="iconbtn" aria-label={`Unlink ${d.title}`} title="Unlink" onClick={async () => { await notesRepo.unlink(noteId, d.id); toast('Unlinked', d.title) }}><Icon name="x" /></button>
          </div>
        )
      })}
    </section>
  )
}

function Manage({ note, folders }: { note: NoteRow; folders: Folder[] }) {
  const nav = useNavigate()
  const [unit, setUnit] = useState(note.unit ?? '')
  const saveUnit = useCallback(() => { if ((note.unit ?? '') !== unit.trim()) void notesRepo.updateNote(note.id, { unit: unit.trim() || undefined }) }, [note.id, note.unit, unit])
  return (
    <section className="manage">
      <h2>Manage</h2>
      <div className="manage-grid">
        <label className="field"><span>Folder</span><FolderSelect folders={folders} value={note.folderId} onChange={(folderId) => notesRepo.updateNote(note.id, { folderId })} /></label>
        <label className="field"><span>Unit</span><input className="input" value={unit} placeholder="e.g. Chapter 4" onChange={(e) => setUnit(e.target.value)} onBlur={saveUnit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} /></label>
      </div>
      <div className="srow-btns" style={{ marginTop: 14 }}>
        <button className="btn sm" onClick={() => notesRepo.updateNote(note.id, { read: [] })} disabled={!note.read?.length}>Mark all unread</button>
        <button className="btn sm" onClick={async () => { await notesRepo.setNoteArchived(note.id, true); toast('Notes archived', 'Find them under Archive in the sidebar'); nav('/') }}><Icon name="archive" />Archive</button>
        <button className="btn sm ghost danger" onClick={async () => {
          if (!await confirmAction({ title: `Delete "${note.title}"?`, body: 'The notes page and its links are removed. Linked decks stay.', confirm: 'Delete notes', danger: true })) return
          await notesRepo.deleteNote(note.id); toast('Notes deleted'); nav('/')
        }}><Icon name="trash" />Delete</button>
      </div>
    </section>
  )
}

function PageMenu({ onCheat, onExport, onPrint, onUnread, onReset }: { onCheat: () => void; onExport: () => void; onPrint: () => void; onUnread: () => void; onReset: () => void }) {
  return (
    <DropMenu label="More for this page" button={({ open, toggle }) => <button className="btn sm ghost" aria-label="More for this page" aria-expanded={open} onClick={toggle}><Icon name="more" /></button>}>
      {(close) => {
        const item = (label: string, icon: string, fn: () => void, danger = false) => (
          <button role="menuitem" className={danger ? 'danger' : ''} onClick={() => { close(); fn() }}><Icon name={icon} size={15} />{label}</button>
        )
        return <>
          {item('Make a cheat sheet', 'list', onCheat)}
          {item('Export notes file', 'down', onExport)}
          {item('Print or save as PDF', 'copy', onPrint)}
          {item('Mark all sections unread', 'reset', onUnread)}
          {item('Remove highlights and notes…', 'trash', onReset, true)}
        </>
      }}
    </DropMenu>
  )
}
