import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Colour picker drawn by the site: a saturation/brightness square, a hue strip and a hex field.
// Phones and tablets keep the system picker, which suits touch better there.

const RAINBOW = 'conic-gradient(#E58B74, #D8B062, #A7BE8A, #86B59C, #9DB0BF, #B9A3D6, #E58B74)'

type HSV = { h: number; s: number; v: number }

export function hexToHsv(hex: string): HSV {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b)
  let h = 0
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max }
}

export function hsvToHex({ h, s, v }: HSV): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255).toString(16).padStart(2, '0')
  }
  return `#${f(5)}${f(3)}${f(1)}`
}

const coarse = () => matchMedia('(pointer: coarse)').matches

/**
 * A round swatch that opens a picker. Shows a rainbow while no colour is chosen.
 * `active` draws the selected ring (e.g. the custom colour is the one in use).
 */
export function ColorPicker({ value, fallback, active, onChange, label }: {
  value: string | null; fallback: string; active: boolean; onChange: (hex: string) => void; label: string
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const native = useRef<HTMLInputElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Placed under the swatch (or above it when there's no room), kept inside the window.
  useLayoutEffect(() => {
    if (!open || !btn.current || !pop.current) return
    const r = btn.current.getBoundingClientRect(), p = pop.current.getBoundingClientRect()
    const below = r.bottom + 8 + p.height < innerHeight
    setPos({ top: below ? r.bottom + 8 : Math.max(8, r.top - 8 - p.height), left: Math.min(innerWidth - p.width - 8, Math.max(8, r.right - p.width)) })
  }, [open])
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  return (
    <>
      <button ref={btn} type="button" className={`sw-pick ${active ? 'on' : ''}`} aria-label={label} title={label} aria-expanded={open}
        style={{ '--c': value ?? RAINBOW } as React.CSSProperties}
        onClick={() => (coarse() ? native.current?.click() : setOpen((o) => !o))} />
      <input ref={native} type="color" hidden value={value ?? fallback} onChange={(e) => onChange(e.target.value)} />
      {/* Portalled to <body>: a transformed dialog would otherwise become the fixed position's frame and clip it. */}
      {open && createPortal(
        <div ref={pop} className="cpick" role="dialog" aria-label={label} style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}>
          <Picker value={value ?? fallback} onChange={onChange} />
        </div>,
        document.body,
      )}
    </>
  )
}

function Picker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  // Keep HSV locally: going through hex loses the hue at grey and black.
  const [hsv, setHsv] = useState(() => hexToHsv(value))
  const [text, setText] = useState(value)
  useEffect(() => { if (hsvToHex(hsv) !== value.toLowerCase()) { setHsv(hexToHsv(value)); setText(value) } }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (n: HSV) => { setHsv(n); const hex = hsvToHex(n); setText(hex); onChange(hex) }

  const drag = (el: HTMLElement, e: React.PointerEvent, apply: (x: number, y: number) => void) => {
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent | React.PointerEvent) => {
      const r = el.getBoundingClientRect()
      apply(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)))
    }
    move(e)
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up) }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  const nudge = (k: 's' | 'v' | 'h', delta: number) => {
    const max = k === 'h' ? 360 : 1
    commit({ ...hsv, [k]: Math.min(max, Math.max(0, hsv[k] + delta * max)) })
  }

  return (
    <>
      <div className="cp-sv" style={{ '--hue': `hsl(${hsv.h} 100% 50%)` } as React.CSSProperties}
        onPointerDown={(e) => drag(e.currentTarget, e, (x, y) => commit({ ...hsv, s: x, v: 1 - y }))}>
        <span className="cp-dot" tabIndex={0} role="slider" aria-label="Saturation and brightness" aria-valuenow={Math.round(hsv.s * 100)}
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv) }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 0.1 : 0.02
            if (e.key === 'ArrowLeft') nudge('s', -step); else if (e.key === 'ArrowRight') nudge('s', step)
            else if (e.key === 'ArrowUp') nudge('v', step); else if (e.key === 'ArrowDown') nudge('v', -step); else return
            e.preventDefault()
          }} />
      </div>
      <div className="cp-hue" onPointerDown={(e) => drag(e.currentTarget, e, (x) => commit({ ...hsv, h: x * 360 }))}>
        <span className="cp-dot" tabIndex={0} role="slider" aria-label="Hue" aria-valuenow={Math.round(hsv.h)} aria-valuemin={0} aria-valuemax={360}
          style={{ left: `${(hsv.h / 360) * 100}%`, top: '50%', background: `hsl(${hsv.h} 100% 50%)` }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 0.05 : 0.01
            if (e.key === 'ArrowLeft') nudge('h', -step); else if (e.key === 'ArrowRight') nudge('h', step); else return
            e.preventDefault()
          }} />
      </div>
      <div className="cp-row">
        <span className="cp-chip" style={{ background: hsvToHex(hsv) }} />
        <input className="input cp-hex" value={text} spellCheck={false} aria-label="Hex colour" maxLength={7}
          onChange={(e) => {
            const t = e.target.value.trim()
            setText(t)
            const hex = (t.startsWith('#') ? t : `#${t}`).toLowerCase()
            if (/^#[0-9a-f]{6}$/.test(hex)) { setHsv(hexToHsv(hex)); onChange(hex) }
          }} />
      </div>
    </>
  )
}
