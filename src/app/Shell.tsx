import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { createFolder } from '../data/repo'
import { useSettings } from '../settings/store'
import { Icon, Wordmark } from '../ui/Icons'
import { isTyping, useUI } from './ui'

export function Shell() {
  const { sidebar, set } = useSettings()
  const { focus, setFocus, peek, setPeek, open } = useUI()
  const rail = sidebar === 'rail'
  const peekT = useRef<number>(0)
  const unpeekT = useRef<number>(0)
  const hotT = useRef<number>(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      <div className={`app ${rail ? 'rail' : ''} ${rail && peek ? 'peek' : ''} ${focus ? 'focus' : ''}`}>
        <aside className="side" onMouseEnter={onSideEnter} onMouseLeave={onSideLeave}>
          <div className="brand">
            <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}><Wordmark collapsedLabel /></Link>
            <button className="collapse" onClick={() => { set({ sidebar: rail ? 'full' : 'rail' }); setPeek(false) }}
              title={rail ? 'Expand sidebar  [' : 'Collapse sidebar  ['} aria-label="Toggle sidebar"><Icon name="chev" /></button>
          </div>
          <nav className="nav">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}><Icon name="lib" /><span className="lbl">Library</span></NavLink>
            <NavLink to="/notes" className={({ isActive }) => (isActive ? 'active' : '')}><Icon name="notes" /><span className="lbl">Notes</span><span className="soon">soon</span></NavLink>
            <button onClick={() => open('prompt')}><Icon name="prompt" /><span className="lbl">Get the LLM prompt</span></button>
            <button onClick={() => open('import')}><Icon name="upload" /><span className="lbl">Import a deck</span></button>
          </nav>
          <FolderTree />
          <div className="foot">
            <span className="avatar" title="Guest mode: everything is saved in this browser">G</span>
            <span className="who lbl">Guest</span>
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
  const data = useLiveQuery(async () => ({ folders: await db.folders.orderBy('position').toArray(), decks: await db.decks.orderBy('title').toArray() }), [])
  const loc = useLocation()
  const nav = useNavigate()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  if (!data) return <div className="tree" />
  const add = async () => {
    const n = name.trim()
    setAdding(false); setName('')
    if (n) nav(`/folder/${await createFolder(n)}`)
  }
  const loose = data.decks.filter((d) => !d.folderId)
  return (
    <>
      <div className="sec">Folders<button onClick={() => setAdding(true)} title="New folder" aria-label="New folder">+</button></div>
      <div className="tree">
        {adding && (
          <div style={{ padding: '2px 4px 6px' }}>
            <input className="input" autoFocus placeholder="Folder name" value={name} style={{ height: 30 }}
              onChange={(e) => setName(e.target.value)} onBlur={add}
              onKeyDown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { setAdding(false); setName('') } }} />
          </div>
        )}
        {data.folders.length === 0 && loose.length === 0 && !adding && <div className="empty">Imported decks show up here, grouped by course.</div>}
        {data.folders.map((f) => {
          const decks = data.decks.filter((d) => d.folderId === f.id)
          return (
            <div key={f.id}>
              <Link to={`/folder/${f.id}`} className={loc.pathname === `/folder/${f.id}` ? 'active' : ''}>
                <Icon name="folder" /><span className="t">{f.name}</span><span className="n">{decks.length}</span>
              </Link>
              {decks.map((d) => <TreeDeck key={d.id} id={d.id} title={d.title} active={loc.pathname.startsWith(`/deck/${d.id}`)} />)}
            </div>
          )
        })}
        {loose.map((d) => <TreeDeck key={d.id} id={d.id} title={d.title} active={loc.pathname.startsWith(`/deck/${d.id}`)} loose />)}
      </div>
    </>
  )
}

function TreeDeck({ id, title, active, loose }: { id: string; title: string; active: boolean; loose?: boolean }) {
  return <Link to={`/deck/${id}`} className={`${loose ? '' : 'sub'} ${active ? 'active' : ''}`}><span className="t">{title}</span></Link>
}

/** Top bar used by shell pages: breadcrumb on the left, actions on the right. */
export function TopBar({ crumbs, children }: { crumbs: ReactNode; children?: ReactNode }) {
  const { setFocus } = useUI()
  return (
    <div className="top">
      <div className="crumb">{crumbs}</div>
      <span className="grow" />
      {children}
      <button className="btn ghost sm" onClick={() => setFocus(true)} title="Focus mode  F"><Icon name="focus" />Focus<span className="kbd">F</span></button>
    </div>
  )
}
