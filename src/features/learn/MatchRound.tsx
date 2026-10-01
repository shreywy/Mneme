import { useEffect, useMemo, useRef, useState } from 'react'
import type { TermItem } from '../../deck-format/types'
import { shuffle } from '../../engine/rng'
import { Markdown } from '../../content/Markdown'
import { sfx } from '../../sound/sfx'

export type MatchResult = { key: string; correct: boolean }

/**
 * A quick matching round inside Learn: pick a term, then its definition.
 * A term counts as correct only if it was matched with no wrong picks.
 */
export function MatchRound({ terms, onDone }: { terms: TermItem[]; onDone: (results: MatchResult[], ms: number) => void }) {
  const left = useMemo(() => shuffle(terms), [terms])
  const right = useMemo(() => shuffle(terms), [terms])
  const [sel, setSel] = useState<string | null>(null)
  const [done, setDone] = useState<string[]>([])
  const [missed, setMissed] = useState<string[]>([])
  const [shake, setShake] = useState<string | null>(null)
  const t0 = useRef(performance.now())
  const [elapsed, setElapsed] = useState(0)
  const finished = done.length === terms.length

  useEffect(() => {
    if (finished) setElapsed(performance.now() - t0.current)
    if (finished) onDone(terms.map((t) => ({ key: t.key, correct: !missed.includes(t.key) })), performance.now() - t0.current)
    // onDone is intentionally excluded: it changes identity on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished])

  const pickRight = (key: string) => {
    if (!sel || done.includes(key)) return
    if (key === sel) {
      setDone((d) => [...d, key]); setSel(null); sfx.correct()
    } else {
      setMissed((m) => (m.includes(sel) ? m : [...m, sel]))
      setShake(key); setTimeout(() => setShake(null), 350); sfx.wrong()
    }
  }

  return (
    <div className="matchround">
      <div className="mr-cols">
        <div className="mr-col">
          {left.map((t) => (
            <button key={t.key} className={`mr-item term ${sel === t.key ? 'sel' : ''} ${done.includes(t.key) ? 'done' : ''}`}
              disabled={done.includes(t.key)} onClick={() => setSel(sel === t.key ? null : t.key)}>{t.term}</button>
          ))}
        </div>
        <div className="mr-col">
          {right.map((t) => (
            <button key={t.key} className={`mr-item def ${done.includes(t.key) ? 'done' : ''} ${shake === t.key ? 'shake bad' : ''}`}
              disabled={done.includes(t.key) || !sel} onClick={() => pickRight(t.key)}>
              <Markdown inline>{t.definition}</Markdown>
            </button>
          ))}
        </div>
      </div>
      {finished && (
        <p className="mr-summary">
          Matched {terms.length} in {Math.round(elapsed / 100) / 10}s
          {missed.length ? `, ${missed.length} wrong pick${missed.length === 1 ? '' : 's'}.` : ' with no wrong picks.'}
        </p>
      )}
    </div>
  )
}
