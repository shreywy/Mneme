import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import template from '../../../deck-format/mneme-deck-prompt.md?raw'
import { db, type DeckRow, type Folder, type NoteRow } from '../../data/db'
import * as notesRepo from '../../data/notes'
import * as sheetsRepo from '../../data/sheets'
import type { SheetRow } from '../../sheets/types'
import { groupByUnit, pageIcon, pagePath, pagesOf, pageTime, pageUrl, topLevel, type Page } from '../../data/pages'
import * as repo from '../../data/repo'
import * as trash from '../../data/trash'
import { allDeckMastery, plural, relTime, type MasteryCounts } from '../../data/stats'
import { extractPromptExample } from '../../deck-format/example'
import { parseDeckText } from '../../deck-format/parse'
import { TopBar, useNewPage } from '../../app/Shell'
import { deleteWithUndo } from '../../app/trash'
import { useUI } from '../../app/ui'
import { useSettings } from '../../settings/store'
import { Icon } from '../../ui/Icons'
import { Seg } from '../../ui/controls'
import { toast } from '../../ui/toasts'
import { confirmAction } from '../../ui/confirm'
import { FolderSelect } from './FolderSelect'
import { accountsEnabled, displayName, useAccount } from '../../sync/account'

type Lib = { folders: Folder[]; decks: DeckRow[]; notes: NoteRow[]; sheets: SheetRow[]; mastery: Map<string, MasteryCounts> }

