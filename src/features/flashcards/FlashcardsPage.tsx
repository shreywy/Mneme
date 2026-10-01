import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { hideHint, useSettings } from '../../settings/store'
import { Demo } from '../../content/Demo'
import { Sheet } from '../../ui/controls'
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
  const [demoOpen, setDemoOpen] = useState(false)

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

  const [slide, setSlide] = useState<'' | 'out-left' | 'out-right' | 'in-left' | 'in-right'>('')
  const sliding = useRef(false)
  /** Move to card n: the old card slides off one edge and the new one comes in from the other. */
  const go = useCallback((n: number) => {
    const target = Math.max(0, Math.min(order.length, n))
    if (target === i || sliding.current) return
    const forward = target > i
    const instant = document.documentElement.dataset.motion === 'reduced' || target >= order.length
    const swap = () => { setI(target); setFlipped(false); setT0(performance.now()) }
    if (instant) { swap(); return }
    sliding.current = true
    setSlide(forward ? 'out-left' : 'out-right')
    setTimeout(() => {
      swap()
      setSlide(forward ? 'in-right' : 'in-left')
      setTimeout(() => { setSlide(''); sliding.current = false }, 230)
    }, 170)
  }, [order.length, i])
  const hintHidden = useSettings((s) => s.hiddenHints.includes('fc-keys'))
  // Finger-following swipes: drag sideways to move between cards, up or down to flip.
  const wrapRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; t: number; axis: '' | 'x' | 'y'; dx: number; dy: number } | null>(null)
  const suppressClick = useRef(false)
  const setWrap = (transform: string, transition = '') => {
    const el = wrapRef.current
    if (!el) return
    el.style.transition = transition
    el.style.transform = transform
  }
  const swapTo = (target: number, forward: boolean) => {
    setI(target); setFlipped(false); setT0(performance.now())
    setSlide(forward ? 'in-right' : 'in-left')
    setTimeout(() => { setSlide(''); sliding.current = false }, 280)
  }
  const onPointerDown = (e: React.PointerEvent) => {
    if (sliding.current || e.button > 0) return
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), axis: '', dx: 0, dy: 0 }
    suppressClick.current = false
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    d.dx = e.clientX - d.x; d.dy = e.clientY - d.y
    if (!d.axis && Math.hypot(d.dx, d.dy) > 8) {
      d.axis = Math.abs(d.dx) > Math.abs(d.dy) ? 'x' : 'y'
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    if (d.axis === 'x') setWrap(`translateX(${d.dx}px) rotate(${d.dx / 40}deg)`)
    if (d.axis === 'y') setWrap(`perspective(900px) rotateX(${Math.max(-28, Math.min(28, -d.dy / 3))}deg) translateY(${d.dy * 0.25}px)`)
  }
  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (!d || !d.axis) return
    suppressClick.current = true
    const v = Math.abs(d.dx) / Math.max(1, performance.now() - d.t)
    if (d.axis === 'x') {
      const forward = d.dx < 0
      const target = i + (forward ? 1 : -1)
      if ((Math.abs(d.dx) > 90 || v > 0.6) && target >= 0 && target <= order.length) {
        sliding.current = true
        setWrap(`translateX(${(forward ? -1 : 1) * window.innerWidth}px) rotate(${forward ? -8 : 8}deg)`, 'transform .18s cubic-bezier(.5,0,.9,.6)')
        setTimeout(() => { setWrap('', ''); swapTo(target, forward) }, 180)
      } else setWrap('', 'transform .3s cubic-bezier(.2,1.4,.4,1)')
    } else {
      setWrap('', 'transform .28s cubic-bezier(.2,1.2,.4,1)')
      if (Math.abs(d.dy) > 60) setFlipped((f) => !f)
    }
  }
  const onCardClick = () => { if (suppressClick.current) { suppressClick.current = false; return } setFlipped((f) => !f) }
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
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (flipped) go(i + 1); else setFlipped(true) }
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
        <div className="lb-left">
          <button className="btn ghost sm" onClick={exit}><Icon name="x" /><span className="kbd">Esc</span></button>
          <span className="deckname">{deck.title}</span>
        </div>
        <div className="prog">
          <div className="track"><div className="fill" style={{ width: `${order.length ? (Math.min(i, order.length) / order.length) * 100 : 0}%` }} /></div>
          <span>{Math.min(i + 1, order.length)} / {order.length}</span>
        </div>
        <div className="lb-right">
        {hasTerms && <Seg value={dir} onChange={(v) => { setDir(v); setFlipped(false) }} options={[{ value: 'term', label: 'Term first' }, { value: 'def', label: 'Definition first' }]} />}
        <button className={`btn sm ${shuffled ? '' : 'ghost'}`} onClick={() => { const s = !shuffled; setShuffled(s); setOrder(s ? shuffle(items) : items); go(0) }}>Shuffle{shuffled ? ' on' : ''}</button>
        </div>
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
            <div ref={wrapRef} className={`fc-wrap ${slide}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
              <div key={i} className={`fc ${flipped ? 'flipped' : ''}`} onClick={onCardClick} role="button" aria-label="Flip card" tabIndex={0}>
                <div className="face front">
                  <span className="lab">{faces.frontLabel}</span>
                  <AutoAlign className={`big-t ${sizeClass(faces.front)}`} text={faces.front} />
                  {faces.frontExtra && <AutoAlign className="sm-t" text={faces.frontExtra} />}
                </div>
                <div className="face back">
                  <span className="lab">{faces.backLabel}</span>
                  <AutoAlign className={`big-t ${sizeClass(faces.back)}`} text={faces.back} />
                  {faces.backExtra && <AutoAlign className="sm-t" text={faces.backExtra} />}
                </div>
              </div>
            </div>
            {card.demo && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button className="btn ghost sm" onClick={() => setDemoOpen(true)}><Icon name="spark" />Open the demo{card.demo.title ? `: ${card.demo.title}` : ''}</button>
              </div>
            )}
            {demoOpen && card.demo && <Sheet onClose={() => setDemoOpen(false)} label="Demo" width={760}><h2 style={{ fontSize: 20, marginBottom: 12 }}>{card.demo.title ?? 'Demo'}</h2><Demo demo={card.demo} /></Sheet>}
            <div className={`rate ${flipped ? '' : 'hidden'}`} aria-hidden={!flipped}>
              {RATINGS.map((x, k) => <button key={x.label} className={x.cls} tabIndex={flipped ? 0 : -1} onClick={() => rate(x.r)}>{x.label}<small>{k + 1} · {x.hint}</small></button>)}
            </div>
            {!hintHidden && (
              <p className="hint-line" title="Click to hide this tip for good" onClick={() => hideHint('fc-keys')}>
                <span className="for-keys"><span className="kbd">Space</span> flips the card, and again moves on. Rating with <span className="kbd">1</span>–<span className="kbd">4</span> is optional. <span className="kbd">←</span> <span className="kbd">→</span> move without rating.</span>
                <span className="for-touch">Tap or swipe up to flip. Swipe sideways to move. Rating is optional.</span>
                <span className="hide-x">Click to hide</span>
              </p>
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
  if (it.qtype === 'scenario') {
    return {
      frontLabel: 'Case', front: it.prompt, frontExtra: it.parts.map((p, k) => `**${k + 1}.** ${promptText(p)}`).join('\n\n'),
      backLabel: 'Answers', back: it.parts.map((p, k) => `**${k + 1}.** ${answerText(p)}`).join('\n\n'), backExtra: it.explanation,
    }
  }
  const choices = it.qtype === 'multiple_choice' || it.qtype === 'multiple_select' ? it.choices.map((c, k) => `${String.fromCharCode(65 + k)}. ${c.text}`).join('\n\n') : ''
  const order = it.qtype === 'ordering' ? it.items.slice().sort().join(' · ') : ''
  return { frontLabel: 'Question', front: promptText(it), frontExtra: choices || order, backLabel: 'Answer', back: answerText(it), backExtra: it.explanation }
}

/** Centres text that fits on one line; left-aligns it once it wraps. */
function AutoAlign({ text, className }: { text: string; className: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [multi, setMulti] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 24
      const blocks = el.querySelectorAll('p, li, tr').length
      setMulti(el.getBoundingClientRect().height > lh * 1.6 || blocks > 1)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text])
  return <div ref={ref} className={`${className} ${multi ? 'multi' : ''}`}><Markdown>{text}</Markdown></div>
}
