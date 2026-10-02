import { useEffect, useRef, useState } from 'react'

// MathLive's visual maths editor, loaded the first time someone edits maths. It uses the KaTeX fonts the
// app already loads (same family names), so it fetches no fonts or sounds of its own.

type Field = HTMLElement & { value: string; executeCommand: (c: unknown) => boolean; focus: () => void; mathVirtualKeyboardPolicy: string; smartFence: boolean }
let loading: Promise<{ new (): Field }> | null = null
const loadMathLive = () => (loading ??= import('mathlive').then((m) => {
  const E = m.MathfieldElement as unknown as { fontsDirectory: string | null; soundsDirectory: string | null; new (): Field }
  E.fontsDirectory = null
  E.soundsDirectory = null
  return E
}))

/** Buttons for things people don't know the LaTeX for. `#@` is the selection, `#?` an empty box. */
export const MATH_BUTTONS: { label: string; title: string; insert: string }[] = [
  { label: 'a⁄b', title: 'Fraction', insert: '\\frac{#@}{#?}' },
  { label: '√', title: 'Square root', insert: '\\sqrt{#0}' },
  { label: 'x²', title: 'Power', insert: '#@^{#?}' },
  { label: 'xₙ', title: 'Subscript', insert: '#@_{#?}' },
  { label: '∫', title: 'Integral', insert: '\\int_{#?}^{#?}' },
  { label: 'Σ', title: 'Sum', insert: '\\sum_{#?}^{#?}' },
  { label: '≤', title: 'Less than or equal', insert: '\\le' },
  { label: '≥', title: 'Greater than or equal', insert: '\\ge' },
  { label: '≈', title: 'Approximately', insert: '\\approx' },
  { label: 'θ', title: 'Theta', insert: '\\theta' },
  { label: 'π', title: 'Pi', insert: '\\pi' },
  { label: 'ω', title: 'Omega', insert: '\\omega' },
  { label: 'Δ', title: 'Delta', insert: '\\Delta' },
  { label: '→', title: 'Vector', insert: '\\vec{#@}' },
]

type Props = { value: string; onChange: (latex: string) => void; onDone?: () => void; autoFocus?: boolean; buttons?: boolean }

/** A maths field: type `sqrt`, `/`, `theta` and it builds the maths; Tab moves to the next box. */
export function MathField({ value, onChange, onDone, autoFocus, buttons = true }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const field = useRef<Field | null>(null)
  const cb = useRef({ onChange, onDone })
  cb.current = { onChange, onDone }
  const [ready, setReady] = useState(false)
  const [raw, setRaw] = useState(false)

  useEffect(() => {
    let gone = false
    void loadMathLive().then((E) => {
      if (gone || !host.current) return
      const mf = new E()
      mf.mathVirtualKeyboardPolicy = matchMedia('(pointer: coarse)').matches ? 'auto' : 'manual'
      mf.smartFence = true
      mf.value = value
      mf.addEventListener('input', () => cb.current.onChange(mf.value))
      mf.addEventListener('keydown', (e) => { if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); cb.current.onDone?.() } })
      host.current.appendChild(mf)
      field.current = mf
      setReady(true)
      if (autoFocus) {
        // The text around it may take focus back as it settles; take it once more if so.
        setTimeout(() => mf.focus(), 0)
        setTimeout(() => { if (mf.isConnected && document.activeElement !== mf && !host.current?.closest('.nv-edit')?.contains(document.activeElement)) mf.focus() }, 120)
      }
    })
    return () => { gone = true; field.current?.remove(); field.current = null }
    // The field is made once; later value changes come from it.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // A change from outside (the raw LaTeX box) goes into the field.
  useEffect(() => { if (field.current && field.current.value !== value) field.current.value = value }, [value])

  return (
    <div className="mathfield">
      <div ref={host} className="mf-host">{!ready && <span className="mf-loading">Loading the maths editor…</span>}</div>
      {buttons && (
        <div className="mf-tools">
          {MATH_BUTTONS.map((b) => (
            <button key={b.title} type="button" title={b.title} aria-label={b.title} onMouseDown={(e) => e.preventDefault()}
              onClick={() => { field.current?.executeCommand(['insert', b.insert]); field.current?.focus() }}>{b.label}</button>
          ))}
          <button type="button" className={`mf-raw ${raw ? 'on' : ''}`} onClick={() => setRaw(!raw)}>LaTeX</button>
        </div>
      )}
      {raw && <textarea className="input mf-latex" value={value} spellCheck={false} aria-label="LaTeX" onChange={(e) => onChange(e.target.value)} />}
    </div>
  )
}