export function LibraryPage() {
  const { folderId } = useParams()
  const data = useLiveQuery(async (): Promise<Lib> => {
    const [{ folders, decks }, notes, sheets] = await Promise.all([repo.listLibrary(), notesRepo.listNotes(), sheetsRepo.listSheets()])
    return { folders, decks, notes, sheets, mastery: await allDeckMastery() }
  }, [])
  if (!data) return null
  const folder = folderId ? data.folders.find((f) => f.id === folderId) : undefined
  if (folderId && !folder) return <div className="page"><h1 className="title">Folder not found</h1><p className="empty-note" style={{ marginTop: 12 }}>It may be archived. <Link to="/archive">Open the archive</Link></p></div>
  if (data.decks.length === 0 && data.notes.length === 0 && data.sheets.length === 0 && data.folders.length === 0 && !folder) return <Empty />
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
  const pages = pagesOf(lib.decks, lib.notes, lib.sheets)
  const progressOf = (p: Page) => (p.kind === 'deck' ? learnedPct(p.deck, lib.mastery.get(p.id)) : p.kind === 'note' ? readPct(p.note) : 0)
  const byChosenSort = (a: Page, b: Page) =>
    librarySort === 'name' ? a.title.localeCompare(b.title, undefined, { numeric: true })
      : librarySort === 'progress' ? progressOf(a) - progressOf(b)
        : pageTime(b) - pageTime(a)
  const needle = q.trim().toLowerCase()
  const inScope = folder ? repo.descendants(lib.folders, folder.id) : null
  const haystack = (p: Page) => p.kind === 'deck'
    ? `${p.title} ${p.unit ?? ''} ${p.deck.course ?? ''} ${p.deck.description ?? ''}`
    : p.kind === 'note' ? `${p.title} ${p.unit ?? ''} ${p.note.course ?? ''} ${p.note.summary ?? ''} ${notesText(p.note)}`
      : `${p.title} ${p.unit ?? ''}`
  const searchHits = needle ? pages.filter((p) => (!inScope || (p.folderId && inScope.has(p.folderId))) && haystack(p).toLowerCase().includes(needle)).sort(byChosenSort) : []
  const here = topLevel(pages).filter((p) => p.folderId === parentId)
  const groups = groupByUnit(here, librarySort === 'recent' ? undefined : byChosenSort)
  const recent = !folder && !needle
    ? pages.filter((p) => (p.kind === 'deck' ? p.deck.lastStudiedAt : p.kind === 'note' ? p.note.lastOpenedAt : p.sheet.lastOpenedAt)).sort((a, b) => pageTime(b) - pageTime(a)).slice(0, 4)
    : []
  const stats = (f: Folder) => {
    const ids = repo.descendants(lib.folders, f.id)
    const ds = lib.decks.filter((d) => d.folderId && ids.has(d.folderId))
    const ns = lib.notes.filter((n) => n.folderId && ids.has(n.folderId))
    const ss = pages.filter((p) => p.kind === 'sheet' && p.folderId && ids.has(p.folderId))
    const items = ds.reduce((n, d) => n + d.termCount + d.questionCount, 0)
    const learned = ds.reduce((n, d) => { const m = lib.mastery.get(d.id); return n + (m ? m.familiar + m.mastered : 0) }, 0)
    return { decks: ds.length, notes: ns.length, sheets: ss.length, sub: ids.size - 1, items, pct: items ? learned / items : 0 }
  }
  const path: Folder[] = []
  for (let f = folder; f; f = lib.folders.find((x) => x.id === f!.parentId)) path.unshift(f)

  const newPage = useNewPage()
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
            <div className="meta"><span>{plural(lib.decks.length, 'deck')}</span>{lib.notes.length > 0 && <><i>/</i><span>{plural(lib.notes.length, 'notes page')}</span></>}{lib.sheets.length > 0 && <><i>/</i><span>{plural(lib.sheets.length, 'page')}</span></>}<i>/</i><span>{plural(lib.folders.length, 'folder')}</span><i>/</i><span>{plural(lib.decks.reduce((n, d) => n + d.termCount + d.questionCount, 0), 'card')}</span></div>
          </>
        )}

        <div className="libbar">
          <div className="searchbar grow"><Icon name="search" /><input className="input" placeholder={folder ? `Search in ${folder.name}` : 'Search decks and notes'} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="select" style={{ width: 'auto', height: 36 }} value={librarySort} onChange={(e) => set({ librarySort: e.target.value as typeof librarySort })} aria-label="Sort">
            <option value="recent">Recently studied</option>
            <option value="name">Name</option>
            <option value="progress">Least learned first</option>
          </select>
          <Seg value={libraryView} onChange={(v) => set({ libraryView: v })} options={[{ value: 'grid', label: <Icon name="grid" />, title: 'Grid' }, { value: 'list', label: <Icon name="list" />, title: 'List' }]} />
          <button className="btn sm" onClick={newFolder}><Icon name="folder" />{folder ? 'New subfolder' : 'New folder'}</button>
          <button className="btn sm primary" onClick={() => newPage(parentId)}><Icon name="plus" />New page</button>
        </div>

        {needle ? (
          <section className="group">
            <h2>Results<span>{searchHits.length}</span></h2>
            {searchHits.length ? <Pages pages={searchHits} all={pages} lib={lib} view={libraryView} showFolder /> : <p className="empty-note">Nothing matches "{q}".</p>}
          </section>
        ) : (
          <>
            {recent.length > 0 && (
              <section className="group"><h2>Pick up where you left off</h2><Pages pages={recent} all={pages} lib={lib} view="grid" showFolder /></section>
            )}
            {subfolders.length > 0 && (
              <section className="group">
                <h2>{folder ? 'Folders inside' : 'Folders'}<span>{subfolders.length}</span></h2>
                <div className="cards">
                  {subfolders.map((f, i) => { const s = stats(f); return (
                    <Link key={f.id} className="dcard fcard" to={`/folder/${f.id}`} style={{ '--i': i } as React.CSSProperties}>
                      <span className="fico"><Icon name="folder" size={18} /></span>
                      <b>{f.name}</b>
                      <div className="sub">{plural(s.decks, 'deck')}{s.notes ? ` · ${plural(s.notes, 'notes page')}` : ''}{s.sheets ? ` · ${plural(s.sheets, 'page')}` : ''}{s.sub ? ` · ${plural(s.sub, 'subfolder')}` : ''} · {plural(s.items, 'card')}</div>
                      <div className="mbar"><i style={{ flexGrow: s.pct, background: 'var(--seg4)' }} /><i style={{ flexGrow: 1 - s.pct, background: 'var(--seg1)' }} /></div>
                    </Link>
                  ) })}
                </div>
              </section>
            )}
            {groups.map((g) => (
              <section className="group" key={g.unit ?? '-'}>
                <h2>{g.unit ?? (!folder ? 'Not in a folder' : groups.length > 1 ? 'No unit' : here.some((p) => p.kind === 'note') ? 'Pages' : 'Decks')}<span>{g.pages.length}</span></h2>
                <Pages pages={g.pages} all={pages} lib={lib} view={libraryView} />
              </section>
            ))}
            {folder && here.length === 0 && subfolders.length === 0 && (
              <p className="empty-note" style={{ marginTop: 28 }}>This folder is empty. Move a deck or notes page here from its page, or import one whose course matches this folder's name.</p>
            )}
          </>
        )}
      </div>
    </>
  )
}

