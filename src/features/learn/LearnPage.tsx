import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import type { DeckRow } from '../../data/db'
import * as repo from '../../data/repo'
import { countMastery, filterItems, type Filter } from '../../data/stats'
import type { Item, TermItem } from '../../deck-format/types'
import { buildExercise, promptText, type Exercise } from '../../engine/exercises'
import { masteryOf, rateAnswer, retrievability, type CardState } from '../../engine/memory'
import { gradeResponse, type Grade, type Response } from '../../engine/respond'
import { LearnSession, studyOrder } from '../../engine/scheduler'
import { shuffle } from '../../engine/rng'
import { Markdown } from '../../content/Markdown'
import { Demo } from '../../content/Demo'
import { useSettings } from '../../settings/store'
import { buzz, sfx } from '../../sound/sfx'
import { Icon } from '../../ui/Icons'
import { toast } from '../../ui/toasts'
import { isTyping } from '../../app/ui'
import { QuestionView } from '../study/QuestionView'
import { burst, MILESTONES, pulse, smoke } from '../study/effects'
import { MatchRound, type MatchResult } from './MatchRound'

type Loaded = { deck: DeckRow; all: Item[]; pool: Item[]; byKey: Map<string, Item> }
type Stats = { answered: number; correct: number; misses: string[] }
const MATCH_EVERY = 8   // term cards between match rounds
const MATCH_SIZE = 5

