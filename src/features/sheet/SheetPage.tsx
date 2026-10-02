import { deleteWithUndo } from '../../app/trash'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import '../../styles/sheet.css'
import { TopBar } from '../../app/Shell'
import { db } from '../../data/db'
import * as sheets from '../../data/sheets'
import { Icon } from '../../ui/Icons'
import { Seg } from '../../ui/controls'
import { DropMenu } from '../../ui/DropMenu'
import { toast } from '../../ui/toasts'
import { PageSettings } from '../page/PageSettings'
import { Canvas } from './Canvas'
import { ReadView } from './ReadView'
import { PaperSettings } from './PaperSettings'
import { readingOrder } from '../../sheets/order'
import type { SheetBlock } from '../../sheets/types'
import { useSheetUI } from './store'
import type { SheetRow } from '../../sheets/types'
import { useAccount } from '../../sync/account'
import { relTime } from '../../data/stats'

const PHONE = '(max-width: 767px)'

/** A page the user writes: the canvas on desktop, Read view on phones. */
export function SheetPage() {
  const { sheetId = '' } = useParams()
  const nav = useNavigate()
  const sheet = useLiveQuery(() => sheets.getSheet(sheetId), [sheetId], null)
  const blocks = useLiveQuery(() => sheets.blocksFor(sheetId), [sheetId])
  const folders = useLiveQuery(() => db.folders.toArray(), [])
  const [mode, setMode] = useState<'canvas' | 'read'>(() => (matchMedia(PHONE).matches ? 'read' : 'canvas'))
  const [dialog, setDialog] = useState<null | 'settings'>(null)
  const [renaming, setRenaming] = useState(false)
  useEffect(() => { if (sheetId) void sheets.markOpened(sheetId) }, [sheetId])
  // useLiveQuery keeps the previous page's result until the new one arrives.
  if (sheet === null || blocks === undefined || blocks.some((b) => b.sheetId !== sheetId)) return null
  if (!sheet) return <><TopBar crumbs={<b>Page</b>} /><div className="page"><h1 className="title">Page not found</h1><p className="muted" style={{ marginTop: 10 }}>It may have been deleted on another device.</p></div></>

  const folder = folders?.find((f) => f.id === sheet.folderId)
  const rename = (title: string) => {
    const t = title.trim()
    setRenaming(false)
    if (t && t !== sheet.title) void sheets.updateSheet(sheet.id, { title: t, titleAuto: false })
  }
  return (
    <>
      <TopBar crumbs={<>
        {folder && <>{folder.name} / </>}
        {renaming
          ? <input className="input crumb-input" autoFocus defaultValue={sheet.title} aria-label="Page title" onBlur={(e) => rename(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false) }} />
          : <b onDoubleClick={() => setRenaming(true)} title="Double-click to rename">{sheet.title}</b>}
      </>}>
        <SaveState sheet={sheet} blocks={blocks} />
        <Contents blocks={blocks} unit={sheet.paper.spacing} mode={mode} />
        <Seg className="sheet-mode" value={mode} onChange={setMode} options={[{ value: 'read', label: 'Read' }, { value: 'canvas', label: 'Canvas' }]} />
        <DropMenu label="More for this page" button={({ open, toggle }) => <button className="btn sm ghost" aria-label="More for this page" aria-expanded={open} onClick={toggle}><Icon name="more" /></button>}>
          {(close) => <>
            <button role="menuitem" onClick={() => { close(); setRenaming(true) }}><Icon name="edit" size={15} />Rename</button>
            <button role="menuitem" onClick={() => { close(); setDialog('settings') }}><Icon name="gear" size={15} />Page settings…</button>
            <div className="ctx-sep" role="separator" />
            <button role="menuitem" onClick={async () => { close(); await sheets.setSheetArchived(sheet.id, true); toast('Page archived', 'Find it under Archive in the sidebar', 'archive'); nav('/') }}><Icon name="archive" size={15} />Archive</button>
            <button role="menuitem" className="danger" onClick={async () => {
              close()
              nav('/')
              await deleteWithUndo('sheet', sheet.id)
            }}><Icon name="trash" size={15} />Delete</button>
          </>}
        </DropMenu>
      </TopBar>
      {mode === 'canvas' ? <Canvas key={sheet.id} sheet={sheet} blocks={blocks} /> : <ReadView key={sheet.id} sheet={sheet} blocks={blocks} />}
      {dialog === 'settings' && folders && (
        <PageSettings title={sheet.title} folders={folders} folderId={sheet.folderId} unit={sheet.unit} onClose={() => setDialog(null)}
          onFolder={(folderId) => sheets.updateSheet(sheet.id, { folderId })} onUnit={(unit) => sheets.updateSheet(sheet.id, { unit: unit || undefined })}>
          <PaperSettings paper={sheet.paper} onChange={(paper) => sheets.updateSheet(sheet.id, { paper })} />
        </PageSettings>
      )}
    </>
  )
}

