import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import template from '../../../deck-format/mneme-deck-prompt.md?raw'
import { db, type DeckRow, type Folder } from '../../data/db'
import * as repo from '../../data/repo'
import { allDeckMastery, plural, relTime, type MasteryCounts } from '../../data/stats'
import { extractPromptExample } from '../../deck-format/example'
import { parseDeckText } from '../../deck-format/parse'
import { TopBar } from '../../app/Shell'
import { useUI } from '../../app/ui'
import { useSettings } from '../../settings/store'
import { Icon } from '../../ui/Icons'
import { Seg } from '../../ui/controls'
import { toast } from '../../ui/toasts'
import { confirmAction } from '../../ui/confirm'
import { FolderSelect } from './FolderSelect'

type Lib = { folders: Folder[]; decks: DeckRow[]; mastery: Map<string, MasteryCounts> }

export function LibraryPage() {
  const { folderId } = useParams()
  const data = useLiveQuery(async (): Promise<Lib> => {
    const { folders, decks } = await repo.listLibrary()
    return { folders, decks, mastery: await allDeckMastery() }
  }, [])
  if (!data) return null
  const folder = folderId ? data.folders.find((f) => f.id === folderId) : undefined
  if (folderId && !folder) return <div className="page"><h1 className="title">Folder not found</h1><p className="empty-note" style={{ marginTop: 12 }}>It may be archived. <Link to="/archive">Open the archive</Link></p></div>
  if (data.decks.length === 0 && data.folders.length === 0 && !folder) return <Empty />
  return <Browser lib={data} folder={folder} />
}

const learnedPct = (d: DeckRow, m?: MasteryCounts) => { const t = d.termCount + d.questionCount; return t && m ? (m.familiar + m.mastered) / t : 0 }