// Page text is flattened once per notes page and remembered, so search stays quick while typing.
const textCache = new WeakMap<NoteRow, string>()
const notesText = (n: NoteRow) => { let t = textCache.get(n); if (t === undefined) { t = notesRepo.plainText(n.blocks); textCache.set(n, t) } return t }
const readPct = (n: NoteRow) => { const r = notesRepo.readingProgress(n); return r.total ? r.read / r.total : 0 }

function Pages({ pages, all, lib, view, showFolder }: { pages: Page[]; all: Page[]; lib: Lib; view: 'grid' | 'list'; showFolder?: boolean }) {
  // Where a page sits: its folder, then the pages above it (CPS721 › Week 2).
  const where = (p: Page) => showFolder ? [lib.folders.find((f) => f.id === p.folderId)?.name, ...pagePath(p, all)].filter(Boolean).join(' › ') || undefined : undefined
  if (view === 'list') {
    return (
      <div className="dlist">
        {pages.map((p, i) => {
          const pct = p.kind === 'deck' ? learnedPct(p.deck, lib.mastery.get(p.id)) : p.kind === 'note' ? readPct(p.note) : null
          const what = p.kind === 'deck' ? plural(p.deck.termCount + p.deck.questionCount, 'card') : p.kind === 'note' ? `Notes · ${plural(notesRepo.readingProgress(p.note).total, 'section')}` : 'Page'
          return (
            <Link key={p.id} className={`drow ${p.kind}`} to={pageUrl(p)} style={{ '--i': i } as React.CSSProperties} data-page-kind={p.kind} data-page-id={p.id} data-page-title={p.title}>
              <b><Icon name={pageIcon(p.kind)} size={14} />{p.title}</b>
              <span className="muted">{where(p) ? `${where(p)} · ` : ''}{what}</span>
              {pct === null ? <span /> : <span className="mbar"><i style={{ flexGrow: pct, background: p.kind === 'deck' ? 'var(--seg4)' : 'var(--read)' }} /><i style={{ flexGrow: 1 - pct, background: 'var(--seg1)' }} /></span>}
              <span className="muted pct">{pct === null ? '' : `${Math.round(pct * 100)}%`}</span>
              <span className="muted when">{relTime(p.kind === 'deck' ? p.deck.lastStudiedAt : p.kind === 'note' ? p.note.lastOpenedAt : p.sheet.lastOpenedAt)}</span>
            </Link>
          )
        })}
      </div>
    )
  }
  return (
    <div className="cards">
      {pages.map((p, i) => p.kind === 'deck'
        ? <DeckCard key={p.id} i={i} d={p.deck} m={lib.mastery.get(p.id)} folder={where(p)} />
        : p.kind === 'note' ? <NoteCard key={p.id} i={i} n={p.note} folder={where(p)} />
          : <SheetCard key={p.id} i={i} s={p.sheet} folder={where(p)} />)}
    </div>
  )
}

