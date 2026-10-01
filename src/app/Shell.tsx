import { useEffect, useRef, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Folder } from '../data/db'
import { createFolder, descendants, listArchive, listLibrary } from '../data/repo'
import { useSettings } from '../settings/store'
import { Icon, Wordmark } from '../ui/Icons'
import { isTyping, useUI } from './ui'
import { Collapse } from '../ui/motion'
import { accountsEnabled, useAccount } from '../sync/account'

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
            <button className="collapse" onClick={() => { set({ sidebar: rail ? 'full' : 'rail' }); setPeek(false) }}
              title={rail ? 'Pin the sidebar open  [' : 'Collapse the sidebar  ['} aria-label={rail ? 'Pin the sidebar open' : 'Collapse the sidebar'}>
              <Icon name={rail ? 'pin' : 'chev'} /></button>
          </div>
          <nav className="nav">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}><Icon name="lib" /><span className="lbl">Library</span></NavLink>
            <NavLink to="/notes" className={({ isActive }) => (isActive ? 'active' : '')}><Icon name="notes" /><span className="lbl">Notes</span><span className="soon">soon</span></NavLink>
            <button onClick={() => open('prompt')}><Icon name="prompt" /><span className="lbl">Get the LLM prompt</span></button>
            <button onClick={() => open('import')}><Icon name="upload" /><span className="lbl">Import a deck</span></button>
          </nav>
          <FolderTree />
          <div className="foot">
            <AccountButton onOpen={() => open('account')} />
            <button className="iconbtn" onClick={() => open('settings')} title="Settings" aria-label="Settings"><Icon name="gear" /></button>
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
  const data = useLiveQuery(async () => ({ ...(await listLibrary()), archived: (await listArchive()) }), [])
  const loc = useLocation()
  const nav = useNavigate()
  const { openFolders, set } = useSettings()
  if (!data) return <div className="tree" />
  const { folders, decks } = data
  const archivedCount = data.archived.folders.length + data.archived.decks.length
  // Keep the path to the open deck or folder expanded.
  const activeDeck = decks.find((d) => loc.pathname.startsWith(`/deck/${d.id}`))
  const activeFolder = loc.pathname.startsWith('/folder/') ? loc.pathname.split('/')[2] : activeDeck?.folderId
  const forced = new Set<string>()
  for (let f = folders.find((x) => x.id === activeFolder); f; f = folders.find((x) => x.id === f!.parentId)) forced.add(f.id)
  const isOpen = (id: string) => openFolders.includes(id) || forced.has(id)
  const toggle = (id: string) => set({ openFolders: openFolders.includes(id) ? openFolders.filter((x) => x !== id) : [...openFolders, id] })
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true })
  const count = (id: string) => { const ids = descendants(folders, id); return decks.filter((d) => d.folderId && ids.has(d.folderId)).length }

  const Node = ({ f, depth }: { f: Folder; depth: number }) => {
    const kids = folders.filter((x) => x.parentId === f.id).sort(byName)
    const ds = decks.filter((d) => d.folderId === f.id).sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))
    const open = isOpen(f.id)
    return (
      <div className="tnode">
        <div className={`trow ${loc.pathname === `/folder/${f.id}` ? 'active' : ''}`} style={{ paddingLeft: 4 + depth * 14 }}>
          <button className={`twist ${open ? 'open' : ''}`} onClick={() => toggle(f.id)} aria-label={open ? 'Collapse' : 'Expand'} disabled={!kids.length && !ds.length}>
            <Icon name="down2" size={14} />
          </button>
          <Link to={`/folder/${f.id}`}><Icon name="folder" /><span className="t">{f.name}</span><span className="n">{count(f.id)}</span></Link>
        </div>
        <Collapse open={open}>
          <>
            {kids.map((k) => <Node key={k.id} f={k} depth={depth + 1} />)}
            {ds.map((d) => (
              <Link key={d.id} to={`/deck/${d.id}`} className={`tdeck ${loc.pathname.startsWith(`/deck/${d.id}`) ? 'active' : ''}`} style={{ paddingLeft: 30 + depth * 14 }}>
                <span className="t">{d.title}</span>
              </Link>
            ))}
          </>
        </Collapse>
      </div>
    )
  }
  const loose = decks.filter((d) => !d.folderId)
  return (
    <>
      <div className="sec">Folders<button onClick={async () => nav(`/folder/${await createFolder('New folder')}?rename=1`)} title="New folder" aria-label="New folder">+</button></div>
      <div className="tree">
        {folders.length === 0 && loose.length === 0 && <div className="empty">Imported decks show up here, grouped by course.</div>}
        {folders.filter((f) => !f.parentId).sort(byName).map((f) => <Node key={f.id} f={f} depth={0} />)}
        {loose.map((d) => (
          <Link key={d.id} to={`/deck/${d.id}`} className={`tdeck ${loc.pathname.startsWith(`/deck/${d.id}`) ? 'active' : ''}`} style={{ paddingLeft: 12 }}><span className="t">{d.title}</span></Link>
        ))}
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

function AccountButton({ onOpen }: { onOpen: () => void }) {
  const { user, status } = useAccount()
  if (!accountsEnabled) {
    return <><span className="avatar" title="Guest mode: everything is saved in this browser">G</span><span className="who lbl">Guest</span></>
  }
  const name = user?.email?.split('@')[0] ?? 'Guest'
  return (
    <button className="acct" onClick={onOpen} title={user ? `${user.email} · ${status}` : 'Sign in to sync across devices'}>
      <span className="avatar">{user ? name[0].toUpperCase() : 'G'}{user && <span className={`syncdot ${status}`} />}</span>
      <span className="who lbl">{user ? name : <>Guest <span className="signin">Sign in</span></>}</span>
    </button>
  )
}
