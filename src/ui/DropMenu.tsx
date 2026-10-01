import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * A button with a dropdown. The dropdown is drawn at the page level (portal), so containers that clip their
 * overflow (the top bar folds away in Focus mode and has to) can't hide it.
 */
export function DropMenu({ button, children, align = 'right', label }: {
  button: (p: { open: boolean; toggle: () => void }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  label: string
}) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchor.current || !menu.current) return
    const a = anchor.current.getBoundingClientRect(), m = menu.current.getBoundingClientRect()
    const left = align === 'right' ? a.right - m.width : a.left
    setPos({ top: Math.min(a.bottom + 6, innerHeight - m.height - 8), left: Math.max(8, Math.min(left, innerWidth - m.width - 8)) })
  }, [open, align])
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const shut = () => setOpen(false)
    document.addEventListener('pointerdown', away)
    window.addEventListener('keydown', key)
    window.addEventListener('resize', shut)
    window.addEventListener('scroll', shut, true)
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', key); window.removeEventListener('resize', shut); window.removeEventListener('scroll', shut, true) }
  }, [open])

  return (
    <>
      <span ref={anchor} className="dropmenu-anchor">{button({ open, toggle: () => { setPos(null); setOpen((o) => !o) } })}</span>
      {open && createPortal(
        <div ref={menu} className="menu dropmenu" role="menu" aria-label={label} style={pos ? { position: 'fixed', top: pos.top, left: pos.left, right: 'auto' } : { position: 'fixed', visibility: 'hidden', top: 0, left: 0, right: 'auto' }}>
          {children(() => setOpen(false))}
        </div>,
        document.body,
      )}
    </>
  )
}