function SheetCard({ s, folder, i = 0 }: { s: SheetRow; folder?: string; i?: number }) {
  return (
    <Link className="dcard scard" to={`/write/${s.id}`} style={{ '--i': i } as React.CSSProperties} data-page-kind="sheet" data-page-id={s.id} data-page-title={s.title}>
      <span className="kind"><Icon name="page" size={13} />Page{folder ? ` · ${folder}` : ''}</span>
      <b>{s.title}</b>
      <div className="sub">{s.unit ? `${s.unit} · ` : ''}edited {relTime(s.updatedAt)}</div>
    </Link>
  )
}

function NoteCard({ n, folder, i = 0 }: { n: NoteRow; folder?: string; i?: number }) {
  const r = notesRepo.readingProgress(n)
  const sections = n.blocks.filter((b) => b.type === 'section').length
  return (
    <Link className="dcard ncard" to={`/notes/${n.id}`} style={{ '--i': i } as React.CSSProperties} data-page-kind="note" data-page-id={n.id} data-page-title={n.title}>
      <span className="kind"><Icon name="notes" size={13} />Notes{folder ? ` · ${folder}` : ''}</span>
      <b>{n.title}</b>
      <div className="sub">{sections ? plural(sections, 'section') : 'One page'}{n.unit ? ` · ${n.unit}` : ''} · opened {relTime(n.lastOpenedAt)}</div>
      <div className="mbar" aria-label={`${r.read} of ${r.total} read`}>
        <i style={{ flexGrow: r.read, background: 'var(--read)' }} />
        <i style={{ flexGrow: r.total - r.read, background: 'var(--seg1)' }} />
      </div>
    </Link>
  )
}