export function LearnPage() {
  const { deckId = '' } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const filter = (sp.get('f') as Filter) || 'all'
  const topic = sp.get('topic')
  const back = `/deck/${deckId}${sp.toString() ? '?' + sp.toString() : ''}`
  const { sound, learnShuffle, learnPanel, learnMatch, set: setSettings } = useSettings()

  const [data, setData] = useState<Loaded | null | 'missing'>(null)
  const states = useRef(new Map<string, CardState>())
  const session = useRef<LearnSession | null>(null)
  const median = useRef(0)
  const [cur, setCur] = useState<{ ex: Exercise; n: number; t0: number } | null>(null)
  const [match, setMatch] = useState<{ terms: TermItem[]; n: number; done: boolean } | null>(null)
  const [response, setResponse] = useState<Response>()
  const [grade, setGrade] = useState<Grade>()
  const [revealed, setRevealed] = useState(false)
  const revealedAt = useRef(0)
  const [leaving, setLeaving] = useState(false)
  const [streak, setStreak] = useState(0)
  const prevStreak = useRef(0)
  const best = useRef(0)
  const [, setTick] = useState(0) // re-render after async state writes
  const [stats, setStats] = useState<Stats>({ answered: 0, correct: 0, misses: [] })
  const pending = useRef<{ key: string; correct: boolean; ms: number } | null>(null)
  const started = useRef(Date.now())
  const chip = useRef<HTMLSpanElement>(null)
  const termsSinceMatch = useRef(0)
  const recentTerms = useRef<string[]>([])
  const cardN = useRef(0)

  // Load deck, states and build the session. Rebuilt when shuffle is toggled.
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
      })), { shuffle: learnShuffle }) : null
      setData({ deck, all, pool, byKey: new Map(all.map((i) => [i.key, i])) })
      firstDrawn.current = false
    })()
    return () => { alive = false }
  }, [deckId, filter, topic, learnShuffle])

  const draw = useCallback(() => {
    if (!session.current || !data || data === 'missing') return
    const pick = session.current.next()
    const item = data.byKey.get(pick.key)!
    cardN.current++
    setMatch(null)
    setCur({ ex: buildExercise(item, data.all, pick.format), n: cardN.current, t0: performance.now() })
    setResponse(undefined); setGrade(undefined); setRevealed(false)
  }, [data])

  const firstDrawn = useRef(false)
  useEffect(() => {
    if (data && data !== 'missing' && !firstDrawn.current) { firstDrawn.current = true; draw() }
  }, [data, draw])

  const save = useCallback((key: string, correct: boolean, ms: number) => {
    const prev = states.current.get(key)
    const rating = rateAnswer({ correct, ms, medianMs: median.current, mastery: masteryOf(prev) })
    session.current?.record(key, correct)
    setStats((s) => ({ answered: s.answered + 1, correct: s.correct + (correct ? 1 : 0), misses: correct ? s.misses : [key, ...s.misses.filter((k) => k !== key)].slice(0, 6) }))
    repo.recordAnswer({ deckId, key, correct, ms, mode: 'learn', rating }).then((ns) => { states.current.set(key, ns); setTick((t) => t + 1) })
  }, [deckId])

  const commit = useCallback(() => {
    const p = pending.current
    if (!p) return
    pending.current = null
    save(p.key, p.correct, p.ms)
  }, [save])

  const onCorrectStreak = (s: number) => {
    best.current = Math.max(best.current, s)
    pulse(chip.current, 'bump', s % 10 === 0 ? 'blaze' : 'flick')
    if (MILESTONES.includes(s)) {
      sfx.milestone(); buzz([12, 40, 12]); burst(chip.current)
      toast(`${s} in a row`, s >= 25 ? 'That is a serious streak.' : 'Keep it going.', 'flame')
    } else { sfx.correct(); buzz(10) }
  }
  const onMiss = () => {
    if (streak > 0) { pulse(chip.current, 'ice'); smoke(chip.current); sfx.fizzle() }
    setStreak(0); sfx.wrong(); buzz(30)
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
    if (cur.ex.item.kind === 'term') {
      termsSinceMatch.current++
      recentTerms.current = [cur.ex.key, ...recentTerms.current.filter((k) => k !== cur.ex.key)].slice(0, 12)
    }
    if (g.correct) { const s = streak + 1; setStreak(s); onCorrectStreak(s) } else onMiss()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, cur, streak])

  const iWasRight = () => {
    if (!pending.current || grade?.correct) return
    pending.current.correct = true
    setGrade({ correct: true })
    const s = prevStreak.current + 1
    setStreak(s); onCorrectStreak(s)
  }

  const onMatchDone = useCallback((results: MatchResult[], ms: number) => {
    const per = ms / Math.max(1, results.length)
    let s = streak
    for (const r of results) {
      save(r.key, r.correct, per)
      s = r.correct ? s + 1 : 0
    }
    best.current = Math.max(best.current, s)
    setStreak(s)
    if (results.every((r) => r.correct)) { pulse(chip.current, 'bump', 'flick'); sfx.milestone(); burst(chip.current) }
    setMatch((m) => (m ? { ...m, done: true } : m))
    revealedAt.current = performance.now()
  }, [save, streak])

  const advancing = useRef(false)
  const next = useCallback(() => {
    if (advancing.current) return // Enter on a focused button would otherwise fire twice and skip a card
    advancing.current = true
    commit()
    setLeaving(true)
    setTimeout(() => {
      const termPool = data && data !== 'missing' ? recentTerms.current.map((k) => data.byKey.get(k)).filter((i): i is TermItem => i?.kind === 'term') : []
      if (learnMatch && !match && termsSinceMatch.current >= MATCH_EVERY && termPool.length >= 4) {
        termsSinceMatch.current = 0
        cardN.current++
        setCur(null)
        setMatch({ terms: shuffle(termPool).slice(0, MATCH_SIZE), n: cardN.current, done: false })
      } else draw()
      setLeaving(false); advancing.current = false; window.scrollTo({ top: 0 })
    }, 150)
  }, [commit, draw, data, learnMatch, match])

  const exit = useCallback(() => {
    commit()
    repo.bumpDeckRecord(deckId, { sessions: 1, seconds: (Date.now() - started.current) / 1000, bestStreak: best.current })
    nav(back)
  }, [commit, deckId, nav, back])

  const canContinue = revealed || !!match?.done
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); exit(); return }
      if (isTyping(e) && !revealed) return
      if ((e.key === 'Enter' || e.key === ' ') && canContinue && performance.now() - revealedAt.current > 150) { e.preventDefault(); next() }
      else if ((e.key === 'm' || e.key === 'M') && !isTyping(e)) setSettings({ sound: !useSettings.getState().sound })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, canContinue, next, exit, setSettings])

  // Save a pending answer if the tab closes mid-card.
  useEffect(() => {
    const onHide = () => commit()
    window.addEventListener('pagehide', onHide)
    return () => { window.removeEventListener('pagehide', onHide); onHide() }
  }, [commit])

  if (data === 'missing') return <div className="page"><h1 className="title">Deck not found</h1></div>
  if (!data) return <div className="study" />
  const total = data.pool.length
  const m = countMastery(data.pool, states.current)
  const learned = m.familiar + m.mastered

  return (
    <div className={`study ${learnPanel ? 'with-panel' : ''}`}>
      <div className="lbar">
        <div className="lb-left">
          <button className="btn ghost sm" onClick={exit} title="Back to the deck  Esc"><Icon name="x" /><span className="kbd">Esc</span></button>
          <span className="deckname">{data.deck.title}</span>
        </div>
        <div className="prog">
          <div className="track"><div className="fill" style={{ width: `${total ? (learned / total) * 100 : 0}%` }} /></div>
          <span>{learned} / {total} learned</span>
        </div>
        <div className="lb-right">
        <button className={`iconbtn ${learnShuffle ? 'on' : ''}`} onClick={() => setSettings({ learnShuffle: !learnShuffle })}
          title={learnShuffle ? 'Shuffled. Click to go in order.' : 'In order. Click to shuffle.'} aria-pressed={learnShuffle}><Icon name="shuffle" /></button>
        <button className="iconbtn" onClick={() => setSettings({ sound: !sound })} title={sound ? 'Mute  M' : 'Unmute  M'} aria-label={sound ? 'Mute' : 'Unmute'}>
          <Icon name={sound ? 'vol' : 'volx'} />
        </button>
        <span className={`streak ${streak >= 3 ? 'hot' : ''}`} ref={chip} title="Streak"><Icon name="flame" /><span className="num">{streak}</span></span>
        </div>
      </div>

      <div className="stage">
        {total === 0 && <p className="empty-note">No cards match this filter. Go back and pick another.</p>}
        {match && (
          <div className={`qcard ${leaving ? 'out' : 'enter'}`} key={`m${match.n}`}>
            <div className="qmeta"><span className="tag">Match</span><span>Quick round on terms you just saw</span></div>
            <div className="q" style={{ fontSize: 22 }}><span className="lead">Pick a term, then its definition</span></div>
            <MatchRound terms={match.terms} onDone={onMatchDone} />
            {match.done && <ContinueRow onNext={next} />}
          </div>
        )}
        {cur && !match && (
          <div className={`qcard ${leaving ? 'out' : 'enter'}`} key={cur.n}>
            <div className="qmeta">
              <span className="tag">{cur.ex.item.kind === 'term' ? 'Term' : 'Question'}</span>
              <span>Card {cur.n}</span>
              {data.deck.topics.length > 1 && <span>{data.deck.topics.find((t) => t.id === cur.ex.item.topic)?.name}</span>}
            </div>
            <QuestionView ex={cur.ex} mode="learn" response={response} revealed={revealed} grade={grade} onRespond={onRespond} />
            {revealed && (
              <ContinueRow onNext={next}>
                {grade && !grade.correct && ['typed', 'numeric', 'cloze'].includes(cur.ex.kind) && hasInput(response) && (
                  <button className="btn ghost" onClick={iWasRight} title="Count this as correct">I was right</button>
                )}
              </ContinueRow>
            )}
            {revealed && <Why item={cur.ex.item} />}
          </div>
        )}
      </div>

      {learnPanel && <StatsPanel stats={stats} m={m} total={total} best={best.current} started={started.current} byKey={data.byKey} onClose={() => setSettings({ learnPanel: false })} />}

      <div className="dock"><div className="in">
        <div className="left" />
        <div className="center">
          <span className="tipwrap">
            <button className="ai" aria-disabled="true"><Icon name="spark" />Ask the tutor</button>
            <span className="tip">Add a free Gemini API key in Settings to use the tutor (coming soon)</span>
          </span>
          <button className={`ai ${learnPanel ? 'on' : ''}`} onClick={() => setSettings({ learnPanel: !learnPanel })} aria-pressed={learnPanel}>
            <Icon name="chart" />Session stats
          </button>
        </div>
        <div className="right" />
      </div></div>
    </div>
  )
}

