import { useState } from 'react'
import * as sheets from '../../data/sheets'
import { readingOrder } from '../../sheets/order'
import type { SheetBlock, SheetRow } from '../../sheets/types'
import { Icon } from '../../ui/Icons'
import { TextBlock } from './TextBlock'

/** The page as one column (the default on phones). Tap a block to edit it there; Edit jumps to the end of the main text. */
export function ReadView({ sheet, blocks }: { sheet: SheetRow; blocks: SheetBlock[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const unit = sheet.paper.spacing
  const main = blocks.find((b) => b.role === 'main')
  return (
    <div className="page sheet-read">
      {readingOrder(blocks).map((b) => (
        <div key={b.id} className={`rblock ${b.role === 'main' ? '' : 'rside'}`} onClick={() => setEditing(b.id)}>
          <TextBlock block={b} unit={unit} autoFocus={editing === b.id}
            onDoc={(doc) => sheets.saveBlockDoc(b.id, doc)} onHeight={() => {}} onBlur={(doc) => { setEditing((e) => (e === b.id ? null : e)); void (b.role !== 'main' && sheets.isEmptyDoc(doc) ? sheets.deleteBlock(b.id) : sheets.saveBlockDoc(b.id, doc)) }} />
        </div>
      ))}
      {main && editing === null && <button className="sheet-edit" onClick={() => setEditing(main.id)}><Icon name="edit" size={18} />Edit</button>}
    </div>
  )
}
