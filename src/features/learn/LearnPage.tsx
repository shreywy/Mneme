import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import type { DeckRow } from '../../data/db'
import * as repo from '../../data/repo'
import { filterItems, type Filter } from '../../data/stats'
import type { Item } from '../../deck-format/types'
import { buildExercise, type Exercise } from '../../engine/exercises'
import { masteryOf, rateAnswer, retrievability, type CardState } from '../../engine/memory'
import { gradeResponse, type Grade, type Response } from '../../engine/respond'
import { LearnSession, studyOrder } from '../../engine/scheduler'
import { Markdown } from '../../content/Markdown'
import { useSettings } from '../../settings/store'
import { buzz, sfx } from '../../sound/sfx'
import { Icon } from '../../ui/Icons'
import { toast } from '../../ui/toasts'
import { isTyping } from '../../app/ui'
import { QuestionView } from '../study/QuestionView'
import { burst, MILESTONES, pulse, smoke } from '../study/effects'

type Loaded = { deck: DeckRow; all: Item[]; pool: Item[]; byKey: Map<string, Item> }

export function LearnPage() {
  const { deckId = '' } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const filter = (sp.get('f') as Filter) || 'all'
  const topic = sp.get('topic')
  const back = `/deck/${deckId}${sp.toString() ? '?' + sp.toString() : ''}`

  const [data, setData] = useState<Loaded | null | 'missing'>(null)
  const states = useRef(new Map<string, CardState>())
  const session = useRef<LearnSession | null>(null)
  const median = useRef(0)
  const [cur, setCur] = useState<{ ex: Exercise; n: number; t0: number } | null>(null)
  const [response, setResponse] = useState<Response>()
  const [grade, setGrade] = useState<Grade>()
  const [revealed, setRevealed] = useState(false)
  const revealedAt = useRef(0)
  const [leaving, setLeaving] = useState(false)
  const [streak, setStreak] = useState(0)
  const prevStreak = useRef(0)
  const best = useRef(0)
  const [learned, setLearned] = useState(0)
  const pending = useRef<{ key: string; correct: boolean; ms: number } | null>(null)
  const started = useRef(Date.now())
  const chip = useRef<HTMLSpanElement>(null)
  const sound = useSettings((s) => s.sound)
  const setSettings = useSettings((s) => s.set)

  const countLearned = useCallback((pool: Item[]) => pool.filter((i) => { const m = masteryOf(states.current.get(i.key)); return m === 'familiar' || m === 'mastered' }).length, [])

  // Load deck, states and build the session.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const deck = await repo.getDeck(deckId)
      if (!deck) { if (alive) setData('missing'); return }
      const [all, st, med] = await Promise.all([repo.getItems(deckId), repo.getCardStates(deckId), repo.medianResponseMs()])
      if (!alive) return
      states.current = st
      median.current = med
      const pool = filterItems(all, filter, topic)
      const now = new Date()
      const order = new Map(studyOrder(pool, deck.topics.map((t) => t.id)).map((k, i) => [k, i]))
      session.current = pool.length ? new LearnSession(pool.map((it) => ({
        key: it.key, order: order.get(it.key) ?? 0, mastery: masteryOf(st.get(it.key)), retrievability: retrievability(st.get(it.key), now),
      }))) : null
      setData({ deck, all, pool, byKey: new Map(all.map((i) => [i.key, i])) })
      setLearned(countLearned(pool))
    })()
    return () => { alive = false }
  }, [deckId, filter, topic, countLearned])

  const draw = useCallback(() => {
    if (!session.current || !data || data === 'missing') return
    const pick = session.current.next()
    const item = data.byKey.get(pick.key)!
    setCur((c) => ({ ex: buildExercise(item, data.all, pick.format), n: (c?.n ?? 0) + 1, t0: performance.now() }))
    setResponse(undefined); setGrade(undefined); setRevealed(false)
  }, [data])

  const firstDrawn = useRef(false)
  useEffect(() => {
    if (data && data !== 'missing' && !firstDrawn.current) { firstDrawn.current = true; draw() }
  }, [data, draw])

  const commit = useCallback(() => {
    const p = pending.current
    if (!p || !data || data === 'missing') return
    pending.current = null
    const prev = states.current.get(p.key)
    const rating = rateAnswer({ correct: p.correct, ms: p.ms, medianMs: median.current, mastery: masteryOf(prev) })
    session.current?.record(p.key, p.correct)
    repo.recordAnswer({ deckId, key: p.key, correct: p.correct, ms: p.ms, mode: 'learn', rating }).then((ns) => {
      states.current.set(p.key, ns)
      setLearned(countLearned(data.pool))
    })
  }, [data, deckId, countLearned])

  const onCorrectStreak = (s: number) => {
    best.current = Math.max(best.current, s)
    const milestone = MILESTONES.includes(s)
    pulse(chip.current, 'bump', s % 10 === 0 ? 'blaze' : 'flick')
    if (milestone) {
      sfx.milestone(); buzz([12, 40, 12]); burst(chip.current)
      toast(`${s} in a row`, s >= 25 ? 'That is a serious streak.' : 'Keep it going.', 'flame')
    } else { sfx.correct(); buzz(10) }
  }

  const onRespond = useCallback((r: Response, final: boolean) => {
    if (revealed || !cur) return
    setResponse(r)
    if (!final) return
    const g = gradeResponse(cur.ex, r)
    setGrade(g)
    setRevealed(true)
    revealedAt.current = performance.now()
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    pending.current = { key: cur.ex.key, correct: g.correct, ms: performance.now() - cur.t0 }
    prevStreak.current = streak
    if (g.correct) { const s = streak + 1; setStreak(s); onCorrectStreak(s) }
    else {
      if (streak > 0) { pulse(chip.current, 'ice'); smoke(chip.current); sfx.fizzle() }
      setStreak(0); sfx.wrong(); buzz(30)
    }
  }, [revealed, cur, streak])

  const iWasRight = () => {
    if (!pending.current || grade?.correct) return
    pending.current.correct = true
    setGrade({ correct: true })
    const s = prevStreak.current + 1
    setStreak(s); onCorrectStreak(s)
  }

  const advancing = useRef(false)
  const next = useCallback(() => {
    if (advancing.current) return // Enter on a focused button would otherwise fire twice and skip a card
    advancing.current = true
    commit()
    setLeaving(true)
    setTimeout(() => { draw(); setLeaving(false); advancing.current = false; window.scrollTo({ top: 0 }) }, 150)
  }, [commit, draw])

  const exit = useCallback(() => {
    commit()
    repo.bumpDeckRecord(deckId, { sessions: 1, seconds: (Date.now() - started.current) / 1000, bestStreak: best.current })
    nav(back)
  }, [commit, deckId, nav, back])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); exit(); return }
      if (isTyping(e) && !revealed) return
      if (e.key === 'Enter' && revealed && performance.now() - revealedAt.current > 150) { e.preventDefault(); next() }
      else if ((e.key === 'm' || e.key === 'M') && !isTyping(e)) setSettings({ sound: !useSettings.getState().sound })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, next, exit, setSettings])

  // Save a pending answer if the tab closes mid-card.
  useEffect(() => {
    const save = () => commit()
    window.addEventListener('pagehide', save)
    return () => { window.removeEventListener('pagehide', save); save() }
  }, [commit])

  if (data === 'missing') return <div className="page"><h1 className="title">Deck not found</h1></div>
  if (!data) return <div className="study" />
  const total = data.pool.length

  return (
    <div className="study">
      <div className="lbar">
        <button className="btn ghost sm" onClick={exit} title="Back to the deck  Esc"><Icon name="x" /><span className="kbd">Esc</span></button>
        <span className="deckname">{data.deck.title}</span>
        <div className="prog">
          <div className="track"><div className="fill" style={{ width: `${total ? (learned / total) * 100 : 0}%` }} /></div>
          <span>{learned} / {total} learned</span>
        </div>
        <button className="iconbtn" onClick={() => setSettings({ sound: !sound })} title={sound ? 'Mute  M' : 'Unmute  M'} aria-label={sound ? 'Mute' : 'Unmute'}>
          <Icon name={sound ? 'vol' : 'volx'} />
        </button>
        <span className={`streak ${streak >= 3 ? 'hot' : ''}`} ref={chip} title="Streak"><Icon name="flame" /><span className="num">{streak}</span></span>
      </div>

      <div className="stage">
        {total === 0 && <p className="empty-note">No cards match this filter. Go back and pick another.</p>}
        {cur && (
          <div className={`qcard ${leaving ? 'out' : 'enter'}`} key={cur.n}>
            <div className="qmeta">
              <span className="tag">{cur.ex.item.kind === 'term' ? 'Term' : 'Question'}</span>
              <span>Card {cur.n}</span>
              {data.deck.topics.length > 1 && <span>{data.deck.topics.find((t) => t.id === cur.ex.item.topic)?.name}</span>}
            </div>
            <QuestionView ex={cur.ex} mode="learn" response={response} revealed={revealed} grade={grade} onRespond={onRespond} />
            {revealed && <Why item={cur.ex.item} />}
          </div>
        )}
      </div>

      <div className="dock"><div className="in">
        <div className="left">
          {revealed && grade && !grade.correct && cur && ['typed', 'numeric', 'cloze'].includes(cur.ex.kind) && hasInput(response) && (
            <button className="btn ghost" onClick={iWasRight} title="Count this as correct">I was right</button>
          )}
        </div>
        <span className="tipwrap">
          <button className="ai" aria-disabled="true"><Icon name="spark" />Ask the tutor</button>
          <span className="tip">Add a free Gemini API key in Settings to use the tutor (coming soon)</span>
        </span>
        <div className="right">
          {revealed && <button className="btn primary" onClick={next}>Continue<span className="kbd">Enter</span></button>}
        </div>
      </div></div>
    </div>
  )
}

const hasInput = (r: Response | undefined) =>
  !!r && ((r.kind === 'text' && r.value.trim() !== '') || (r.kind === 'blanks' && r.values.some((v) => v.trim() !== '')))

function Why({ item }: { item: Item }) {
  if (item.kind === 'term') {
    return (
      <div className="why">
        <div className="h">{item.term}</div>
        <Markdown>{item.definition}</Markdown>
        {item.example && <div style={{ marginTop: 8 }}><Markdown>{`*Example:* ${item.example}`}</Markdown></div>}
        {item.explanation && <div style={{ marginTop: 8 }}><Markdown>{item.explanation}</Markdown></div>}
      </div>
    )
  }
  if (!item.explanation) return null
  return (
    <div className="why">
      <div className="h">Why</div>
      <Markdown>{item.explanation}</Markdown>
      {item.source && <div className="src">Source: {item.source}</div>}
    </div>
  )
}
