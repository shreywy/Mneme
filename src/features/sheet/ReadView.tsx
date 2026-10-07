import { useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { kidsOf } from '../../data/subpages'
import * as sheets from '../../data/sheets'
import { readingOrder } from '../../sheets/order'
import type { SheetBlock, SheetRow, SheetStroke } from '../../sheets/types'
import { BlockInk } from './Ink'
import { fontCss } from '../../sheets/fonts'
import { Icon } from '../../ui/Icons'
import { usePaperTheme } from './Canvas'
import { PagePickerHost, TableSizeHost } from './editor/nodes'
import { TextBlock } from './TextBlock'
import { Toolbar } from './Toolbar'
import { InsertPanel } from './Dock'
import { useSheetUI } from './store'

/** The page as one column (the default on phones). Tap a block to edit it there; Edit jumps to the end of the main text. */
export function ReadView({ sheet, blocks, strokes }: { sheet: SheetRow; blocks: SheetBlock[]; strokes: SheetStroke[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const unit = sheet.paper.spacing
  const main = blocks.find((b) => b.role === 'main')
  const inserting = useSheetUI((st) => st.insertOpen)
  const theme = usePaperTheme(sheet)
  return (
    <>
    <div className="sheet-read-bar"><Toolbar mainBlockId={main?.id} /></div>
    {inserting && <div className="sheet-read-insert"><InsertPanel /></div>}
    <div className={`sheet-read-host ${theme}`} style={{ '--page-font': fontCss(sheet.paper.font), background: sheet.paper.paperColor ?? undefined } as React.CSSProperties}>
    <div className="page sheet-read">
      {readingOrder(blocks.filter((b) => b.kind !== 'bookmark')).map((b) => b.kind === 'box' ? <BoxRead key={b.id} block={b} /> : (
        <div key={b.id} data-block-id={b.id} className={`rblock ${b.role === 'main' ? '' : 'rside'}`} onClick={() => setEditing(b.id)}>
          <TextBlock block={b} unit={unit} autoFocus={editing === b.id}
            onDoc={(doc) => sheets.saveBlockDoc(b.id, doc)} onHeight={() => {}} onBlur={(doc) => { setEditing((e) => (e === b.id ? null : e)); void (b.role !== 'main' && sheets.isEmptyDoc(doc) ? sheets.deleteBlock(b.id) : sheets.saveBlockDoc(b.id, doc)) }} />
          <BlockInk strokes={strokes.filter((s) => s.blockId === b.id)} />
        </div>
      ))}
      {main && editing === null && <button className="sheet-edit" onClick={() => setEditing(main.id)}><Icon name="edit" size={18} />Edit</button>}
      <PagePickerHost exclude={sheet.id} />
      <TableSizeHost />
    </div>
    </div>
    </>
  )
}

/** A box in the one-column view: its title and its pages as links. */
function BoxRead({ block }: { block: SheetBlock }) {
  const kids = useLiveQuery(async () => (await kidsOf(block.sheetId)).filter((s) => s.box === block.id), [block.sheetId, block.id]) ?? []
  return (
    <section className="rblock rbox">
      <h3>{block.data.label || 'Pages'}</h3>
      {kids.length ? <ul>{kids.map((k) => <li key={k.id}><Link to={`/write/${k.id}`} data-page-kind="sheet" data-page-id={k.id} data-page-title={k.title}>{k.title}</Link></li>)}</ul> : <p className="muted">No pages yet.</p>}
    </section>
  )
}
