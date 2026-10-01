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
  const [picker, setPicker] = useState(false)
  const progress = notesRepo.readingProgress(note)
  const sections = useMemo(() => note.blocks.flatMap((b, i) => (b.type === 'section' ? [{ i, title: b.title }] : b.type === 'quickref' ? [{ i, title: b.title ?? 'Quick reference' }] : [])), [note.blocks])
  const hasSections = note.blocks.some((b) => b.type === 'section')
  const [current, setCurrent] = useState<number | null>(null)

  const hooks = useMemo<NotesHooks>(() => ({
    reached: (i) => { if (hasSections ? note.blocks[i]?.type === 'section' : i === 0) void notesRepo.markRead(note.id, i) },
    answered: async (key, correct, ms) => {
      const deckId = await notesRepo.deckForQuestion(note.id, key)
      if (deckId) await repo.recordAnswer({ deckId, key, correct, ms, mode: 'learn', rating: correct ? Rating.Good : Rating.Again })
    },
  }), [note.id, note.blocks, hasSections])

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
  }, [note.blocks])
  const jump = (i: number) => document.getElementById(`b-${i}`)?.scrollIntoView({ behavior: document.documentElement.dataset.motion === 'reduced' ? 'auto' : 'smooth', block: 'start' })

  const path: Folder[] = []
  for (let f = folders.find((x) => x.id === note.folderId); f; f = folders.find((x) => x.id === f!.parentId)) path.unshift(f)
  const read = new Set(note.read ?? [])
  const activeSection = current !== null ? [...sections].reverse().find((s) => s.i <= current)?.i ?? null : null

  return (
    <>
      <TopBar crumbs={<>{path.length ? path.map((f) => <span key={f.id}><Link to={`/folder/${f.id}`}>{f.name}</Link> / </span>) : <><Link to="/">Library</Link> / </>}<b>{note.title}</b></>}>
        {decks.length > 0 && <StudyButton noteId={note.id} decks={decks} />}
      </TopBar>
      <div className="page notes-page">
        <nav className="toc" aria-label="Contents">
          <div className="toc-h">Contents{hasSections ? ` · ${progress.read} of ${progress.total} read` : ''}</div>
          {sections.map((s) => (
            <button key={s.i} className={`toc-row ${activeSection === s.i ? 'on' : ''}`} onClick={() => jump(s.i)}>
              <span className={`tick ${read.has(s.i) || note.blocks[s.i].type === 'quickref' ? 'done' : ''}`} aria-label={read.has(s.i) ? 'Read' : undefined}>{(read.has(s.i)) && <Icon name="check" size={11} />}</span>
              <span className="t">{s.title}</span>
            </button>
          ))}
          {!sections.length && <div className="muted small">One page, no sections.</div>}
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
            {note.summary && <p className="notes-summary">{note.summary}</p>}
            {hasSections && <div className="readbar" aria-label={`${progress.read} of ${progress.total} sections read`}><i style={{ width: `${(progress.read / progress.total) * 100}%` }} /></div>}
          </header>

          {sections.length > 1 && (
            <label className="toc-mobile">
              <span className="muted small">{activeSection !== null ? `${sections.findIndex((s) => s.i === activeSection) + 1} of ${sections.length}` : 'Jump to'}</span>
              <select className="select" value={activeSection ?? ''} onChange={(e) => jump(Number(e.target.value))} aria-label="Jump to a section">
                {activeSection === null && <option value="">Contents</option>}
                {sections.map((s) => <option key={s.i} value={s.i}>{s.title}{read.has(s.i) ? '  ✓' : ''}</option>)}
              </select>
            </label>
          )}

          <NotesHooksCtx.Provider value={hooks}>
            {note.blocks.map((b, i) => (
              <div key={i} id={`b-${i}`} data-block={i} className={`nblock nb-${b.type}`}>
                <BlockIndexCtx.Provider value={i}><BlockView b={b} /></BlockIndexCtx.Provider>
              </div>
            ))}
            {!hasSections && <BlockIndexCtx.Provider value={0}><EndMarker /></BlockIndexCtx.Provider>}
          </NotesHooksCtx.Provider>

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
  const [open, setOpen] = useState(false)
  const from = `from=${encodeURIComponent(`/notes/${noteId}`)}`
  if (decks.length === 1) return <Link className="btn sm primary" to={`/deck/${decks[0].id}/learn?${from}`}><Icon name="cards" />Study the deck</Link>
  return (
    <div className="menu-wrap">
      <button className="btn sm primary" onClick={() => setOpen(!open)} aria-expanded={open}><Icon name="cards" />Study a deck<Icon name="down2" size={12} /></button>
      {open && (
        <div className="menu" role="menu" onMouseLeave={() => setOpen(false)}>
          {decks.map((d) => <Link key={d.id} role="menuitem" to={`/deck/${d.id}/learn?${from}`}>{d.title}</Link>)}
        </div>
      )}
    </div>
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
