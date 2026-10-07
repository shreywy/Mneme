import { useEffect, useRef, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Folder } from '../data/db'
import { listNotes } from '../data/notes'
import { groupByUnit, PAGE_DRAG, pageIcon, pagesOf, pageUrl, topLevel, type Page, type PageKind } from '../data/pages'
import { createSheet, listSheets, updateSheet } from '../data/sheets'
import { createFolder, deleteFolder, descendants, listArchive, listLibrary, moveFolder, renameFolder } from '../data/repo'
import { useSettings } from '../settings/store'
import { Icon, Wordmark } from '../ui/Icons'
import { isTyping, useUI } from './ui'
import { Collapse } from '../ui/motion'
import { accountsEnabled, displayName, useAccount } from '../sync/account'
import { useProfile } from '../sync/profile'
import { Avatar } from '../ui/Avatar'
import { useContextItems } from '../ui/ContextMenu'
import { askName, confirmAction } from '../ui/confirm'
import { toast } from '../ui/toasts'
import { setNoteArchived, updateNote } from '../data/notes'
import { renameDeck, setArchived } from '../data/repo'
import { placePage } from '../data/arrange'
import { db } from '../data/db'
import { createSubPage, ensureBox, moveIntoBox, moveOutALevel } from '../data/subpages'
import { ancestors, parentsOf } from '../sheets/tree'
import { archiveSheet, deleteWithUndo } from './trash'
import { listTrash, purgeTrash } from '../data/trash'

export function Shell() {
  const { sidebar, set } = useSettings()
  const { focus, setFocus, peek, setPeek, open, drawer, setDrawer } = useUI()
  const loc = useLocation()
  useEffect(() => { if (!/^\/(settings|account)(\/|$)/.test(loc.pathname)) useUI.setState({ lastPage: loc.pathname + loc.search }) }, [loc.pathname, loc.search])
  useEffect(() => { setDrawer(false) }, [loc.pathname, setDrawer])
  // Things deleted more than a few days ago go for good, once per visit.
  useEffect(() => { void purgeTrash().catch(() => { /* tried again next visit */ }) }, [])
  const syncStatus = useAccount((a) => a.status)
  const toldFull = useRef(false)
  useEffect(() => {
    if (syncStatus !== 'full' || toldFull.current) return
    toldFull.current = true
    toast('Your cloud space is full', "Delete pages or decks you don't need. New changes stay on this device until then.", 'x')
  }, [syncStatus])
  const rail = sidebar === 'rail'
  const newPage = useNewPage()
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
          <button className="side-new" onClick={() => newPage()} title="Start a blank page for writing">
            <Icon name="plus" /><span className="lbl">New page</span>
          </button>
          <nav className="nav">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}><Icon name="lib" /><span className="lbl">Library</span></NavLink>
            <button onClick={() => open('prompt')}><Icon name="prompt" /><span className="lbl">Get the LLM prompt</span></button>
            <button onClick={() => open('import')}><Icon name="upload" /><span className="lbl">Import</span></button>
          </nav>
          <FolderTree />
          <PageMenu />
          <div className="foot">
            <AccountButton />
            <Link to="/docs" className="iconbtn" onClick={() => setDrawer(false)} title="Help and docs" aria-label="Help and docs"><Icon name="help" /></Link>
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

/** Start a blank page and open it. With no folder given, it goes in the folder you're looking at. */
export function useNewPage() {
  const nav = useNavigate()
  const loc = useLocation()
  const setDrawer = useUI((s) => s.setDrawer)
  return async (folderId?: string | null, unit?: string) => {
    const here = loc.pathname.startsWith('/folder/') ? loc.pathname.split('/')[2] : null
    setDrawer(false)
    nav(`/write/${await createSheet({ folderId: folderId === undefined ? here : folderId, unit, paper: useSettings.getState().paperDefault ?? undefined })}`)
  }
}

