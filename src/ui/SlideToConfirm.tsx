import { useRef, useState } from 'react'

/**
 * Drag the handle all the way to the right to confirm. Springs back if let go early.
 * Keyboard: focus the handle and press → to move it; reaching the end confirms.
 */
export function SlideToConfirm({ label, onConfirm, disabled = false }: { label: string; onConfirm: () => void; disabled?: boolean }) {
  const track = useRef<HTMLDivElement>(null)
  const [p, setP] = useState(0) // 0..1
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; p: number } | null>(null)
  const done = useRef(false)

  const max = () => { const t = track.current; return t ? t.clientWidth - 52 : 1 } // handle 44 + 2×4 inset
  const release = (v: number) => {
    setDragging(false)
    if (v >= 0.96 && !done.current) { done.current = true; setP(1); onConfirm() }
    else setP(0)
  }

  return (
    <div ref={track} className={`slide ${disabled ? 'disabled' : ''} ${p >= 1 ? 'done' : ''}`}>
      <div className="slide-fill" style={{ width: `calc(${p * 100}% - ${p * 52}px + 48px)`, transition: dragging ? 'none' : undefined }} />
      <span className="slide-label" style={{ opacity: 1 - p * 1.4 }}>{label}</span>
      <button type="button" className="slide-handle" role="slider" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} disabled={disabled}
        style={{ transform: `translateX(${p * max()}px)`, transition: dragging ? 'none' : undefined }}
        onPointerDown={(e) => { if (disabled || done.current) return; e.currentTarget.setPointerCapture(e.pointerId); start.current = { x: e.clientX, p }; setDragging(true) }}
        onPointerMove={(e) => { if (!start.current) return; setP(Math.min(1, Math.max(0, start.current.p + (e.clientX - start.current.x) / max()))) }}
        onPointerUp={() => { if (!start.current) return; start.current = null; release(p) }}
        onPointerCancel={() => { start.current = null; setDragging(false); setP(0) }}
        onKeyDown={(e) => {
          if (disabled || done.current) return
          if (e.key === 'ArrowRight') { e.preventDefault(); const v = Math.min(1, p + 0.1); setP(v); if (v >= 1) release(1) }
          else if (e.key === 'ArrowLeft' || e.key === 'Home') { e.preventDefault(); setP(0) }
        }}>
        <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </div>
  )
}
