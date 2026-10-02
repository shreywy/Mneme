import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { readingOrder } from '../../sheets/order'
import { fontCss } from '../../sheets/fonts'
import type { SheetBlock, SheetRow, SheetStroke } from '../../sheets/types'
import { BlockInk } from './Ink'
import { TextBlock } from './TextBlock'

const noop = () => {}

/** The `@page` rule for a page: its paper size, margins like the canvas sheets, and page numbers if wanted. */
export function pageRule(paper: SheetRow['paper']): string {
  const size = (paper.size ?? 'a4') === 'a4' ? 'A4' : 'letter'
  const numbers = paper.pageNumbers ? ' @bottom-center { content: counter(page); font: 9pt system-ui, sans-serif; color: #888; }' : ''
  return `@page { size: ${size}; margin: 15mm 16mm;${numbers} }`
}

/**
 * What gets printed (or saved as PDF): the page laid out as a document. In Pages layout that's the main
 * column; pageless, it's the main column with the blocks beside it placed after the line they start on.
 * Drawing on those blocks prints with them. The browser does the paging, so text stays selectable in a PDF.
 */
export function PrintView({ sheet, blocks, strokes, onDone }: { sheet: SheetRow; blocks: SheetBlock[]; strokes: SheetStroke[]; onDone: () => void }) {
  const unit = sheet.paper.spacing
  const list = sheet.paper.layout === 'pages' ? blocks.filter((b) => b.role === 'main') : readingOrder(blocks.filter((b) => b.kind === 'text'))
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = pageRule(sheet.paper)
    document.head.appendChild(style)
    document.body.classList.add('printing-sheet')
    // The PDF is named after the page.
    const title = document.title
    document.title = sheet.title
    let over = false
    const tidy = () => {
      style.remove()
      document.body.classList.remove('printing-sheet')
      document.title = title
      window.removeEventListener('afterprint', finish)
    }
    function finish() {
      if (over) return
      over = true
      tidy()
      onDone()
    }
    window.addEventListener('afterprint', finish)
    // Maths and plots draw once mounted; give them a moment before the browser lays out the pages.
    let after: ReturnType<typeof setTimeout> | undefined
    const t = setTimeout(() => { window.print(); after = setTimeout(finish, 500) }, 600)
    return () => { clearTimeout(t); clearTimeout(after); tidy() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <div className="print-root paper-light" aria-hidden="true" style={{ '--page-font': fontCss(sheet.paper.font) } as React.CSSProperties}>
      {list.map((b) => (
        <div key={b.id} className={`pblock ${b.role === 'main' ? '' : 'rside'}`}>
          <TextBlock block={b} unit={unit} editable={false} onDoc={noop} onHeight={noop} onBlur={noop} />
          <BlockInk strokes={strokes.filter((s) => s.blockId === b.id)} />
        </div>
      ))}
    </div>,
    document.body,
  )
}
