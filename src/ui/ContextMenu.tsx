import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { Icon } from './Icons'
import { toast } from './toasts'

// Mneme's own right-click menu. Pages add entries for what's under the pointer (useContextItems);
// Copy, Cut, Paste and Select all come for free where they apply. Shift + right-click shows the browser's menu.

export type MenuItem =
  | { label: string; icon?: string; onSelect: () => void | Promise<void>; disabled?: boolean; hint?: string; kbd?: string; danger?: boolean }
  | { sep: true }
  | { custom: (close: () => void) => ReactNode; key: string }

/** Given the event, return entries for it (or nothing). Earlier providers' entries come first. */
export type Provider = (e: MouseEvent, ctx: { selection: string; target: Element }) => MenuItem[] | null | undefined

const providers = new Set<{ fn: Provider }>()
/** Add entries to the right-click menu while this component is mounted. */
export function useContextItems(fn: Provider) {
  const ref = useRef({ fn })
  ref.current.fn = fn
  useEffect(() => {
    const entry = ref.current
    providers.add(entry)
    return () => { providers.delete(entry) }
  }, [])
}

type State = { open: boolean; x: number; y: number; items: MenuItem[] }
const useMenu = create<State>(() => ({ open: false, x: 0, y: 0, items: [] }))
const close = () => useMenu.setState({ open: false })

const editable = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
  !!el && (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && /^(text|search|email|url|tel|number|password|)$/.test(el.type)))

function builtIns(target: Element, selection: string): MenuItem[] {
  const field = target.closest('input, textarea')
  if (editable(field)) {
    const hasSel = (field.selectionEnd ?? 0) > (field.selectionStart ?? 0)
    const readOnly = field.readOnly || field.disabled
    return [
      { label: 'Cut', icon: 'cut', kbd: 'Ctrl X', disabled: !hasSel || readOnly || field.type === 'password', onSelect: () => { field.focus(); document.execCommand('cut') } },
      { label: 'Copy', icon: 'copy', kbd: 'Ctrl C', disabled: !hasSel || field.type === 'password', onSelect: () => { field.focus(); document.execCommand('copy') } },
      {
        label: 'Paste', icon: 'paste', kbd: 'Ctrl V', disabled: readOnly, onSelect: async () => {
          try {
            const text = await navigator.clipboard.readText()
            field.focus()
            // insertText keeps undo history and fires React's change handlers.
            if (!document.execCommand('insertText', false, text)) field.setRangeText(text, field.selectionStart ?? 0, field.selectionEnd ?? 0, 'end')
          } catch { toast("Couldn't read the clipboard", 'Press Ctrl+V instead', 'x') }
        },
      },
      { label: 'Select all', kbd: 'Ctrl A', onSelect: () => { field.focus(); field.select() } },
    ]
  }
  const out: MenuItem[] = []
  if (selection) out.push({ label: 'Copy', icon: 'copy', kbd: 'Ctrl C', onSelect: async () => { try { await navigator.clipboard.writeText(selection) } catch { document.execCommand('copy') } } })
  const link = target.closest('a[href]') as HTMLAnchorElement | null
  if (link && !link.closest('[data-page-id]')) {
    out.push({ label: 'Open in a new tab', icon: 'external', onSelect: () => { window.open(link.href, '_blank', 'noopener') } })
    out.push({ label: 'Copy link', icon: 'link', onSelect: async () => { await navigator.clipboard.writeText(link.href); toast('Link copied') } })
  }
  return out
}

/** Mounted once at the root. */
export function ContextMenuHost() {
  const { open, x, y, items } = useMenu()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [focus, setFocus] = useState(-1)

  useEffect(() => {
    const onMenu = (e: MouseEvent) => {
      if (e.shiftKey || e.defaultPrevented) { close(); return }
      const target = e.target instanceof Element ? e.target : document.body
      if (target.closest('[data-native-menu], .demo, iframe')) return
      const selection = window.getSelection()?.toString().trim() ?? ''
      const fromPages = [...providers].reverse().flatMap((p) => p.fn(e, { selection, target }) ?? [])
      const base = builtIns(target, selection)
      // Copy goes first when there's a selection; the rest of the built-ins after the page's entries.
      const copyFirst = base.filter((i) => 'label' in i && (i.label === 'Copy' || i.label === 'Cut' || i.label === 'Paste' || i.label === 'Select all'))
      const others = base.filter((i) => !copyFirst.includes(i))
      const all = [...copyFirst, ...(copyFirst.length && fromPages.length ? [{ sep: true } as MenuItem] : []), ...fromPages, ...(others.length && (fromPages.length || copyFirst.length) ? [{ sep: true } as MenuItem] : []), ...others]
      if (!all.length) return // nothing useful: let the browser show its own
      e.preventDefault()
      // Keyboard-opened menus (Menu key, Shift+F10) report 0,0: open at the focused element instead.
      let px = e.clientX, py = e.clientY
      if (!px && !py) { const r = (document.activeElement ?? target).getBoundingClientRect(); px = r.left + 12; py = r.bottom - 4 }
      useMenu.setState({ open: true, x: px, y: py, items: all })
      setFocus(-1)
    }
    document.addEventListener('contextmenu', onMenu)
    return () => document.removeEventListener('contextmenu', onMenu)
  }, [])

  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ left: Math.min(x, innerWidth - r.width - 8), top: y + r.height > innerHeight - 8 ? Math.max(8, y - r.height) : y })
    ref.current.focus()
  }, [open, x, y, items])

  useEffect(() => {
    if (!open) return
    const away = (e: Event) => { if (!ref.current?.contains(e.target as Node)) close() }
    const onKey = (e: KeyboardEvent) => {
      const enabled = items.map((it, i) => ('label' in it && !it.disabled ? i : -1)).filter((i) => i >= 0)
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const cur = enabled.indexOf(focus)
        setFocus(enabled[(cur + (e.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length] ?? -1)
      } else if (e.key === 'Enter' && focus >= 0) {
        e.preventDefault()
        const it = items[focus]
        if ('label' in it && !it.disabled) { close(); void it.onSelect() }
      }
    }
    document.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [open, items, focus])

  if (!open) return null
  return createPortal(
    <div ref={ref} className="ctxmenu" role="menu" tabIndex={-1} style={{ left: pos.left, top: pos.top }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) => 'sep' in it
        ? <div key={i} className="ctx-sep" role="separator" />
        : 'custom' in it
          ? <div key={it.key} className="ctx-custom">{it.custom(close)}</div>
          : (
            <button key={i} role="menuitem" className={`ctx-item ${it.danger ? 'danger' : ''} ${focus === i ? 'focus' : ''}`} disabled={it.disabled} title={it.hint}
              onMouseEnter={() => setFocus(i)} onClick={() => { close(); void it.onSelect() }}>
              <span className="ic">{it.icon && <Icon name={it.icon} size={15} />}</span>
              <span className="lb">{it.label}{it.hint && it.disabled && <small>{it.hint}</small>}</span>
              {it.kbd && <span className="kb">{it.kbd}</span>}
            </button>
          ))}
    </div>,
    document.body,
  )
}
