import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import template from '../../../deck-format/mneme-deck-prompt.md?raw'
import { db, type DeckRow } from '../../data/db'
import { deleteFolder, importDeck, renameFolder } from '../../data/repo'
import { allDeckMastery, plural, relTime, type MasteryCounts } from '../../data/stats'
import { extractPromptExample } from '../../deck-format/example'
import { parseDeckText } from '../../deck-format/parse'
import { TopBar } from '../../app/Shell'
import { useUI } from '../../app/ui'
import { Icon } from '../../ui/Icons'
import { toast } from '../../ui/toasts'

export function LibraryPage() {
  const { folderId } = useParams()
  const open = useUI((s) => s.open)
  const data = useLiveQuery(async () => ({
    folders: await db.folders.orderBy('position').toArray(),
    decks: await db.decks.toArray(),
    mastery: await allDeckMastery(),
  }), [])
  if (!data) return null
  const folder = folderId ? data.folders.find((f) => f.id === folderId) : undefined

  if (data.decks.length === 0 && !folder) return <Empty />

  const sorted = [...data.decks].sort((a, b) => (b.lastStudiedAt ?? b.updatedAt) - (a.lastStudiedAt ?? a.updatedAt))
  const groups = folder
    ? [{ id: folder.id, name: folder.name, decks: sorted.filter((d) => d.folderId === folder.id) }]
    : [
      ...data.folders.map((f) => ({ id: f.id, name: f.name, decks: sorted.filter((d) => d.folderId === f.id) })),
      { id: '', name: 'Not in a folder', decks: sorted.filter((d) => !d.folderId) },
    ].filter((g) => g.decks.length > 0)

  return (
    <>
      <TopBar crumbs={folder ? <><Link to="/">Library</Link> / <b>{folder.name}</b></> : <b>Library</b>}>
        <button className="btn sm" onClick={() => open('prompt')}><Icon name="prompt" />Get the prompt</button>
        <button className="btn sm" onClick={() => open('import')}><Icon name="upload" />Import</button>
      </TopBar>
      <div className="page">
        {folder ? <FolderHeader id={folder.id} name={folder.name} count={groups[0].decks.length} /> : (
          <>
            <h1 className="title">Library</h1>
            <div className="meta"><span>{data.decks.length} deck{data.decks.length === 1 ? '' : 's'}</span><i>/</i><span>{data.decks.reduce((n, d) => n + d.termCount + d.questionCount, 0)} items</span></div>
          </>
        )}
        {groups.map((g) => (
          <section className="group" key={g.id || 'loose'}>
            {!folder && <h2>{g.id ? <Link to={`/folder/${g.id}`} style={{ textDecoration: 'none' }}>{g.name}</Link> : g.name}<span>{g.decks.length}</span></h2>}
            <div className="cards" style={folder ? { marginTop: 24 } : undefined}>
              {g.decks.map((d) => <DeckCard key={d.id} d={d} m={data.mastery.get(d.id)} />)}
            </div>
            {folder && g.decks.length === 0 && <p className="empty-note" style={{ marginTop: 20 }}>No decks here yet. Open a deck and use "Move to folder", or import a deck whose course matches this folder's name.</p>}
          </section>
        ))}
      </div>
    </>
  )
}

function DeckCard({ d, m }: { d: DeckRow; m?: MasteryCounts }) {
  const total = d.termCount + d.questionCount
  const c = m ?? { new: total, learning: 0, familiar: 0, mastered: 0 }
  return (
    <Link className="dcard" to={`/deck/${d.id}`}>
      <b>{d.title}</b>
      <div className="sub">{plural(d.termCount, 'term')} · {plural(d.questionCount, 'question')} · studied {relTime(d.lastStudiedAt)}</div>
      <div className="mbar" aria-label={`${c.familiar + c.mastered} of ${total} learned`}>
        <i style={{ flexGrow: c.mastered, background: 'var(--seg4)' }} />
        <i style={{ flexGrow: c.familiar, background: 'var(--seg3)' }} />
        <i style={{ flexGrow: c.learning, background: 'var(--seg2)' }} />
        <i style={{ flexGrow: c.new, background: 'var(--seg1)' }} />
      </div>
    </Link>
  )
}

function FolderHeader({ id, name, count }: { id: string; name: string; count: number }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(name)
  const nav = useNavigate()
  const save = async () => { setEditing(false); if (val.trim() && val !== name) await renameFolder(id, val) }
  return (
    <>
      {editing
        ? <input className="input" autoFocus value={val} onChange={(e) => setVal(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()} style={{ fontFamily: 'var(--serif)', fontSize: 32, height: 56, maxWidth: 520 }} />
        : <h1 className="title">{name}</h1>}
      <div className="meta">
        <span>{count} deck{count === 1 ? '' : 's'}</span><i>/</i>
        <button className="btn ghost sm" onClick={() => { setVal(name); setEditing(true) }}>Rename</button>
        <button className="btn ghost sm danger" onClick={async () => { await deleteFolder(id); toast('Folder removed', 'Its decks moved to "Not in a folder"'); nav('/') }}>Remove folder</button>
      </div>
    </>
  )
}

function Empty() {
  const open = useUI((s) => s.open)
  const nav = useNavigate()
  const trySample = async () => {
    const r = parseDeckText(extractPromptExample(template))
    if (!r.ok) return
    const { deckId } = await importDeck({ ...r.deck, title: 'Sample: accounting basics' })
    nav(`/deck/${deckId}`)
  }
  return (
    <div className="page">
      <div className="hero-empty">
        <h1>Turn your course material into a quiz that remembers what you miss.</h1>
        <p>Mneme gives you a prompt for any AI chat. Hand it your slides or textbook pages, import the file it writes, and study one question at a time. Misses come back sooner; the ones you know come back later.</p>
        <div className="row">
          <button className="btn primary" onClick={() => open('prompt')}><Icon name="prompt" />Get the LLM prompt</button>
          <button className="btn" onClick={() => open('import')}><Icon name="upload" />Import a deck</button>
          <button className="btn ghost" onClick={trySample}>Try a small sample deck</button>
        </div>
        <div className="how">
          <div><b>Get the prompt</b>Pick a course, a difficulty and the question styles you want. Everything is optional.</div>
          <div><b>Run it anywhere</b>Paste it into Claude, ChatGPT or Gemini with your files. It returns a <code>.json</code> deck.</div>
          <div><b>Import and learn</b>Drop the file here. Learn mode keeps going until you know every card.</div>
        </div>
        <p style={{ fontSize: 12.5, marginTop: 36 }}>You're in guest mode. Decks and progress stay in this browser.</p>
      </div>
    </div>
  )
}
