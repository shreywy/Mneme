import { useEffect, useRef, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Folder } from '../data/db'
import { listNotes } from '../data/notes'
import { groupByUnit, pagesOf, pageUrl, type Page } from '../data/pages'
import { createFolder, descendants, listArchive, listLibrary } from '../data/repo'
import { useSettings } from '../settings/store'
import { Icon, Wordmark } from '../ui/Icons'
import { isTyping, useUI } from './ui'
import { Collapse } from '../ui/motion'
import { accountsEnabled, displayName, useAccount } from '../sync/account'
import { useProfile } from '../sync/profile'
import { Avatar } from '../ui/Avatar'
import { useContextItems } from '../ui/ContextMenu'
import { confirmAction } from '../ui/confirm'
import { toast } from '../ui/toasts'
import { deleteNote, setNoteArchived } from '../data/notes'
import { deleteDeck, setArchived } from '../data/repo'

export function Shell() {
  const { sidebar, set } = useSettings()
  const { focus, setFocus, peek, setPeek, open, drawer, setDrawer } = useUI()
  const loc = useLocation()
  useEffect(() => { setDrawer(false) }, [loc.pathname, setDrawer])
  const rail = sidebar === 'rail'
  const peekT = useRef<number>(0)
  const unpeekT = useRef<number>(0)
  const hotT = useRef<number>(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useUI.getState().focus && !useUI.getState().dialog) { setFocus(false); return }
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey || useUI.getState().dialog) return
      if (e.key === '[') { set({ sidebar: useSettings.getState().sidebar === 'rail' ? 'full' : 'rail' }); setPeek(false) }
      else if (e.key === 'f' || e.key === 'F') setFocus(!useUI.getState().focus)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [set, setFocus, setPeek])

  const onSideEnter = () => {
    if (!rail) return
    clearTimeout(unpeekT.current)
    peekT.current = window.setTimeout(() => setPeek(true), 380)
  }
  const onSideLeave = () => {
    clearTimeout(peekT.current)
    unpeekT.current = window.setTimeout(() => setPeek(false), 180)
  }
  const hotEnter = () => { hotT.current = window.setTimeout(() => setFocus(false), 300) }
  const hotLeave = () => clearTimeout(hotT.current)

  return (
    <>
      <div className={`app ${rail ? 'rail' : ''} ${rail && peek ? 'peek' : ''} ${focus ? 'focus' : ''} ${drawer ? 'drawer' : ''}`}>
        {drawer && <div className="drawer-scrim" onClick={() => setDrawer(false)} />}
        <aside className="side" onMouseEnter={onSideEnter} onMouseLeave={onSideLeave}>
          <div className="brand">
            <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}><Wordmark collapsedLabel /></Link>
            <button className="side-toggle" onClick={() => { set({ sidebar: rail ? 'full' : 'rail' }); setPeek(false) }}
              title={rail ? 'Pin the sidebar open  [' : 'Collapse the sidebar  ['} aria-label={rail ? 'Pin the sidebar open' : 'Collapse the sidebar'}>
              <Icon name={rail ? 'pin' : 'chev'} /></button>
          </div>
          <nav className="nav">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}><Icon name="lib" /><span className="lbl">Library</span></NavLink>
            <button onClick={() => open('prompt')}><Icon name="prompt" /><span className="lbl">Get the LLM prompt</span></button>
            <button onClick={() => open('import')}><Icon name="upload" /><span className="lbl">Import</span></button>
          </nav>
          <FolderTree />
          <PageMenu />
          <div className="foot">
            <AccountButton />
            <NavLink to="/settings" className={({ isActive }) => `iconbtn ${isActive ? 'on' : ''}`} onClick={() => setDrawer(false)} title="Settings" aria-label="Settings"><Icon name="gear" /></NavLink>
          </div>
        </aside>
        <main className="main">
          <Outlet />
        </main>
      </div>
      <div className="hot hot-l" onMouseEnter={hotEnter} onMouseLeave={hotLeave} />
      <div className="hot hot-t" onMouseEnter={hotEnter} onMouseLeave={hotLeave} />
    </>
  )
}

