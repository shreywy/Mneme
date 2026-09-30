import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Rating, type Grade } from 'ts-fsrs'
import type { DeckRow } from '../../data/db'
import * as repo from '../../data/repo'
import { filterItems, type Filter } from '../../data/stats'
import type { Item } from '../../deck-format/types'
import { answerText, promptText } from '../../engine/exercises'
import { shuffle } from '../../engine/rng'
import { Markdown } from '../../content/Markdown'
import { Icon } from '../../ui/Icons'
import { Seg } from '../../ui/controls'
import { isTyping } from '../../app/ui'
import { sizeClass } from '../study/QuestionView'
import { sfx } from '../../sound/sfx'

const RATINGS: { r: Grade; label: string; hint: string; cls?: string }[] = [
  { r: Rating.Again, label: 'Again', hint: "didn't know", cls: 'again' },
  { r: Rating.Hard, label: 'Hard', hint: 'barely' },
  { r: Rating.Good, label: 'Good', hint: 'knew it' },
  { r: Rating.Easy, label: 'Easy', hint: 'instantly' },
]

export function FlashcardsPage() {
  const { deckId = '' } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const filter = (sp.get('f') as Filter) || 'all'
  const topic = sp.get('topic')
  const back = `/deck/${deckId}${sp.toString() ? '?' + sp.toString() : ''}`
  const [deck, setDeck] = useState<DeckRow | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [order, setOrder] = useState<Item[]>([])
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [dir, setDir] = useState<'term' | 'def'>('term')
  const [shuffled, setShuffled] = useState(false)
  const [again, setAgain] = useState<Item[]>([])
  const [t0, setT0] = useState(performance.now())
  const [started] = useState(Date.now())

  useEffect(() => {
    ;(async () => {
      const d = await repo.getDeck(deckId)
      if (!d) return
      const all = filterItems(await repo.getItems(deckId), filter, topic)
      setDeck(d); setItems(all); setOrder(all)
    })()
  }, [deckId, filter, topic])

  const card = order[i]
  const done = order.length > 0 && i >= order.length
  const hasTerms = useMemo(() => items.some((x) => x.kind === 'term'), [items])

  const go = useCallback((n: number) => { setI(Math.max(0, Math.min(order.length, n))); setFlipped(false); setT0(performance.now()) }, [order.length])
  const rate = useCallback(async (r: Grade) => {
    if (!card || !flipped) return
    if (r === Rating.Again) setAgain((a) => [...a, card])
    else if (r >= Rating.Good) sfx.correct()
    repo.recordAnswer({ deckId, key: card.key, correct: r !== Rating.Again, ms: performance.now() - t0, mode: 'flashcards', rating: r })
    go(i + 1)
  }, [card, flipped, deckId, t0, go, i])

  const exit = useCallback(() => { repo.bumpDeckRecord(deckId, { sessions: 1, seconds: (Date.now() - started) / 1000 }); nav(back) }, [deckId, started, nav, back])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      if (e.key === 'Escape') { exit(); return }
      if (done) return
      if (e.key === ' ') { e.preventDefault(); setFlipped((f) => !f) }
      else if (e.key === 'ArrowRight') go(i + 1)
      else if (e.key === 'ArrowLeft') go(i - 1)
      else if (flipped && ['1', '2', '3', '4'].includes(e.key)) rate(RATINGS[+e.key - 1].r)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [done, flipped, go, i, rate, exit])

  if (!deck) return <div className="study" />

  const faces = card ? cardFaces(card, dir) : null
  return (
    <div className="study">
      <div className="lbar">
        <button className="btn ghost sm" onClick={exit}><Icon name="x" /><span className="kbd">Esc</span></button>
        <span className="deckname">{deck.title}</span>
        <div className="prog">
          <div className="track"><div className="fill" style={{ width: `${order.length ? (Math.min(i, order.length) / order.length) * 100 : 0}%` }} /></div>
          <span>{Math.min(i + 1, order.length)} / {order.length}</span>
        </div>
        {hasTerms && <Seg value={dir} onChange={(v) => { setDir(v); setFlipped(false) }} options={[{ value: 'term', label: 'Term first' }, { value: 'def', label: 'Definition first' }]} />}
        <button className={`btn sm ${shuffled ? '' : 'ghost'}`} onClick={() => { const s = !shuffled; setShuffled(s); setOrder(s ? shuffle(items) : items); go(0) }}>Shuffle{shuffled ? ' on' : ''}</button>
      </div>
      <div className="stage">
        {order.length === 0 && <p className="empty-note">No cards match this filter.</p>}
        {done && (
          <div style={{ textAlign: 'center', marginTop: '8vh' }}>
            <h1 className="title">Round done.</h1>
            <p className="muted" style={{ marginTop: 12 }}>{order.length} cards, {again.length} marked Again.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 24 }}>
              {again.length > 0 && <button className="btn primary" onClick={() => { setOrder(again); setAgain([]); go(0) }}>Go over the {again.length} again</button>}
              <button className="btn" onClick={() => { setOrder(shuffled ? shuffle(items) : items); setAgain([]); go(0) }}>Start over</button>
              <button className="btn ghost" onClick={exit}>Back to the deck</button>
            </div>
          </div>
        )}
        {card && faces && (
          <>
            <div className="fc-wrap">
              <div className={`fc ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped((f) => !f)} role="button" aria-label="Flip card" tabIndex={0}>
                <div className="face front">
                  <span className="lab">{faces.frontLabel}</span>
                  <div className={`big-t ${sizeClass(faces.front)}`}><Markdown>{faces.front}</Markdown></div>
                  {faces.frontExtra && <div className="sm-t"><Markdown>{faces.frontExtra}</Markdown></div>}
                </div>
                <div className="face back">
                  <span className="lab">{faces.backLabel}</span>
                  <div className={`big-t ${sizeClass(faces.back)}`}><Markdown>{faces.back}</Markdown></div>
                  {faces.backExtra && <div className="sm-t"><Markdown>{faces.backExtra}</Markdown></div>}
                </div>
              </div>
            </div>
            {flipped ? (
              <div className="rate">
                {RATINGS.map((x, k) => <button key={x.label} className={x.cls} onClick={() => rate(x.r)}>{x.label}<small>{k + 1} · {x.hint}</small></button>)}
              </div>
            ) : (
              <p className="muted" style={{ textAlign: 'center', marginTop: 18, fontSize: 13 }}>Click the card or press <span className="kbd">Space</span> to flip. <span className="kbd">←</span> <span className="kbd">→</span> to move without rating.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function cardFaces(it: Item, dir: 'term' | 'def') {
  if (it.kind === 'term') {
    const extra = [it.example && `*Example:* ${it.example}`, it.explanation].filter(Boolean).join('\n\n')
    return dir === 'term'
      ? { frontLabel: 'Term', front: it.term, frontExtra: '', backLabel: 'Definition', back: it.definition, backExtra: extra }
      : { frontLabel: 'Definition', front: it.definition, frontExtra: '', backLabel: 'Term', back: it.term, backExtra: extra }
  }
  const choices = it.qtype === 'multiple_choice' || it.qtype === 'multiple_select' ? it.choices.map((c, k) => `${String.fromCharCode(65 + k)}. ${c.text}`).join('\n\n') : ''
  const order = it.qtype === 'ordering' ? it.items.slice().sort().join(' · ') : ''
  return { frontLabel: 'Question', front: promptText(it), frontExtra: choices || order, backLabel: 'Answer', back: answerText(it), backExtra: it.explanation }
}
