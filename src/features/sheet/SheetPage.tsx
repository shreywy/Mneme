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
import { confirmAction } from '../../ui/confirm'
import { toast } from '../../ui/toasts'
import { PageSettings } from '../page/PageSettings'
import { Canvas } from './Canvas'
import { ReadView } from './ReadView'
import { PaperSettings } from './PaperSettings'

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
  useEffect(() => { if (sheetId) void sheets.updateSheet(sheetId, { lastOpenedAt: Date.now() }) }, [sheetId])
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
        <Seg className="sheet-mode" value={mode} onChange={setMode} options={[{ value: 'read', label: 'Read' }, { value: 'canvas', label: 'Canvas' }]} />
        <DropMenu label="More for this page" button={({ open, toggle }) => <button className="btn sm ghost" aria-label="More for this page" aria-expanded={open} onClick={toggle}><Icon name="more" /></button>}>
          {(close) => <>
            <button role="menuitem" onClick={() => { close(); setRenaming(true) }}><Icon name="edit" size={15} />Rename</button>
            <button role="menuitem" onClick={() => { close(); setDialog('settings') }}><Icon name="gear" size={15} />Page settings…</button>
            <div className="ctx-sep" role="separator" />
            <button role="menuitem" onClick={async () => { close(); await sheets.setSheetArchived(sheet.id, true); toast('Page archived', 'Find it under Archive in the sidebar', 'archive'); nav('/') }}><Icon name="archive" size={15} />Archive</button>
            <button role="menuitem" className="danger" onClick={async () => {
              close()
              if (!await confirmAction({ title: `Delete "${sheet.title}"?`, body: 'The page and everything on it are removed for good. Archiving keeps it instead.', confirm: 'Delete page', danger: true })) return
              nav('/')
              await sheets.deleteSheet(sheet.id)
              toast('Page deleted')
            }}><Icon name="trash" size={15} />Delete…</button>
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