function FolderTree() {
  const data = useLiveQuery(async () => ({ ...(await listLibrary()), notes: await listNotes(), archived: (await listArchive()) }), [])
  const loc = useLocation()
  const nav = useNavigate()
  const { openFolders, set } = useSettings()
  if (!data) return <div className="tree" />
  const { folders, decks, notes } = data
  const pages = pagesOf(decks, notes)
  const archivedCount = data.archived.folders.length + data.archived.decks.length + data.archived.notes.length
  const isActive = (p: Page) => loc.pathname.startsWith(pageUrl(p))
  // Keep the path to the open page or folder expanded.
  const activePage = pages.find(isActive)
  const activeFolder = loc.pathname.startsWith('/folder/') ? loc.pathname.split('/')[2] : activePage?.folderId
  const forced = new Set<string>()
  for (let f = folders.find((x) => x.id === activeFolder); f; f = folders.find((x) => x.id === f!.parentId)) forced.add(f.id)
  const isOpen = (id: string) => openFolders.includes(id) || forced.has(id)
  const toggle = (id: string) => set({ openFolders: openFolders.includes(id) ? openFolders.filter((x) => x !== id) : [...openFolders, id] })
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true })
  const count = (id: string) => { const ids = descendants(folders, id); return pages.filter((p) => p.folderId && ids.has(p.folderId)).length }
  const PageLink = ({ p, pad }: { p: Page; pad: number }) => (
    <Link to={pageUrl(p)} className={`tdeck ${isActive(p) ? 'active' : ''}`} style={{ paddingLeft: pad }} title={p.kind === 'note' ? `Notes: ${p.title}` : p.title} data-page-kind={p.kind} data-page-id={p.id} data-page-title={p.title}>
      <Icon name={p.kind === 'note' ? 'notes' : 'cards'} size={13} /><span className="t">{p.title}</span>
    </Link>
  )
  const PageList = ({ list, pad }: { list: Page[]; pad: number }) => {
    const groups = groupByUnit(list)
    const labelled = groups.some((g) => g.unit)
    return <>{groups.map((g) => (
      <div key={g.unit ?? '-'}>
        {labelled && <div className="tunit" style={{ paddingLeft: pad + 2 }}>{g.unit ?? 'No unit'}</div>}
        {g.pages.map((p) => <PageLink key={p.id} p={p} pad={pad} />)}
      </div>
    ))}</>
  }

  const Node = ({ f, depth }: { f: Folder; depth: number }) => {
    const kids = folders.filter((x) => x.parentId === f.id).sort(byName)
    const ps = pages.filter((p) => p.folderId === f.id)
    const open = isOpen(f.id)
    return (
      <div className="tnode">
        <div className={`trow ${loc.pathname === `/folder/${f.id}` ? 'active' : ''}`} style={{ paddingLeft: 4 + depth * 14 }}>
          <button className={`twist ${open ? 'open' : ''}`} onClick={() => toggle(f.id)} aria-label={open ? 'Collapse' : 'Expand'} disabled={!kids.length && !ps.length}>
            <Icon name="down2" size={14} />
          </button>
          <Link to={`/folder/${f.id}`}><Icon name="folder" /><span className="t">{f.name}</span><span className="n">{count(f.id)}</span></Link>
        </div>
        <Collapse open={open}>
          <>
            {kids.map((k) => <Node key={k.id} f={k} depth={depth + 1} />)}
            <PageList list={ps} pad={30 + depth * 14} />
          </>
        </Collapse>
      </div>
    )
  }
  const loose = pages.filter((p) => !p.folderId)
  return (
    <>
      <div className="sec">Folders<button onClick={async () => nav(`/folder/${await createFolder('New folder')}?rename=1`)} title="New folder" aria-label="New folder">+</button></div>
      <div className="tree">
        {folders.length === 0 && loose.length === 0 && <div className="empty">Imported decks and notes show up here, grouped by course.</div>}
        {folders.filter((f) => !f.parentId).sort(byName).map((f) => <Node key={f.id} f={f} depth={0} />)}
        {loose.map((p) => <PageLink key={p.id} p={p} pad={12} />)}
        {archivedCount > 0 && (
          <Link to="/archive" className={`tdeck archive-link ${loc.pathname === '/archive' ? 'active' : ''}`} style={{ paddingLeft: 10 }}>
            <Icon name="archive" /><span className="t">Archive</span><span className="n">{archivedCount}</span>
          </Link>
        )}
      </div>
    </>
  )
}

