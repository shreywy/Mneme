import { useEffect, useState } from 'react'
import { useAiKey } from '../../ai/key'
import { NO_KEY, openAi } from '../../ai/panel'
import { snap } from '../../ai/snap'
import { toast } from '../../ui/toasts'

/** Ctrl+Shift+E, then drag a box over anything in the app: Gemini explains what's in it. */
export function SnapLayer() {
  const [on, setOn] = useState(false)
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const has = useAiKey((k) => k.has)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        if (!has) { toast(NO_KEY, 'Settings → AI'); return }
        setOn((v) => !v); setDrag(null)
      } else if (e.key === 'Escape' && on) { e.preventDefault(); e.stopImmediatePropagation(); setOn(false); setDrag(null) }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [on, has])

  if (!on) return null
  const r = drag && { left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) }
  const done = async () => {
    setOn(false); setDrag(null)
    if (!r || r.width < 8 || r.height < 8) return
    const { text, image } = await snap(new DOMRect(r.left, r.top, r.width, r.height))
    if (!text && !image) { toast('Nothing to explain there', 'Drag over some text or a drawing'); return }
    openAi({
      id: `snap:${Date.now()}`,
      title: `Snapshot: ${text.replace(/\s+/g, ' ').slice(0, 60) || 'a drawing'}`,
      pinned: { context: `A snapshot of part of the student’s screen in Mneme (${location.pathname.split('/')[1] || 'library'}).\n\nText in it:\n${text || '(none)'}${image ? '\n\nA picture of the drawings, plots and pictures in it is attached.' : ''}`, images: image ? [image] : [] },
      ask: 'Explain what’s in this snapshot.',
    })
  }
  return (
    <div className="snap-layer" role="dialog" aria-label="Snapshot: drag over what you want explained"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY }) }}
      onPointerMove={(e) => drag && setDrag({ ...drag, x1: e.clientX, y1: e.clientY })}
      onPointerUp={() => void done()}>
      {!drag && <div className="snap-hint">Drag over what you want explained <span className="kbd">Esc</span></div>}
      {r && <div className="snap-box" style={r} />}
    </div>
  )
}