/** Right-click in the sidebar: folders, unit headings and empty space. Pages get PageMenu. */
function useSideMenu({ folders, newPage, openDialog }: { folders: Folder[]; newPage: ReturnType<typeof useNewPage>; openDialog: ReturnType<typeof useUI.getState>['open'] }) {
  const nav = useNavigate()
  const newFolder = async (parentId: string | null) => nav(`/folder/${await createFolder('New folder', parentId)}?rename=1`)
  useContextItems((_e, { target }) => {
    if (!target.closest('.side') || target.closest('[data-page-id], input, textarea, .foot')) return null
    const settings = useSettings.getState()
    const row = target.closest<HTMLElement>('[data-folder-id]')
    const f = row && folders.find((x) => x.id === row.dataset.folderId)
    if (f) {
      const open = settings.openFolders.includes(f.id)
      const inside = () => location.pathname.startsWith('/folder/') && descendants(folders, f.id).has(location.pathname.split('/')[2])
      return [
        { label: 'Open', icon: 'folder', onSelect: () => nav(`/folder/${f.id}`) },
        { label: open ? 'Collapse' : 'Expand', icon: 'down2', onSelect: () => settings.set({ openFolders: open ? settings.openFolders.filter((x) => x !== f.id) : [...settings.openFolders, f.id] }) },
        { sep: true as const },
        { label: 'New page here', icon: 'plus', onSelect: () => newPage(f.id) },
        { label: 'New subfolder', icon: 'folder', onSelect: () => newFolder(f.id) },
        { sep: true as const },
        { label: 'Rename…', icon: 'edit', onSelect: async () => { const name = await askName({ title: 'Rename folder', value: f.name, confirm: 'Rename' }); if (name) await renameFolder(f.id, name) } },
        ...(f.parentId ? [{ label: 'Move to top level', icon: 'upload', onSelect: async () => { await moveFolder(f.id, null); toast('Folder moved', 'It now sits at the top level') } }] : []),
        {
          label: 'Archive…', icon: 'archive', onSelect: async () => {
            if (!await confirmAction({ title: `Archive "${f.name}"?`, body: 'The folder and everything in it leave the library. Progress is kept, and you can restore it from Archive.', confirm: 'Archive folder' })) return
            const leave = inside()
            await setArchived('folder', f.id, true); toast('Folder archived', 'Find it under Archive in the sidebar', 'archive')
            if (leave) nav('/')
          },
        },
        {
          label: 'Remove folder…', icon: 'trash', danger: true, onSelect: async () => {
            if (!await confirmAction({ title: `Remove the folder "${f.name}"?`, body: 'Only the folder goes. Its pages and subfolders move up one level.', confirm: 'Remove folder', danger: true })) return
            const onIt = location.pathname === `/folder/${f.id}`
            await deleteFolder(f.id); toast('Folder removed')
            if (onIt) nav(f.parentId ? `/folder/${f.parentId}` : '/')
          },
        },
      ]
    }
    const unitEl = target.closest<HTMLElement>('[data-unit]')
    const unitItems = unitEl?.dataset.unit
      ? [{ label: `New page in ${unitEl.dataset.unit}`, icon: 'plus', onSelect: () => newPage(unitEl.dataset.unitFolder || null, unitEl.dataset.unit) }, { sep: true as const }]
      : []
    const rail = settings.sidebar === 'rail'
    return [
      ...unitItems,
      { label: 'New page', icon: 'plus', onSelect: () => newPage() },
      { label: 'New folder', icon: 'folder', onSelect: () => newFolder(null) },
      { label: 'Import', icon: 'upload', onSelect: () => openDialog('import') },
      { label: 'Get the LLM prompt', icon: 'prompt', onSelect: () => openDialog('prompt') },
      { sep: true as const },
      ...(settings.openFolders.length ? [{ label: 'Collapse all folders', icon: 'down2', onSelect: () => settings.set({ openFolders: [] }) }] : []),
      { label: rail ? 'Pin the sidebar open' : 'Collapse the sidebar', icon: rail ? 'pin' : 'chev', kbd: '[', onSelect: () => settings.set({ sidebar: rail ? 'full' : 'rail' }) },
    ]
  })
}

