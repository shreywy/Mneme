import '../../styles/sheet.css'
import { fontCss } from '../../sheets/fonts'
import type { PagePayload } from '../../sheets/sharepage'
import type { SheetBlock, SheetStroke } from '../../sheets/types'
import { BlockInk } from './Ink'
import { TextBlock } from './TextBlock'

const noop = () => {}

/** Someone's shared page, read-only, as one column (blocks are already in reading order in the payload). */
export function SharedSheet({ page }: { page: PagePayload }) {
  const unit = page.paper.spacing
  const blocks: SheetBlock[] = page.blocks.map((b, i) => ({ ...b, id: `shared-${i}`, sheetId: 'shared', z: i, createdAt: 0, updatedAt: 0 }))
  const strokes: SheetStroke[] = page.ink.map((s, i) => ({ ...s, id: `ink-${i}`, sheetId: 'shared', blockId: s.block === null ? undefined : `shared-${s.block}`, createdAt: 0, updatedAt: 0 }))
  return (
    <div className="sheet-read shared-sheet" style={{ '--page-font': fontCss(page.paper.font), padding: 0 } as React.CSSProperties}>
      {blocks.filter((b) => b.kind === 'text').map((b) => (
        <div key={b.id} className={`rblock ${b.role === 'main' ? '' : 'rside'}`}>
          <TextBlock block={b} unit={unit} editable={false} onDoc={noop} onHeight={noop} onBlur={noop} />
          <BlockInk strokes={strokes.filter((s) => s.blockId === b.id)} />
        </div>
      ))}
    </div>
  )
}