function DeckCard({ d, m, folder, i = 0 }: { d: DeckRow; m?: MasteryCounts; folder?: string; i?: number }) {
  const total = d.termCount + d.questionCount
  const c = m ?? { new: total, learning: 0, familiar: 0, mastered: 0 }
  return (
    <Link className="dcard" to={`/deck/${d.id}`} style={{ '--i': i } as React.CSSProperties} data-page-kind="deck" data-page-id={d.id} data-page-title={d.title}>
      <span className="kind"><Icon name="cards" size={13} />Deck{folder ? ` · ${folder}` : ''}</span>
      <b>{d.title}</b>
      <div className="sub">{plural(d.termCount, 'term')} · {plural(d.questionCount, 'question')}{d.unit ? ` · ${d.unit}` : ''} · studied {relTime(d.lastStudiedAt)}</div>
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
  const { user, status, lastSync } = useAccount()
  const newPage = useNewPage()
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
          <button className="btn" onClick={() => newPage(null)}><Icon name="page" />Write a page</button>
          <button className="btn ghost" onClick={trySample}>Try a small sample deck</button>
        </div>
        <div className="how">
          <div><b>Get the prompt</b>Pick a course, a difficulty and the question styles you want. Everything is optional.</div>
          <div><b>Run it anywhere</b>Paste it into Claude, ChatGPT or Gemini with your files. It returns a <code>.json</code> deck.</div>
          <div><b>Import and learn</b>Drop the file here. Learn mode keeps going until you know every card.</div>
        </div>
        <p style={{ fontSize: 12.5, marginTop: 36 }}>
          {user
            ? status === 'syncing' && !lastSync
              ? 'Bringing in the decks from your account…'
              : `Signed in as ${displayName(user)}. Decks you add here show up on your other devices.`
            : <>You're in guest mode. Decks and progress stay in this browser.{accountsEnabled && <> <Link className="linkbtn" style={{ fontSize: 'inherit' }} to="/account">Sign in</Link> to use them on your other devices.</>}</>}
        </p>
      </div>
    </div>
  )
}

export function ArchivePage() {
  const data = useLiveQuery(() => repo.listArchive(), [])
  const bin = useLiveQuery(() => trash.listTrash(), [])
  const all = useLiveQuery(() => db.folders.toArray(), [])
  if (!data || !all || !bin) return null
  const empty = !data.folders.length && !data.decks.length && !data.notes.length && !data.sheets.length && !bin.decks.length && !bin.notes.length && !bin.sheets.length
  const deleted = [
    ...bin.sheets.map((s) => ({ kind: 'sheet' as const, id: s.id, title: s.title, at: s.deletedAt!, icon: 'page' })),
    ...bin.notes.map((n) => ({ kind: 'note' as const, id: n.id, title: n.title, at: n.deletedAt!, icon: 'notes' })),
    ...bin.decks.map((d) => ({ kind: 'deck' as const, id: d.id, title: d.title, at: d.deletedAt!, icon: 'cards' })),
  ].sort((a, b) => b.at - a.at)
  return (
    <>
      <TopBar crumbs={<><Link to="/">Library</Link> / <b>Archive</b></>} />
      <div className="page">
        <h1 className="title">Archive</h1>
        <p className="muted" style={{ marginTop: 10 }}>Archived decks, notes, pages and folders keep everything in them. Restore puts them back where they were. Deleted ones wait here for {trash.TRASH_DAYS} days.</p>
        {empty && <p className="empty-note" style={{ marginTop: 26 }}>Nothing archived.</p>}
        {deleted.length > 0 && (
          <section className="group"><h2>Recently deleted<span>{deleted.length}</span></h2>
            <p className="muted" style={{ margin: '-4px 0 12px', fontSize: 13 }}>Each one is removed for good {trash.TRASH_DAYS} days after you delete it.</p>
            <div className="dlist">
              {deleted.map((x) => {
                const left = trash.daysLeft(x.at)
                return (
                  <div className="drow static" key={`${x.kind}:${x.id}`}>
                    <b><Icon name={x.icon} size={14} />{x.title}</b><span className="muted">deleted {relTime(x.at)}</span><span /><span className="muted">{left <= 1 ? 'goes today' : `${left} days left`}</span>
                    <span className="acts">
                      <button className="btn sm" onClick={async () => { await trash.restorePage(x.kind, x.id); toast('Restored', 'It’s back where it was') }}>Restore</button>
                      <button className="btn sm ghost danger" onClick={async () => {
                        if (await confirmAction({ title: `Delete "${x.title}" now?`, body: 'It goes for good, with everything in it. This can’t be undone.', confirm: 'Delete now', danger: true })) { await trash.deleteForGood(x.kind, x.id); toast('Deleted for good') }
                      }}>Delete now</button>
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}
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
        {data.sheets.length > 0 && (
          <section className="group"><h2>Pages<span>{data.sheets.length}</span></h2>
            <div className="dlist">
              {data.sheets.map((s) => (
                <div className="drow static" key={s.id}>
                  <b><Icon name="page" size={14} />{s.title}</b><span className="muted">{all.find((f) => f.id === s.folderId)?.name ?? 'No folder'}{s.unit ? ` · ${s.unit}` : ''}</span><span /><span className="muted">archived {relTime(s.archivedAt)}</span>
                  <span className="acts">
                    <button className="btn sm" onClick={async () => { await sheetsRepo.setSheetArchived(s.id, false); toast('Page restored') }}>Restore</button>
                    <button className="btn sm ghost danger" onClick={() => deleteWithUndo('sheet', s.id)}>Delete</button>
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
                    <button className="btn sm ghost danger" onClick={() => deleteWithUndo('deck', d.id)}>Delete</button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
        {data.notes.length > 0 && (
          <section className="group"><h2>Notes<span>{data.notes.length}</span></h2>
            <div className="dlist">
              {data.notes.map((n) => (
                <div className="drow static" key={n.id}>
                  <b><Icon name="notes" size={14} />{n.title}</b><span className="muted">{all.find((f) => f.id === n.folderId)?.name ?? 'No folder'}{n.unit ? ` · ${n.unit}` : ''}</span><span /><span className="muted">archived {relTime(n.archivedAt)}</span>
                  <span className="acts">
                    <button className="btn sm" onClick={async () => { await notesRepo.setNoteArchived(n.id, false); toast('Notes restored') }}>Restore</button>
                    <button className="btn sm ghost danger" onClick={() => deleteWithUndo('note', n.id)}>Delete</button>
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