/** Top bar used by shell pages: breadcrumb on the left, actions on the right. */
export function TopBar({ crumbs, children }: { crumbs: ReactNode; children?: ReactNode }) {
  const { setFocus, setDrawer } = useUI()
  return (
    <div className="top">
      <button className="iconbtn menu-btn" onClick={() => setDrawer(true)} aria-label="Open menu"><Icon name="menu" /></button>
      <div className="crumb">{crumbs}</div>
      <span className="grow" />
      {children}
      <button className="btn ghost sm focusbtn" onClick={() => setFocus(true)} title="Focus mode  F"><Icon name="focus" />Focus<span className="kbd">F</span></button>
    </div>
  )
}

function AccountButton() {
  const { user, status } = useAccount()
  const profile = useProfile((p) => p.profile)
  const nav = useNavigate()
  const setDrawer = useUI((s) => s.setDrawer)
  if (!accountsEnabled) {
    return <><span className="avatar" title="Guest mode: everything is saved in this browser">G</span><span className="who lbl">Guest</span></>
  }
  const name = user ? profile?.username ?? displayName(user) : 'Guest'
  return (
    <button className="acct" onClick={() => { setDrawer(false); nav('/account') }} title={user ? `${name} · ${status}` : 'Sign in to sync across devices'}>
      <span className="avatar-wrap">
        {user ? <Avatar avatar={profile?.avatar} name={name} /> : <span className="avatar">G</span>}
        {user && <span className={`syncdot ${status}`} />}
      </span>
      <span className="who lbl">{user ? name : <>Guest <span className="signin">Sign in</span></>}</span>
    </button>
  )
}

/** Right-click on a deck or notes card (library, sidebar): open, study, archive, delete. */
export function PageMenu() {
  const nav = useNavigate()
  useContextItems((_e, { target }) => {
    const el = target.closest<HTMLElement>('[data-page-id]')
    if (!el) return null
    const kind = el.dataset.pageKind as 'deck' | 'note', id = el.dataset.pageId!, title = el.dataset.pageTitle ?? ''
    const url = kind === 'deck' ? `/deck/${id}` : `/notes/${id}`
    return [
      { label: 'Open', icon: kind === 'deck' ? 'cards' : 'notes', onSelect: () => nav(url) },
      { label: 'Open in a new tab', icon: 'external', onSelect: () => { window.open(url, '_blank', 'noopener') } },
      ...(kind === 'deck' ? [
        { sep: true as const },
        { label: 'Learn', icon: 'loop', onSelect: () => nav(`${url}/learn`) },
        { label: 'Flashcards', icon: 'flip', onSelect: () => nav(`${url}/flashcards`) },
        { label: 'Test', icon: 'check', onSelect: () => nav(`${url}/test`) },
      ] : []),
      { sep: true as const },
      { label: 'Archive', icon: 'archive', onSelect: async () => { await (kind === 'deck' ? setArchived('deck', id, true) : setNoteArchived(id, true)); toast(`${kind === 'deck' ? 'Deck' : 'Notes'} archived`, 'Find it under Archive in the sidebar', 'archive') } },
      {
        label: 'Delete…', icon: 'trash', danger: true, onSelect: async () => {
          const ok = await confirmAction(kind === 'deck'
            ? { title: `Delete "${title}"?`, body: 'Its cards and progress are removed for good. Archiving keeps them instead.', confirm: 'Delete deck', danger: true }
            : { title: `Delete "${title}"?`, body: 'The notes page, its highlights and its links are removed. Linked decks stay.', confirm: 'Delete notes', danger: true })
          if (!ok) return
          if (kind === 'deck') await deleteDeck(id); else await deleteNote(id)
          toast(kind === 'deck' ? 'Deck deleted' : 'Notes deleted')
          if (location.pathname.startsWith(url)) nav('/')
        },
      },
    ]
  })
  return null
}