function FolderTree() {
  const data = useLiveQuery(async () => {
    const t = await listTrash()
    const sheets = await listSheets()
    // Boxes on pages that have sub-pages: their titles are the headings under those pages.
    const parents = [...new Set(sheets.map((s) => s.parentId).filter((x): x is string => !!x))]
    const boxes = parents.length ? (await db.sheetBlocks.where('sheetId').anyOf(parents).toArray()).filter((b) => b.kind === 'box') : []
    return { ...(await listLibrary()), notes: await listNotes(), sheets, boxes, archived: await listArchive(), trashed: t.decks.length + t.notes.length + t.sheets.length }
  }, [])
  const loc = useLocation()
  const nav = useNavigate()
  const newPage = useNewPage()
  const { openFolders, set } = useSettings()
  const openDialog = useUI((s) => s.open)
  useSideMenu({ folders: data?.folders ?? [], newPage, openDialog })
  if (!data) return <div className="tree" />
  const { folders, decks, notes } = data
  const pages = pagesOf(decks, notes, data.sheets)
  const archivedCount = data.archived.folders.length + data.archived.decks.length + data.archived.notes.length + data.archived.sheets.length + data.trashed
  const isActive = (p: Page) => loc.pathname.startsWith(pageUrl(p))
  // Keep the path to the open page or folder expanded.
  const activePage = pages.find(isActive)
  const activeFolder = loc.pathname.startsWith('/folder/') ? loc.pathname.split('/')[2] : activePage?.folderId
  const forced = new Set<string>()
  for (let f = folders.find((x) => x.id === activeFolder); f; f = folders.find((x) => x.id === f!.parentId)) forced.add(f.id)
  if (activePage?.kind === 'sheet') for (const a of ancestors(activePage.id, parentsOf(data.sheets))) forced.add(a)
  const isOpen = (id: string) => openFolders.includes(id) || forced.has(id)
  const toggle = (id: string) => set({ openFolders: openFolders.includes(id) ? openFolders.filter((x) => x !== id) : [...openFolders, id] })
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true })
  const count = (id: string) => { const ids = descendants(folders, id); return pages.filter((p) => p.folderId && ids.has(p.folderId)).length }
  /** The pages of one group (a folder and a unit), in the order shown. */
  const groupOf = (folderId: string | null, unit: string | null) =>
    (groupByUnit(topLevel(pages).filter((x) => x.folderId === folderId)).find((g) => (g.unit ?? null)?.toLowerCase() === unit?.toLowerCase())?.pages ?? [])
  const dragged = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(PAGE_DRAG)
    if (!raw) return null
    const { kind, id } = JSON.parse(raw) as { kind: PageKind; id: string }
    return pages.find((x) => x.kind === kind && x.id === id) ?? null
  }
  const settle = async (page: Page, folderId: string | null, unit: string | null, list: Page[]) => {
    const before = `${page.folderId}|${page.unit ?? ''}`
    await placePage(page, { folderId, unit }, list.map((x) => ({ kind: x.kind, id: x.id })))
    if (before !== `${folderId}|${unit ?? ''}`) {
      const where = folderId ? folders.find((f) => f.id === folderId)?.name ?? 'folder' : 'no folder'
      toast(`Moved "${page.title}"`, unit ? `${where} · ${unit}` : where)
    }
  }
  const allowDrop = (e: React.DragEvent) => { if (e.dataTransfer.types.includes(PAGE_DRAG)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; return true } return false }
  const clear = (el: HTMLElement) => el.classList.remove('drop-over', 'drop-before', 'drop-after')

  /** Folder rows, unit headings and the Folders header: the page goes to the end of that group. */
  const drop = (to: { folderId: string | null; unit?: string | null }) => ({
    onDragOver: (e: React.DragEvent) => { if (allowDrop(e)) (e.currentTarget as HTMLElement).classList.add('drop-over') },
    onDragLeave: (e: React.DragEvent) => clear(e.currentTarget as HTMLElement),
    onDrop: async (e: React.DragEvent) => {
      clear(e.currentTarget as HTMLElement)
      const page = dragged(e)
      if (!page) return
      e.preventDefault()
      const unit = to.unit !== undefined ? to.unit : page.unit ?? null // folders keep the page's unit
      const list = groupOf(to.folderId, unit).filter((x) => !(x.kind === page.kind && x.id === page.id))
      await settle(page, to.folderId, unit, [...list, page])
    },
  })
  const kidsOfPage = (id: string) => pages.filter((x) => x.kind === 'sheet' && x.parentId === id)
  const rankSort = (a: Page, b: Page) => ((a.kind === 'sheet' ? a.sheet.rank : undefined) ?? Infinity) - ((b.kind === 'sheet' ? b.sheet.rank : undefined) ?? Infinity) || a.title.localeCompare(b.title, undefined, { numeric: true })
  const refuse = (ok: boolean) => { if (!ok) toast("Can't put a page inside its own sub-page") }
  const onlySheets = () => toast('Only pages you write can go under a page')
  /** A box heading under a page: the dropped page goes to the end of that box. */
  const dropIntoBox = (parentId: string, boxId: string) => ({
    onDragOver: (e: React.DragEvent) => { if (allowDrop(e)) (e.currentTarget as HTMLElement).classList.add('drop-over') },
    onDragLeave: (e: React.DragEvent) => clear(e.currentTarget as HTMLElement),
    onDrop: async (e: React.DragEvent) => {
      clear(e.currentTarget as HTMLElement)
      const page = dragged(e)
      if (!page) return
      e.preventDefault()
      if (page.kind !== 'sheet') return onlySheets()
      refuse(await moveIntoBox(page.id, parentId, boxId))
    },
  })
  /**
   * A page in the list: drop above or below it to join its group (or its box, for a sub-page). A page
   * dropped on the middle of another page goes inside it.
   */
  const dropOnPage = (target: Page) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!allowDrop(e)) return
      const el = e.currentTarget as HTMLElement, r = el.getBoundingClientRect()
      // dragover can't read the data, only its types: the kind rides along as a type of its own.
      const nest = target.kind === 'sheet' && e.dataTransfer.types.includes(`${PAGE_DRAG}-sheet`)
      const at = (e.clientY - r.top) / r.height
      const zone = nest ? (at < 0.3 ? 'before' : at > 0.7 ? 'after' : 'over') : at < 0.5 ? 'before' : 'after'
      el.classList.toggle('drop-before', zone === 'before'); el.classList.toggle('drop-after', zone === 'after'); el.classList.toggle('drop-over', zone === 'over')
    },
    onDragLeave: (e: React.DragEvent) => clear(e.currentTarget as HTMLElement),
    onDrop: async (e: React.DragEvent) => {
      const el = e.currentTarget as HTMLElement
      const after = el.classList.contains('drop-after'), into = el.classList.contains('drop-over')
      clear(el)
      const page = dragged(e)
      if (!page || (page.kind === target.kind && page.id === target.id)) return
      e.preventDefault()
      if (into && target.kind === 'sheet') {
        if (page.kind !== 'sheet') return onlySheets()
        const ok = await moveIntoBox(page.id, target.id, await ensureBox(target.id))
        refuse(ok)
        if (ok) toast(`Moved into "${target.title}"`)
        return
      }
      if (target.kind === 'sheet' && target.parentId) {
        // Next to a sub-page: into the same box, in that place.
        if (page.kind !== 'sheet') return onlySheets()
        const box = target.sheet.box ?? await ensureBox(target.parentId)
        const list = kidsOfPage(target.parentId).filter((k) => k.kind === 'sheet' && k.sheet.box === target.sheet.box && k.id !== page.id).sort(rankSort)
        list.splice(list.findIndex((x) => x.id === target.id) + (after ? 1 : 0), 0, page)
        refuse(await moveIntoBox(page.id, target.parentId, box, list.map((x) => x.id)))
        return
      }
      const unit = target.unit ?? null
      const list = groupOf(target.folderId, unit).filter((x) => !(x.kind === page.kind && x.id === page.id))
      const at = list.findIndex((x) => x.kind === target.kind && x.id === target.id) + (after ? 1 : 0)
      list.splice(at, 0, page)
      await settle(page, target.folderId, unit, list)
    },
  })
  const PageLink = ({ p, pad }: { p: Page; pad: number }) => {
    const kids = p.kind === 'sheet' ? kidsOfPage(p.id) : []
    const link = (
      <Link to={pageUrl(p)} className={`tdeck ${isActive(p) ? 'active' : ''}`} style={{ paddingLeft: kids.length ? 2 : pad }} title={p.kind === 'note' ? `Notes: ${p.title}` : p.title} data-page-kind={p.kind} data-page-id={p.id} data-page-title={p.title}
        data-page-folder={p.folderId ?? ''} data-page-unit={p.unit ?? ''}
        {...(p.kind === 'sheet' && p.parentId ? { 'data-page-parent': p.parentId, 'data-page-box': p.sheet.box ?? '' } : {})}
        draggable onDragStart={(e) => { e.dataTransfer.setData(PAGE_DRAG, JSON.stringify({ kind: p.kind, id: p.id })); e.dataTransfer.setData(`${PAGE_DRAG}-${p.kind}`, ''); e.dataTransfer.effectAllowed = 'move' }}
        {...dropOnPage(p)}>
        <Icon name={pageIcon(p.kind)} size={13} /><span className="t">{p.title}</span>
      </Link>
    )
    if (!kids.length) return link
    const open = isOpen(p.id)
    // The twist sits left of the row, which can't go below 0 at the top level: indent from where the icon really is.
    const inner = Math.max(pad, 20) + 14
    // Sub-pages grouped by box, in the boxes' order on the page; any whose box is missing come last, unlabelled.
    const boxes = data.boxes.filter((b) => b.sheetId === p.id).sort((a, b) => a.y - b.y || a.x - b.x)
    const known = new Set(boxes.map((b) => b.id))
    const inBox = (k: Page, id: string | null) => k.kind === 'sheet' && (id ? k.sheet.box === id : !(k.sheet.box && known.has(k.sheet.box)))
    const groups = [...boxes, null].map((b) => ({ b, list: kids.filter((k) => inBox(k, b?.id ?? null)).sort(rankSort) })).filter((g) => g.list.length)
    return (
      <div className="tsub">
        <div className="tsubrow" style={{ paddingLeft: Math.max(0, pad - 20) }}>
          <button className={`twist ${open ? 'open' : ''}`} onClick={() => toggle(p.id)} aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open}><Icon name="down2" size={13} /></button>
          {link}
        </div>
        <Collapse open={open}>
          <>{groups.map((g) => (
            <div key={g.b?.id ?? '-'}>
              {g.b?.data.label && <div className="tunit" style={{ paddingLeft: inner + 2 }} {...dropIntoBox(p.id, g.b.id)}>{g.b.data.label}</div>}
              {g.list.map((k) => <PageLink key={k.id} p={k} pad={inner} />)}
            </div>
          ))}</>
        </Collapse>
      </div>
    )
  }
  const PageList = ({ list, pad, folderId }: { list: Page[]; pad: number; folderId: string | null }) => {
    const groups = groupByUnit(list)
    const labelled = groups.some((g) => g.unit)
    return <>{groups.map((g) => (
      <div key={g.unit ?? '-'}>
        {labelled && <div className="tunit" style={{ paddingLeft: pad + 2 }} data-unit={g.unit ?? ''} data-unit-folder={folderId ?? ''} {...drop({ folderId, unit: g.unit ?? null })}>{g.unit ?? 'No unit'}</div>}
        {g.pages.map((p) => <PageLink key={p.id} p={p} pad={pad} />)}
      </div>
    ))}</>
  }

  const Node = ({ f, depth }: { f: Folder; depth: number }) => {
    const kids = folders.filter((x) => x.parentId === f.id).sort(byName)
    const ps = topLevel(pages).filter((p) => p.folderId === f.id)
    const open = isOpen(f.id)
    return (
      <div className="tnode">
        <div className={`trow ${loc.pathname === `/folder/${f.id}` ? 'active' : ''}`} style={{ paddingLeft: 4 + depth * 14 }} data-folder-id={f.id}>
          <button className={`twist ${open ? 'open' : ''}`} onClick={() => toggle(f.id)} aria-label={open ? 'Collapse' : 'Expand'}>
            <Icon name="down2" size={14} />
          </button>
          <Link to={`/folder/${f.id}`} {...drop({ folderId: f.id })}><Icon name="folder" /><span className="t">{f.name}</span><span className="n">{count(f.id)}</span></Link>
          <button className="tadd" onClick={() => newPage(f.id)} title={`New page in ${f.name}`} aria-label={`New page in ${f.name}`}><Icon name="plus" size={13} /></button>
        </div>
        <Collapse open={open}>
          <>
            {kids.map((k) => <Node key={k.id} f={k} depth={depth + 1} />)}
            <PageList list={ps} pad={30 + depth * 14} folderId={f.id} />
            <button className="tnew" style={{ paddingLeft: 30 + depth * 14 }} onClick={() => newPage(f.id)}><Icon name="plus" size={13} /><span className="t">New page</span></button>
          </>
        </Collapse>
      </div>
    )
  }
  const loose = topLevel(pages).filter((p) => !p.folderId)
  return (
    <>
      <div className="sec" {...drop({ folderId: null })} title="Drop a page here to take it out of its folder">Folders<button onClick={async () => nav(`/folder/${await createFolder('New folder')}?rename=1`)} title="New folder" aria-label="New folder">+</button></div>
      <div className="tree">
        {folders.length === 0 && loose.length === 0 && <div className="empty">Decks, notes and pages you write show up here, grouped by course.</div>}        {folders.filter((f) => !f.parentId).sort(byName).map((f) => <Node key={f.id} f={f} depth={0} />)}
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
  const newPage = useNewPage()
  useContextItems((_e, { target }) => {
    const el = target.closest<HTMLElement>('[data-page-id]')
    if (!el) return null
    const kind = el.dataset.pageKind as PageKind, id = el.dataset.pageId!, title = el.dataset.pageTitle ?? ''
    const url = pageUrl({ kind, id })
    const noun = kind === 'deck' ? 'Deck' : kind === 'note' ? 'Notes' : 'Page'
    const rename = async () => {
      const name = await askName({ title: `Rename ${noun.toLowerCase()}`, value: title, confirm: 'Rename' })
      if (!name || name === title) return
      if (kind === 'deck') await renameDeck(id, name)
      else if (kind === 'note') await updateNote(id, { title: name })
      else await updateSheet(id, { title: name, titleAuto: false })
    }
    // Sidebar rows say where they sit, so a new page can go next to them.
    const paper = () => useSettings.getState().paperDefault ?? undefined
    const parent = el.dataset.pageParent
    const here = parent
      ? [{ label: 'New page here', icon: 'plus', onSelect: async () => nav(`/write/${await createSubPage(parent, el.dataset.pageBox || await ensureBox(parent), paper())}`) }]
      : el.dataset.pageFolder !== undefined
        ? [{ label: 'New page here', icon: 'plus', onSelect: () => newPage(el.dataset.pageFolder || null, el.dataset.pageUnit || undefined) }]
        : []
    const tree = kind === 'sheet' ? [
      { label: 'New sub-page', icon: 'plus', onSelect: async () => nav(`/write/${await createSubPage(id, await ensureBox(id), paper())}`) },
      ...(parent ? [{ label: 'Move out a level', icon: 'upload', onSelect: async () => { await moveOutALevel(id); toast('Moved out a level') } }] : []),
    ] : []
    return [
      { label: 'Open', icon: pageIcon(kind), onSelect: () => nav(url) },
      { label: 'Open in a new tab', icon: 'external', onSelect: () => { window.open(url, '_blank', 'noopener') } },
      ...here,
      ...tree,
      { label: 'Rename…', icon: 'edit', onSelect: rename },
      ...(kind === 'deck' ? [
        { sep: true as const },
        { label: 'Learn', icon: 'loop', onSelect: () => nav(`${url}/learn`) },
        { label: 'Flashcards', icon: 'flip', onSelect: () => nav(`${url}/flashcards`) },
        { label: 'Test', icon: 'check', onSelect: () => nav(`${url}/test`) },
      ] : []),
      ...(kind !== 'sheet' ? [{ label: 'Make a cheat sheet', icon: 'list', onSelect: () => nav(`/cheatsheet?${kind === 'deck' ? 'd' : 'n'}=${id}`) }] : []),
      { sep: true as const },
      { label: 'Archive', icon: 'archive', onSelect: async () => { if (kind === 'sheet') { await archiveSheet(id); return } await (kind === 'deck' ? setArchived('deck', id, true) : setNoteArchived(id, true)); toast(`${noun} archived`, 'Find it under Archive in the sidebar', 'archive') } },
      {
        label: 'Delete', icon: 'trash', danger: true, onSelect: async () => {
          const here = location.pathname.startsWith(url)
          if (await deleteWithUndo(kind, id) && here) nav('/')
        },
      },
    ]
  })
  return null
}

/** "Back" for pages you visit and leave (Settings, Account): returns to where you were. */
export function BackButton() {
  const nav = useNavigate()
  const lastPage = useUI((s) => s.lastPage)
  return <button className="btn sm ghost back-btn" onClick={() => nav(lastPage || '/')}><Icon name="chev" />Back</button>
}