function ContinueRow({ onNext, children }: { onNext: () => void; children?: React.ReactNode }) {
  return (
    <div className="cont-row">
      {children}
      <button className="btn primary" onClick={onNext}>Continue<span className="kbd">Enter</span></button>
    </div>
  )
}

function StatsPanel({ stats, m, total, best, started, byKey, onClose }: {
  stats: Stats; m: ReturnType<typeof countMastery>; total: number; best: number; started: number; byKey: Map<string, Item>; onClose: () => void
}) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const secs = Math.floor((now - started) / 1000)
  return (
    <aside className="statspanel" aria-label="Session stats">
      <div className="sp-head"><b>This session</b><button className="iconbtn" onClick={onClose} aria-label="Close stats"><Icon name="x" /></button></div>
      <div className="sp-grid">
        <div><span>Answered</span><b>{stats.answered}</b></div>
        <div><span>Right</span><b>{stats.correct}</b></div>
        <div><span>Accuracy</span><b>{stats.answered ? Math.round((stats.correct / stats.answered) * 100) + '%' : 'n/a'}</b></div>
        <div><span>Best streak</span><b>{best}</b></div>
        <div><span>Time</span><b>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</b></div>
        <div><span>Learned</span><b>{m.familiar + m.mastered} / {total}</b></div>
      </div>
      <div className="sp-sec">These cards</div>
      <div className="mbar">
        <i style={{ flexGrow: m.mastered, background: 'var(--seg4)' }} /><i style={{ flexGrow: m.familiar, background: 'var(--seg3)' }} />
        <i style={{ flexGrow: m.learning, background: 'var(--seg2)' }} /><i style={{ flexGrow: m.new, background: 'var(--seg1)' }} />
      </div>
      <div className="legend">
        <div><span className="dot" style={{ background: 'var(--seg1)' }} />New<b>{m.new}</b></div>
        <div><span className="dot" style={{ background: 'var(--seg2)' }} />Learning<b>{m.learning}</b></div>
        <div><span className="dot" style={{ background: 'var(--seg3)' }} />Familiar<b>{m.familiar}</b></div>
        <div><span className="dot" style={{ background: 'var(--seg4)' }} />Mastered<b>{m.mastered}</b></div>
      </div>
      <div className="sp-sec">Missed this session</div>
      {stats.misses.length === 0 ? <p className="empty-note">None yet.</p> : (
        <ul className="sp-misses">{stats.misses.map((k) => { const it = byKey.get(k); return it ? <li key={k}><Markdown inline>{promptText(it)}</Markdown></li> : null })}</ul>
      )}
    </aside>
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
        {item.demo?.placement === 'explanation' && <Demo demo={item.demo} />}
      </div>
    )
  }
  if (!item.explanation && item.demo?.placement !== 'explanation') return null
  return (
    <div className="why">
      <div className="h">Why</div>
      <Markdown>{item.explanation}</Markdown>
      {item.demo?.placement === 'explanation' && <Demo demo={item.demo} />}
      {item.source && <div className="src">Source: {item.source}</div>}
    </div>
  )
}
