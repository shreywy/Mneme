import { useState } from 'react'
import * as sheets from '../../data/sheets'
import { readingOrder } from '../../sheets/order'
import type { SheetBlock, SheetRow } from '../../sheets/types'
import { fontCss } from '../../sheets/fonts'
import { Icon } from '../../ui/Icons'
import { usePaperTheme } from './Canvas'
import { PagePickerHost, TableSizeHost } from './editor/nodes'
import { TextBlock } from './TextBlock'
import { Toolbar } from './Toolbar'
import { InsertPanel } from './Dock'
import { useSheetUI } from './store'

/** The page as one column (the default on phones). Tap a block to edit it there; Edit jumps to the end of the main text. */
export function ReadView({ sheet, blocks }: { sheet: SheetRow; blocks: SheetBlock[] }) {
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
      {readingOrder(blocks.filter((b) => b.kind === 'text')).map((b) => (
        <div key={b.id} data-block-id={b.id} className={`rblock ${b.role === 'main' ? '' : 'rside'}`} onClick={() => setEditing(b.id)}>
          <TextBlock block={b} unit={unit} autoFocus={editing === b.id}
            onDoc={(doc) => sheets.saveBlockDoc(b.id, doc)} onHeight={() => {}} onBlur={(doc) => { setEditing((e) => (e === b.id ? null : e)); void (b.role !== 'main' && sheets.isEmptyDoc(doc) ? sheets.deleteBlock(b.id) : sheets.saveBlockDoc(b.id, doc)) }} />
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