type Entry = { key: string; label: string; level: 0 | 1 | 2 | 3; block: SheetBlock; index: number }
type PMNode = { type?: string; attrs?: { level?: number }; content?: PMNode[]; text?: string }
const textOf = (n: PMNode): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('')

/** Headings (in reading order) and bookmarks (top to bottom). Picking one goes there. */
function Contents({ blocks, unit, mode }: { blocks: SheetBlock[]; unit: number; mode: 'canvas' | 'read' }) {
  const entries: Entry[] = []
  for (const b of readingOrder(blocks.filter((x) => x.kind === 'text'))) {
    let i = 0
    for (const n of ((b.data.doc as PMNode | null)?.content ?? [])) {
      if (n.type !== 'heading') continue
      const label = textOf(n).trim()
      if (label) entries.push({ key: `${b.id}:${i}`, label, level: (n.attrs?.level ?? 1) as 1 | 2 | 3, block: b, index: i })
      i++
    }
  }
  const marks = blocks.filter((b) => b.kind === 'bookmark').sort((a, b) => a.y - b.y || a.x - b.x)
  const go = (b: SheetBlock, index?: number) => {
    const wrap = document.querySelector(`[data-block-id="${b.id}"]`)
    const el = index === undefined ? null : wrap?.querySelectorAll<HTMLElement>('.ProseMirror > h1, .ProseMirror > h2, .ProseMirror > h3')[index]
    if (mode === 'read') { (el ?? wrap)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return }
    useSheetUI.getState().canvas?.jumpTo({ x: b.x * unit, y: b.y * unit + (el?.offsetTop ?? 0) })
  }
  return (
    <DropMenu label="Contents" button={({ open, toggle }) => <button className="btn sm ghost" aria-expanded={open} onClick={toggle} title="Headings and bookmarks"><Icon name="contents" />Contents</button>}>
      {(close) => <div className="contents-menu">
        {!entries.length && !marks.length && <p className="contents-empty">Headings (# Title) and bookmarks show up here so you can jump to them.</p>}
        {entries.map((e) => <button key={e.key} role="menuitem" className={`lv${e.level}`} onClick={() => { close(); go(e.block, e.index) }}>{e.label}</button>)}
        {marks.length > 0 && <>
          {entries.length > 0 && <div className="ctx-sep" role="separator" />}
          {marks.map((m) => <button key={m.id} role="menuitem" onClick={() => { close(); go(m) }}><Icon name="flag" size={14} />{m.data.label}</button>)}
        </>}
      </div>}
    </DropMenu>
  )
}

/**
 * "Saved just now · synced": when this page last changed, and whether that's on your other devices yet.
 * Edits save to this device as you type; signed in, they go up within a couple of seconds.
 */
function SaveState({ sheet, blocks }: { sheet: SheetRow; blocks: SheetBlock[] }) {
  const { user, status, lastSync } = useAccount()
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 15_000); return () => clearInterval(t) }, [])
  const last = Math.max(sheet.updatedAt, ...blocks.map((b) => b.updatedAt))
  const saved = `Saved ${relTime(last)}`
  const [label, tone, hint] = !user
    ? [saved, 'ok', 'Saved in this browser. Sign in to have it on your other devices.']
    : status === 'syncing' ? ['Syncing…', 'busy', 'Sending your latest changes']
      : status === 'offline' ? [`${saved} · offline`, 'warn', 'Saved on this device. It syncs when you’re back online.']
        : status === 'error' ? [`${saved} · not synced`, 'warn', 'Saved on this device. Syncing failed and will try again.']
          : status === 'full' ? [`${saved} · cloud full`, 'warn', 'Saved on this device. Your cloud space is full, so new changes stay here.']
            : lastSync && lastSync < last ? ['Syncing…', 'busy', 'Sending your latest changes']
              : [`${saved} · synced`, 'ok', 'On all your devices']
  return <span className={`save-state ${tone}`} title={hint} aria-live="polite"><i />{label}</span>
}
