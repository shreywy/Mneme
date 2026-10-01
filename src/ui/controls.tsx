import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** Segmented control with a sliding background pill. */
export function Seg<T extends string>({
  value, options, onChange, className = '',
}: {
  value: T
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[]
  onChange: (v: T) => void
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>('button.on')
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value, options.length])
  return (
    <div className={`seg ${className}`} ref={ref} role="radiogroup">
      {pill && <span className="pillbg" style={pill} />}
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} title={o.title}
          className={o.value === value ? 'on' : ''} disabled={o.disabled} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [ul, setUl] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>('button.on')
    if (el) setUl({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value])
  return (
    <div className="tabs" ref={ref} role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={t.value === value} className={t.value === value ? 'on' : ''} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
      {ul && <span className="ul" style={ul} />}
    </div>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
}

/** Centered modal. Closes on Escape and on scrim click. `top` pins the sheet near the top instead of centring it, so fields don't move when the content grows
 *  (password managers place their icon once and don't follow a field that shifts). */
export function Sheet({ onClose, children, width, label, top }: { onClose: () => void; children: ReactNode; width?: number; label: string; top?: boolean }) {
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className={`sheet${top ? ' pinned' : ''}`} role="dialog" aria-modal="true" aria-label={label} style={width ? ({ '--w': `${width}px` } as React.CSSProperties) : undefined}>
        <button className="iconbtn close" onClick={onClose} aria-label="Close">
          <svg className="i"><use href="#i-x" /></svg>
        </button>
        {children}
      </div>
    </>
  )
}
