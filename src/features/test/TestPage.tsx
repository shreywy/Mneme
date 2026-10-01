import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import type { DeckRow } from '../../data/db'
import * as repo from '../../data/repo'
import { filterItems, type Filter } from '../../data/stats'
import type { Item } from '../../deck-format/types'
import { buildExercise, type Exercise } from '../../engine/exercises'
import { gradeResponse, type Response } from '../../engine/respond'
import { shuffle } from '../../engine/rng'
import { Markdown } from '../../content/Markdown'
import { Demo } from '../../content/Demo'
import { Icon } from '../../ui/Icons'
import { Seg, Toggle } from '../../ui/controls'
import { QuestionView } from '../study/QuestionView'
import { isTyping } from '../../app/ui'

type Phase = 'setup' | 'run' | 'done'

export function TestPage() {
  const { deckId = '' } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const filter = (sp.get('f') as Filter) || 'all'
  const topic = sp.get('topic')
  const qs = sp.toString() ? '?' + sp.toString() : ''
  const back = `/deck/${deckId}${qs}`
  const [deck, setDeck] = useState<DeckRow | null>(null)
  const [all, setAll] = useState<Item[]>([])
  const [pool, setPool] = useState<Item[]>([])
  const [phase, setPhase] = useState<Phase>('setup')
  const [count, setCount] = useState('20')
  const [timed, setTimed] = useState(false)
  const [exs, setExs] = useState<Exercise[]>([])
  const [answers, setAnswers] = useState<(Response | undefined)[]>([])
  const [i, setI] = useState(0)
  const [deadline, setDeadline] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [reviewAll, setReviewAll] = useState(false)

  useEffect(() => {
    ;(async () => {
      const d = await repo.getDeck(deckId)
      if (!d) return
      const items = await repo.getItems(deckId)
      setDeck(d); setAll(items); setPool(filterItems(items, filter, topic))
    })()
  }, [deckId, filter, topic])

  const start = () => {
    const n = count === 'all' ? pool.length : Math.min(pool.length, parseInt(count, 10))
    const chosen = shuffle(pool).slice(0, n)
    setExs(chosen.map((it) => buildExercise(it, all, 'recall')))
    setAnswers(Array(n).fill(undefined))
    setI(0)
    setConfirmSubmit(false)
    setDeadline(timed ? Date.now() + n * 60_000 : 0)
    setPhase('run')
  }

  const submit = useCallback(() => {
    setConfirmSubmit(false)
    setPhase('done')
    exs.forEach((ex, k) => repo.logOnly({ deckId, key: ex.key, correct: gradeResponse(ex, answers[k]).correct, ms: 0, mode: 'test' }))
    window.scrollTo({ top: 0 })
  }, [exs, answers, deckId])

  useEffect(() => {
    if (phase !== 'run' || !deadline) return
    const t = setInterval(() => { setNow(Date.now()); if (Date.now() >= deadline) submit() }, 1000)
    return () => clearInterval(t)
  }, [phase, deadline, submit])

  const goNext = useCallback(() => setI((x) => Math.min(exs.length - 1, x + 1)), [exs.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { nav(back); return }
      if (phase === 'setup' && e.key === 'Enter' && pool.length) { e.preventDefault(); start(); return }
      if (phase !== 'run' || isTyping(e)) return
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); if (i < exs.length - 1) goNext(); else setConfirmSubmit(true) }
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, exs.length, i, nav, back, goNext, pool.length])

  const results = useMemo(() => (phase === 'done' ? exs.map((ex, k) => ({ ex, r: answers[k], g: gradeResponse(ex, answers[k]) })) : []), [phase, exs, answers])
  if (!deck) return <div className="study" />
  const answered = answers.filter(Boolean).length
  const left = deadline ? Math.max(0, Math.round((deadline - now) / 1000)) : 0
  const right = results.filter((x) => x.g.correct).length
  const shown = reviewAll ? results : results.filter((x) => !x.g.correct)

  return (
    <div className="study">
      <div className="lbar">
        <div className="lb-left">
          <button className="btn ghost sm" onClick={() => nav(back)}><Icon name="x" /><span className="kbd">Esc</span></button>
          <span className="deckname">{deck.title} · Test</span>
        </div>
        <div className="prog">
          {phase === 'run' && <><div className="track"><div className="fill" style={{ width: `${(answered / exs.length) * 100}%` }} /></div><span>{answered} / {exs.length} answered</span></>}
        </div>
        <div className="lb-right">
          {phase === 'run' && deadline > 0 && <span className="tag" style={{ fontSize: 13 }}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>}
        </div>
      </div>

      <div className="stage">
        {phase === 'setup' && (
          <div className="panel" style={{ marginTop: 20 }}>
            <h3>Set up a test <span>{pool.length} cards available</span></h3>
            <p className="empty-note">One question per screen. Nothing is graded until you submit, and the test doesn't change your Learn progress.</p>
            <div className="srow"><div className="l"><b>Questions</b></div>
              <Seg value={count} onChange={setCount} options={[{ value: '10', label: '10' }, { value: '20', label: '20' }, { value: '40', label: '40' }, { value: 'all', label: `All ${pool.length}` }]} />
            </div>
            <div className="srow"><div className="l"><b>Timer</b><span>One minute per question</span></div><Toggle on={timed} onChange={setTimed} label="Timer" /></div>
            <div className="actions"><button className="btn primary" disabled={!pool.length} onClick={start}>Start the test<span className="kbd">Enter</span></button></div>
          </div>
        )}

        {phase === 'run' && exs[i] && (
          <>
            <div className="qcard enter" key={i}>
              <div className="qmeta"><span className="tag">Question {i + 1} of {exs.length}</span></div>
              <QuestionView ex={exs[i]} mode="test" response={answers[i]} revealed={false}
                onRespond={(r, final) => {
                  setAnswers((a) => { const n = [...a]; n[i] = r; return n })
                  if (final) { if (i < exs.length - 1) goNext(); else setConfirmSubmit(true) }
                }} />
            </div>
            <div className="navgrid" style={{ marginTop: 30 }}>
              {exs.map((_, k) => <button key={k} className={`${answers[k] ? 'done' : ''} ${k === i ? 'cur' : ''}`} onClick={() => setI(k)}>{k + 1}</button>)}
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <div style={{ textAlign: 'center', margin: '4vh 0 26px' }}>
              <div className="score">{Math.round((right / results.length) * 100)}%</div>
              <p className="muted" style={{ marginTop: 10 }}>{right} of {results.length} correct</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => nav(back)}><Icon name="chev" />Back to deck</button>
                <button className="btn primary" onClick={() => setPhase('setup')}>New test</button>
                <button className="btn" onClick={() => nav(`/deck/${deckId}/learn${qs}`)}>Go to Learn</button>
              </div>
            </div>
            <div className="review-head">
              <h2>{reviewAll ? 'Every question' : right === results.length ? 'No misses. Nice.' : `Your ${results.length - right} miss${results.length - right === 1 ? '' : 'es'}`}</h2>
              <Seg value={reviewAll ? 'all' : 'misses'} onChange={(v) => setReviewAll(v === 'all')} options={[{ value: 'misses', label: 'Misses' }, { value: 'all', label: 'All questions' }]} />
            </div>
            {shown.map(({ ex, r, g }) => (
              <div className={`review-card ${g.correct ? 'ok' : 'miss'}`} key={ex.key}>
                <div className="qmeta"><span className="tag">Question {exs.indexOf(ex) + 1}</span><span className={g.correct ? 'ok' : 'no'}>{g.correct ? 'Correct' : r ? 'Missed' : 'Not answered'}</span></div>
                <QuestionView ex={ex} mode="learn" response={r} revealed grade={g} onRespond={() => {}} keyboard={false} />
                <ReviewWhy item={ex.item} />
              </div>
            ))}
          </>
        )}
      </div>

      {phase === 'run' && (
        <div className="dock"><div className="in">
          <div className="left"><button className="btn ghost" disabled={i === 0} onClick={() => setI(i - 1)}>Back</button></div>
          <div className="center" />
          <div className="right">
            {i < exs.length - 1 && <button className="btn" onClick={goNext}>Next<span className="kbd">Enter</span></button>}
            {confirmSubmit
              ? <><span className="muted" style={{ alignSelf: 'center', fontSize: 13 }}>{exs.length - answered ? `${exs.length - answered} unanswered.` : 'Ready?'}</span><button className="btn primary" onClick={submit}>Submit</button></>
              : <button className="btn primary" onClick={() => (answered < exs.length ? setConfirmSubmit(true) : submit())}>Submit</button>}
          </div>
        </div></div>
      )}
    </div>
  )
}

function ReviewWhy({ item }: { item: Item }) {
  const text = item.kind === 'term' ? `**${item.term}**: ${item.definition}${item.explanation ? `\n\n${item.explanation}` : ''}` : item.explanation
  if (!text && !item.demo) return null
  return <div className="why"><div className="h">Why</div>{text && <Markdown>{text}</Markdown>}{item.demo?.placement === 'explanation' && <Demo demo={item.demo} />}</div>
}
