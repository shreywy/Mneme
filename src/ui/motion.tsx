import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Smooth open/close for any block, with no fixed heights: animates grid-template-rows 0fr ↔ 1fr.
 * Children mount on first open and stay mounted, so closing animates too.
 */
export function Collapse({ open, children, className = '' }: { open: boolean; children: ReactNode; className?: string }) {
  const [mounted, setMounted] = useState(open)
  useEffect(() => { if (open) setMounted(true) }, [open])
  return (
    <div className={`collapse ${open ? 'open' : ''} ${className}`} aria-hidden={!open}>
      <div className="collapse-inner">{mounted && children}</div>
    </div>
  )
}

/** A number that counts from its old value to its new one (about 0.5s), e.g. after resetting progress. */
export function AnimatedNumber({ value, format = (n) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = from.current, delta = value - start
    if (!delta) return
    if (document.documentElement.dataset.motion === 'reduced') { setShown(value); from.current = value; return }
    const t0 = performance.now(), dur = 520
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3)
      setShown(start + delta * e)
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); from.current = value }
  }, [value])
  return <>{format(shown)}</>
}