function Browser({ lib, folder }: { lib: Lib; folder?: Folder }) {
  const open = useUI((s) => s.open)
  const { libraryView, librarySort, set } = useSettings()
  const [q, setQ] = useState('')
  const nav = useNavigate()
  const parentId = folder?.id ?? null
  const subfolders = lib.folders.filter((f) => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  const sortDecks = (ds: DeckRow[]) => [...ds].sort((a, b) =>
    librarySort === 'name' ? a.title.localeCompare(b.title, undefined, { numeric: true })
      : librarySort === 'progress' ? learnedPct(a, lib.mastery.get(a.id)) - learnedPct(b, lib.mastery.get(b.id))
        : (b.lastStudiedAt ?? b.updatedAt) - (a.lastStudiedAt ?? a.updatedAt))
  const needle = q.trim().toLowerCase()
  const inScope = folder ? repo.descendants(lib.folders, folder.id) : null
  const searchHits = needle ? sortDecks(lib.decks.filter((d) => (!inScope || (d.folderId && inScope.has(d.folderId))) && `${d.title} ${d.course ?? ''} ${d.description ?? ''}`.toLowerCase().includes(needle))) : []
  const here = sortDecks(lib.decks.filter((d) => d.folderId === parentId))
  const recent = !folder && !needle ? [...lib.decks].filter((d) => d.lastStudiedAt).sort((a, b) => b.lastStudiedAt! - a.lastStudiedAt!).slice(0, 4) : []
  const stats = (f: Folder) => {
    const ids = repo.descendants(lib.folders, f.id)
    const ds = lib.decks.filter((d) => d.folderId && ids.has(d.folderId))
    const items = ds.reduce((n, d) => n + d.termCount + d.questionCount, 0)
    const learned = ds.reduce((n, d) => { const m = lib.mastery.get(d.id); return n + (m ? m.familiar + m.mastered : 0) }, 0)
    return { decks: ds.length, sub: ids.size - 1, items, pct: items ? learned / items : 0 }
  }
  const path: Folder[] = []
  for (let f = folder; f; f = lib.folders.find((x) => x.id === f!.parentId)) path.unshift(f)

  const newFolder = async () => {
    const id = await repo.createFolder('New folder', parentId)
    nav(`/folder/${id}?rename=1`)
  }

  return (
    <>
      <TopBar crumbs={folder ? <><Link to="/">Library</Link>{path.slice(0, -1).map((f) => <span key={f.id}> / <Link to={`/folder/${f.id}`}>{f.name}</Link></span>)} / <b>{folder.name}</b></> : <b>Library</b>}>
        <button className="btn sm" onClick={() => open('prompt')}><Icon name="prompt" />Get the prompt</button>
        <button className="btn sm" onClick={() => open('import')}><Icon name="upload" />Import</button>
      </TopBar>
      <div className="page" key={folder?.id ?? 'root'}>
        {folder ? <FolderHeader key={folder.id} folder={folder} folders={lib.folders} /> : (
          <>
            <h1 className="title">Library</h1>
            <div className="meta"><span>{plural(lib.decks.length, 'deck')}</span><i>/</i><span>{plural(lib.folders.length, 'folder')}</span><i>/</i><span>{plural(lib.decks.reduce((n, d) => n + d.termCount + d.questionCount, 0), 'card')}</span></div>
          </>
        )}

        <div className="libbar">
          <div className="searchbar grow"><Icon name="search" /><input className="input" placeholder={folder ? `Search in ${folder.name}` : 'Search decks'} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="select" style={{ width: 'auto', height: 36 }} value={librarySort} onChange={(e) => set({ librarySort: e.target.value as typeof librarySort })} aria-label="Sort">
            <option value="recent">Recently studied</option>
            <option value="name">Name</option>
            <option value="progress">Least learned first</option>
          </select>
          <Seg value={libraryView} onChange={(v) => set({ libraryView: v })} options={[{ value: 'grid', label: <Icon name="grid" />, title: 'Grid' }, { value: 'list', label: <Icon name="list" />, title: 'List' }]} />
          <button className="btn sm" onClick={newFolder}><Icon name="folder" />{folder ? 'New subfolder' : 'New folder'}</button>
        </div>

        {needle ? (
          <section className="group">
            <h2>Results<span>{searchHits.length}</span></h2>
            {searchHits.length ? <Decks decks={searchHits} lib={lib} view={libraryView} showFolder /> : <p className="empty-note">No decks match "{q}".</p>}
          </section>
        ) : (
          <>
            {recent.length > 0 && (
              <section className="group"><h2>Pick up where you left off</h2><Decks decks={recent} lib={lib} view="grid" showFolder /></section>
            )}
            {subfolders.length > 0 && (
              <section className="group">
                <h2>{folder ? 'Folders inside' : 'Folders'}<span>{subfolders.length}</span></h2>
                <div className="cards">
                  {subfolders.map((f, i) => { const s = stats(f); return (
                    <Link key={f.id} className="dcard fcard" to={`/folder/${f.id}`} style={{ '--i': i } as React.CSSProperties}>
                      <span className="fico"><Icon name="folder" size={18} /></span>
                      <b>{f.name}</b>
                      <div className="sub">{plural(s.decks, 'deck')}{s.sub ? ` · ${plural(s.sub, 'subfolder')}` : ''} · {plural(s.items, 'card')}</div>
                      <div className="mbar"><i style={{ flexGrow: s.pct, background: 'var(--seg4)' }} /><i style={{ flexGrow: 1 - s.pct, background: 'var(--seg1)' }} /></div>
                    </Link>
                  ) })}
                </div>
              </section>
            )}
            {here.length > 0 && (
              <section className="group">
                <h2>{folder ? 'Decks' : 'Not in a folder'}<span>{here.length}</span></h2>
                <Decks decks={here} lib={lib} view={libraryView} />
              </section>
            )}
            {folder && here.length === 0 && subfolders.length === 0 && (
              <p className="empty-note" style={{ marginTop: 28 }}>This folder is empty. Move a deck here from its page, or import a deck whose course matches this folder's name.</p>
            )}
          </>
        )}
      </div>
    </>
  )
}

function Decks({ decks, lib, view, showFolder }: { decks: DeckRow[]; lib: Lib; view: 'grid' | 'list'; showFolder?: boolean }) {
  const folderName = (id: string | null) => lib.folders.find((f) => f.id === id)?.name
  if (view === 'list') {
    return (
      <div className="dlist">
        {decks.map((d, i) => { const m = lib.mastery.get(d.id); const pct = learnedPct(d, m); return (
          <Link key={d.id} className="drow" to={`/deck/${d.id}`} style={{ '--i': i } as React.CSSProperties}>
            <b>{d.title}</b>
            <span className="muted">{showFolder && folderName(d.folderId) ? `${folderName(d.folderId)} · ` : ''}{plural(d.termCount + d.questionCount, 'card')}</span>
            <span className="mbar"><i style={{ flexGrow: pct, background: 'var(--seg4)' }} /><i style={{ flexGrow: 1 - pct, background: 'var(--seg1)' }} /></span>
            <span className="muted pct">{Math.round(pct * 100)}%</span>
            <span className="muted when">{relTime(d.lastStudiedAt)}</span>
          </Link>
        ) })}
      </div>
    )
  }
  return <div className="cards">{decks.map((d, i) => <DeckCard key={d.id} i={i} d={d} m={lib.mastery.get(d.id)} folder={showFolder ? folderName(d.folderId) : undefined} />)}</div>
}

function DeckCard({ d, m, folder, i = 0 }: { d: DeckRow; m?: MasteryCounts; folder?: string; i?: number }) {
  const total = d.termCount + d.questionCount
  const c = m ?? { new: total, learning: 0, familiar: 0, mastered: 0 }
  return (
    <Link className="dcard" to={`/deck/${d.id}`} style={{ '--i': i } as React.CSSProperties}>
      {folder && <span className="dfolder">{folder}</span>}
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

function FolderHeader({ folder, folders }: { folder: Folder; folders: Folder[] }) {
  const startRename = new URLSearchParams(location.search).has('rename')
  const [editing, setEditing] = useState(startRename)
  const [val, setVal] = useState(folder.name)
  const [moving, setMoving] = useState(false)
  const nav = useNavigate()
  const exclude = useMemo(() => repo.descendants(folders, folder.id), [folders, folder.id])
  const save = async () => {
    setEditing(false)
    if (val.trim() && val !== folder.name) await repo.renameFolder(folder.id, val)
    if (startRename) nav(`/folder/${folder.id}`, { replace: true })
  }
  return (
    <>
      {editing
        ? <input className="input title-input" autoFocus onFocus={(e) => e.target.select()} value={val} onChange={(e) => setVal(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(folder.name); setEditing(false) } }} />
        : <h1 className="title">{folder.name}</h1>}
      <div className="meta" style={{ alignItems: 'center' }}>
        <button className="btn ghost sm" onClick={() => { setVal(folder.name); setEditing(true) }}><Icon name="edit" />Rename</button>
        <button className="btn ghost sm" onClick={() => setMoving(!moving)}><Icon name="folder" />Move</button>
        <button className="btn ghost sm" onClick={async () => {
          if (!await confirmAction({ title: `Archive "${folder.name}"?`, body: 'The folder and everything in it leave the library. Progress is kept, and you can restore it from Archive.', confirm: 'Archive folder' })) return
          await repo.setArchived('folder', folder.id, true); toast('Folder archived', 'Find it under Archive in the sidebar', 'archive'); nav('/')
        }}><Icon name="archive" />Archive</button>
        <button className="btn ghost sm danger" onClick={async () => {
          if (!await confirmAction({ title: `Remove the folder "${folder.name}"?`, body: 'Only the folder goes. Its decks and subfolders move up one level.', confirm: 'Remove folder', danger: true })) return
          await repo.deleteFolder(folder.id); toast('Folder removed'); nav(folder.parentId ? `/folder/${folder.parentId}` : '/')
        }}><Icon name="trash" />Remove</button>
        {moving && (
          <span style={{ minWidth: 240 }}>
            <FolderSelect folders={folders} value={folder.parentId} exclude={exclude} noneLabel="Top level" onChange={async (id) => { await repo.moveFolder(folder.id, id); setMoving(false); toast('Folder moved') }} />
          </span>
        )}
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
    const { deckId } = await repo.importDeck({ ...r.deck, title: 'Sample: accounting basics' })
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

export function ArchivePage() {
  const data = useLiveQuery(() => repo.listArchive(), [])
  const all = useLiveQuery(() => db.folders.toArray(), [])
  if (!data || !all) return null
  const empty = !data.folders.length && !data.decks.length
  return (
    <>
      <TopBar crumbs={<><Link to="/">Library</Link> / <b>Archive</b></>} />
      <div className="page">
        <h1 className="title">Archive</h1>
        <p className="muted" style={{ marginTop: 10 }}>Archived decks and folders keep their cards and progress. Restore puts them back where they were.</p>
        {empty && <p className="empty-note" style={{ marginTop: 26 }}>Nothing archived.</p>}
        {data.folders.length > 0 && (
          <section className="group"><h2>Folders<span>{data.folders.length}</span></h2>
            <div className="dlist">
              {data.folders.map((f) => (
                <div className="drow static" key={f.id}>
                  <b><Icon name="folder" /> {f.name}</b><span className="muted">archived {relTime(f.archivedAt)}</span><span /><span />
                  <span className="acts">
                    <button className="btn sm" onClick={async () => { await repo.setArchived('folder', f.id, false); toast('Folder restored') }}>Restore</button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
        {data.decks.length > 0 && (
          <section className="group"><h2>Decks<span>{data.decks.length}</span></h2>
            <div className="dlist">
              {data.decks.map((d) => (
                <div className="drow static" key={d.id}>
                  <b>{d.title}</b><span className="muted">{all.find((f) => f.id === d.folderId)?.name ?? 'No folder'} · {plural(d.termCount + d.questionCount, 'card')}</span><span /><span className="muted">archived {relTime(d.archivedAt)}</span>
                  <span className="acts">
                    <button className="btn sm" onClick={async () => { await repo.setArchived('deck', d.id, false); toast('Deck restored') }}>Restore</button>
                    <button className="btn sm ghost danger" onClick={async () => {
                      if (await confirmAction({ title: `Delete "${d.title}" for good?`, body: 'Its cards and progress are removed. This can\'t be undone.', confirm: 'Delete deck', danger: true })) { await repo.deleteDeck(d.id); toast('Deck deleted') }
                    }}>Delete</button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
