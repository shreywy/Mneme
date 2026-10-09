import { useEffect, useState } from 'react'
import { Markdown } from '../../content/Markdown'
import { Icon } from '../../ui/Icons'
import { isTyping } from '../../app/ui'

/**
 * A card's hints, one at a time on request (H). Hidden once the answer shows. Give it a `key` per card so
 * each card starts with none shown.
 */
export function Hints({ hints, done, onUse }: { hints?: string[]; done?: boolean; onUse?: () => void }) {
  const [n, setN] = useState(0)
  const total = hints?.length ?? 0
  const more = () => { if (n < total) { setN(n + 1); onUse?.() } }
  useEffect(() => {
    if (!total || done) return
    const on = (e: KeyboardEvent) => {
      if ((e.key === 'h' || e.key === 'H') && !isTyping(e) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); more() }
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  })
  if (!total) return null
  return (
    <div className="hints" onClick={(e) => e.stopPropagation()}>
      {n > 0 && <ol>{hints!.slice(0, n).map((h, k) => <li key={k}><Markdown inline>{h}</Markdown></li>)}</ol>}
      {!done && n < total && (
        <button className="btn ghost sm" onClick={more}>
          <Icon name="help" size={14} />{n === 0 ? 'Hint' : 'Another hint'}<span className="muted">{n + 1} of {total}</span><span className="kbd">H</span>
        </button>
      )}
    </div>
  )
}
