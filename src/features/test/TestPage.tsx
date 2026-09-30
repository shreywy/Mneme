import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import type { DeckRow } from '../../data/db'
import * as repo from '../../data/repo'
import { filterItems, type Filter } from '../../data/stats'
import type { Item } from '../../deck-format/types'
import { answerText, buildExercise, promptText, type Exercise } from '../../engine/exercises'
import { gradeResponse, type Response } from '../../engine/respond'
import { shuffle } from '../../engine/rng'
import { Markdown } from '../../content/Markdown'
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
  const back = `/deck/${deckId}${sp.toString() ? '?' + sp.toString() : ''}`
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
    setExs(chosen.map((it) => buildExercise(it, all, it.kind === 'term' ? 'recall' : 'recall')))
    setAnswers(Array(n).fill(undefined))
    setI(0)
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { nav(back); return }
      if (phase !== 'run' || isTyping(e)) return
      if (e.key === 'ArrowRight' || (e.key === 'Enter' && i < exs.length - 1)) setI((x) => Math.min(exs.length - 1, x + 1))
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, exs.length, i, nav, back])

  const results = useMemo(() => (phase === 'done' ? exs.map((ex, k) => ({ ex, r: answers[k], g: gradeResponse(ex, answers[k]) })) : []), [phase, exs, answers])
  if (!deck) return <div className="study" />
  const answered = answers.filter(Boolean).length
  const left = deadline ? Math.max(0, Math.round((deadline - now) / 1000)) : 0

  return (
    <div className="study">
      <div className="lbar">
        <button className="btn ghost sm" onClick={() => nav(back)}><Icon name="x" /><span className="kbd">Esc</span></button>
        <span className="deckname">{deck.title} · Test</span>
        <div className="prog">
          {phase === 'run' && <><div className="track"><div className="fill" style={{ width: `${(answered / exs.length) * 100}%` }} /></div><span>{answered} / {exs.length} answered</span></>}
        </div>
        {phase === 'run' && deadline > 0 && <span className="tag" style={{ fontSize: 13 }}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>}
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
            <div className="actions"><button className="btn primary" disabled={!pool.length} onClick={start}>Start the test</button></div>
          </div>
        )}

        {phase === 'run' && exs[i] && (
          <>
            <div className="qcard enter" key={i}>
              <div className="qmeta"><span className="tag">Question {i + 1} of {exs.length}</span></div>
              <QuestionView ex={exs[i]} mode="test" response={answers[i]} revealed={false}
                onRespond={(r) => setAnswers((a) => { const n = [...a]; n[i] = r; return n })} />
            </div>
            <div className="navgrid" style={{ marginTop: 30 }}>
              {exs.map((_, k) => <button key={k} className={`${answers[k] ? 'done' : ''} ${k === i ? 'cur' : ''}`} onClick={() => setI(k)}>{k + 1}</button>)}
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <div style={{ textAlign: 'center', margin: '4vh 0 30px' }}>
              <div className="score">{Math.round((results.filter((x) => x.g.correct).length / results.length) * 100)}%</div>
              <p className="muted" style={{ marginTop: 10 }}>{results.filter((x) => x.g.correct).length} of {results.length} correct</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
                <button className="btn primary" onClick={() => setPhase('setup')}>New test</button>
                <button className="btn" onClick={() => nav(`/deck/${deckId}/learn${sp.toString() ? '?' + sp.toString() : ''}`)}>Go to Learn</button>
              </div>
            </div>
            <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 500, fontSize: 22, marginBottom: 6 }}>
              {results.some((x) => !x.g.correct) ? 'Review your misses' : 'No misses. Nice.'}
            </h2>
            {results.filter((x) => !x.g.correct).map(({ ex, r }) => (
              <div className="review-item" key={ex.key}>
                <Markdown>{ex.kind === 'mc' && ex.promptKind !== 'question' ? `${ex.promptKind === 'term' ? 'Definition of' : 'Term for'}: ${ex.prompt}` : promptText(ex.item)}</Markdown>
                <div className="your">Your answer: {describe(ex, r)}</div>
                <div className="right">Correct: <Markdown inline>{ex.item.kind === 'term' && ex.kind === 'mc' && ex.promptKind === 'definition' ? ex.item.term : answerText(ex.item)}</Markdown></div>
                {ex.item.kind === 'question' && ex.item.explanation && <div className="whytext"><Markdown>{ex.item.explanation}</Markdown></div>}
              </div>
            ))}
          </>
        )}
      </div>

      {phase === 'run' && (
        <div className="dock"><div className="in">
          <div className="left"><button className="btn ghost" disabled={i === 0} onClick={() => setI(i - 1)}>Back</button></div>
          <span />
          <div className="right">
            {i < exs.length - 1 && <button className="btn" onClick={() => setI(i + 1)}>Next</button>}
            {confirmSubmit
              ? <><span className="muted" style={{ alignSelf: 'center', fontSize: 13 }}>{exs.length - answered} unanswered.</span><button className="btn primary" onClick={submit}>Submit anyway</button></>
              : <button className="btn primary" onClick={() => (answered < exs.length ? setConfirmSubmit(true) : submit())}>Submit</button>}
          </div>
        </div></div>
      )}
    </div>
  )
}

function describe(ex: Exercise, r: Response | undefined): string {
  if (!r) return 'no answer'
  switch (r.kind) {
    case 'choice': return ex.kind === 'mc' ? ex.options[r.index]?.text ?? '' : ''
    case 'multi': return ex.kind === 'ms' ? r.indices.map((k) => ex.options[k]?.text).join(' · ') || 'none' : ''
    case 'bool': return r.value ? 'True' : 'False'
    case 'text': return r.value || 'blank'
    case 'blanks': return r.values.map((v) => v || '___').join(' · ')
    case 'order': return r.order.join(' → ') || 'not ordered'
  }
}
