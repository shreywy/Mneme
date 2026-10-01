import { useEffect, useRef, useState } from 'react'
import type { Exercise } from '../../engine/exercises'
import type { Grade, Response } from '../../engine/respond'
import { Markdown } from '../../content/Markdown'
import { isTyping } from '../../app/ui'
import { Demo } from '../../content/Demo'

type Props = {
  ex: Exercise
  mode: 'learn' | 'test'
  response?: Response
  revealed: boolean
  grade?: Grade
  /** final=true means "submit" (Learn grades immediately); final=false just records the current input (Test). */
  onRespond: (r: Response, final: boolean) => void
  /** Global keyboard shortcuts and autofocus. Off for inline questions on a notes page. */
  keyboard?: boolean
}

export const sizeClass = (s: string) => (s.length > 300 ? 'xlong' : s.length > 140 ? 'long' : '')

export function QuestionView({ ex, mode, response, revealed, grade, onRespond, keyboard = true }: Props) {
  const lead = ex.kind === 'mc' && ex.promptKind === 'term' ? 'Pick the definition'
    : ex.kind === 'mc' && ex.promptKind === 'definition' ? 'Pick the term'
      : ex.kind === 'typed' && ex.promptKind === 'definition' ? 'Type the term'
        : ex.kind === 'ms' ? 'Select all that apply'
          : ex.kind === 'order' ? 'Put these in order'
            : ex.kind === 'cloze' ? 'Fill in the blanks' : null
  const promptStr = ex.kind === 'cloze' ? '' : ex.prompt
  if (ex.kind === 'scenario') {
    return (
      <>
        <div className="q" style={{ marginBottom: 10 }}><span className="lead">Read the case, then answer each part</span></div>
        <div className="case"><Markdown>{ex.prompt}</Markdown></div>
        {ex.item.demo?.placement === 'question' && <Demo demo={ex.item.demo} />}
        <ScenarioParts ex={ex} mode={mode} response={response} revealed={revealed} grade={grade} onRespond={onRespond} />
      </>
    )
  }
  return (
    <>
      {ex.kind !== 'cloze' && (
        <div className={`q ${sizeClass(promptStr)}`}>
          {lead && <span className="lead">{lead}</span>}
          <Markdown>{promptStr}</Markdown>
        </div>
      )}
      {ex.item.demo?.placement === 'question' && <Demo demo={ex.item.demo} />}
      {ex.kind === 'cloze' && <div className="q" style={{ marginBottom: 8 }}><span className="lead">{lead}</span></div>}
      <Body ex={ex} mode={mode} response={response} revealed={revealed} grade={grade} onRespond={onRespond} keyboard={keyboard} />
    </>
  )
}

function Body({ ex, mode, response, revealed, grade, onRespond, keyboard }: Props) {
  switch (ex.kind) {
    case 'mc': return <Choices ex={ex} mode={mode} response={response} revealed={revealed} onRespond={onRespond} keyboard={keyboard} />
    case 'tf': return <TrueFalse answer={ex.answer} mode={mode} response={response} revealed={revealed} onRespond={onRespond} keyboard={keyboard} />
    case 'ms': return <MultiSelect ex={ex} mode={mode} response={response} revealed={revealed} onRespond={onRespond} keyboard={keyboard} />
    case 'typed': return <TextAnswer key={ex.key} mode={mode} response={response} revealed={revealed} grade={grade} onRespond={onRespond} answer={ex.answers[0]} keyboard={keyboard} />
    case 'numeric': return <TextAnswer key={ex.key} mode={mode} response={response} revealed={revealed} grade={grade} onRespond={onRespond} keyboard={keyboard} numeric unit={ex.unit}
      answer={`${ex.unit === '$' ? '$' : ''}${ex.answer.toLocaleString()}${ex.unit && ex.unit !== '$' ? ' ' + ex.unit : ''}`} />
    case 'cloze': return <ClozeAnswer ex={ex} mode={mode} response={response} revealed={revealed} grade={grade} onRespond={onRespond} keyboard={keyboard} />
    case 'order': return <OrderAnswer ex={ex} mode={mode} response={response} revealed={revealed} onRespond={onRespond} keyboard={keyboard} />
    case 'scenario': return null
  }
}

/** Every part of a case on one screen. Answers are collected, then checked together. */
function ScenarioParts({ ex, mode, response, revealed, grade, onRespond }: { ex: Extract<Exercise, { kind: 'scenario' }> } & Omit<Props, 'ex'>) {
  const [rs, setRs] = useState<(Response | undefined)[]>(response?.kind === 'parts' ? response.responses : ex.parts.map(() => undefined))
  const set = (i: number, r: Response) => {
    const next = [...rs]; next[i] = r; setRs(next)
    if (mode === 'test') onRespond({ kind: 'parts', responses: next }, false)
  }
  const answered = rs.filter(Boolean).length
  return (
    <div className="parts">
      {ex.parts.map((p, i) => (
        <div className={`part ${revealed ? (grade?.parts?.[i]?.correct ? 'ok' : 'miss') : ''}`} key={p.key}>
          <div className="part-n">Part {i + 1} of {ex.parts.length}{revealed && <span>{grade?.parts?.[i]?.correct ? 'Correct' : 'Missed'}</span>}</div>
          <QuestionView ex={p} mode={revealed ? 'learn' : 'test'} response={rs[i]} revealed={revealed} grade={grade?.parts?.[i]} keyboard={false}
            onRespond={(r) => set(i, r)} />
          {revealed && p.item.kind === 'question' && p.item.explanation && <div className="part-why"><Markdown>{p.item.explanation}</Markdown></div>}
        </div>
      ))}
      {mode === 'learn' && !revealed && (
        <div className="cont-row">
          <button className="btn" disabled={!answered} onClick={() => onRespond({ kind: 'parts', responses: rs }, true)}>
            Check {answered < ex.parts.length ? `${answered} of ${ex.parts.length} answered` : 'answers'}
          </button>
        </div>
      )}
    </div>
  )
}

/** Number keys pick options while the question is live. */
function useNumberKeys(count: number, enabled: boolean, pick: (i: number) => void) {
  const ref = useRef(pick)
  ref.current = pick
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= Math.min(count, 9)) { e.preventDefault(); ref.current(n - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count, enabled])
}

function Choices({ ex, mode, response, revealed, onRespond, keyboard }: { ex: Extract<Exercise, { kind: 'mc' }> } & Omit<Props, 'ex' | 'grade'>) {
  const picked = response?.kind === 'choice' ? response.index : -1
  useNumberKeys(ex.options.length, !revealed && !!keyboard, (i) => onRespond({ kind: 'choice', index: i }, mode === 'learn'))
  return (
    <div className="opts">
      {ex.options.map((o, i) => {
        let cls = ''
        let res = ''
        if (revealed) {
          if (o.correct) { cls = 'good'; res = 'Correct' }
          else if (i === picked) { cls = 'bad shake'; res = 'Your answer' }
          else cls = 'dim'
        } else if (i === picked) cls = 'sel'
        const showWhy = revealed && o.why && (i === picked || o.correct)
        return (
          <button key={i} className={`opt ${cls}`} disabled={revealed} onClick={() => onRespond({ kind: 'choice', index: i }, mode === 'learn')}>
            <span className="kbd">{i + 1}</span>
            <span className="t"><Markdown inline>{o.text}</Markdown>{showWhy && <span className="optwhy">{o.why}</span>}</span>
            {res && <span className="res">{res}</span>}
          </button>
        )
      })}
    </div>
  )
}

function TrueFalse({ answer, mode, response, revealed, onRespond, keyboard }: { answer: boolean } & Omit<Props, 'ex' | 'grade'>) {
  const picked = response?.kind === 'bool' ? response.value : undefined
  const pick = (v: boolean) => onRespond({ kind: 'bool', value: v }, mode === 'learn')
  useNumberKeys(2, !revealed && !!keyboard, (i) => pick(i === 0))
  return (
    <div className="opts">
      {[true, false].map((v, i) => {
        let cls = '', res = ''
        if (revealed) {
          if (v === answer) { cls = 'good'; res = 'Correct' }
          else if (v === picked) { cls = 'bad shake'; res = 'Your answer' }
          else cls = 'dim'
        } else if (v === picked) cls = 'sel'
        return (
          <button key={String(v)} className={`opt ${cls}`} disabled={revealed} onClick={() => pick(v)}>
            <span className="kbd">{i + 1}</span><span className="t">{v ? 'True' : 'False'}</span>{res && <span className="res">{res}</span>}
          </button>
        )
      })}
    </div>
  )
}

function MultiSelect({ ex, mode, response, revealed, onRespond, keyboard }: { ex: Extract<Exercise, { kind: 'ms' }> } & Omit<Props, 'ex' | 'grade'>) {
  const [sel, setSel] = useState<number[]>(response?.kind === 'multi' ? response.indices : [])
  const toggle = (i: number) => {
    const next = sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i].sort()
    setSel(next)
    if (mode === 'test') onRespond({ kind: 'multi', indices: next }, false)
  }
  useNumberKeys(ex.options.length, !revealed && !!keyboard, toggle)
  useEffect(() => {
    if (revealed || mode !== 'learn' || !keyboard) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && sel.length && !isTyping(e)) { e.preventDefault(); e.stopImmediatePropagation(); onRespond({ kind: 'multi', indices: sel }, true) } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [sel, revealed, mode, onRespond, keyboard])
  return (
    <>
      <div className="opts">
        {ex.options.map((o, i) => {
          const on = sel.includes(i)
          let cls = on ? 'sel' : '', res = ''
          if (revealed) {
            if (o.correct && on) { cls = 'good'; res = 'Correct' }
            else if (o.correct) { cls = 'missed'; res = 'Missed' }
            else if (on) { cls = 'bad'; res = 'Not this one' }
            else cls = 'dim'
          }
          return (
            <button key={i} className={`opt ${cls}`} disabled={revealed} onClick={() => toggle(i)} aria-pressed={on}>
              <span className="kbd">{i + 1}</span>
              <span className="t"><Markdown inline>{o.text}</Markdown>{revealed && o.why && (on || o.correct) && <span className="optwhy">{o.why}</span>}</span>
              {res && <span className="res">{res}</span>}
            </button>
          )
        })}
      </div>
      {mode === 'learn' && !revealed && (
        <div style={{ marginTop: 12 }}><button className="btn" disabled={!sel.length} onClick={() => onRespond({ kind: 'multi', indices: sel }, true)}>Check<span className="kbd">Enter</span></button></div>
      )}
    </>
  )
}

function TextAnswer({ mode, response, revealed, grade, onRespond, answer, numeric, unit, keyboard }: Omit<Props, 'ex'> & { answer: string; numeric?: boolean; unit?: string }) {
  const [val, setVal] = useState(response?.kind === 'text' ? response.value : '')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!revealed && keyboard) ref.current?.focus() }, [revealed, keyboard])
  const submit = (v: string) => onRespond({ kind: 'text', value: v }, true)
  const cls = revealed ? (grade?.correct ? 'good' : 'bad') : ''
  return (
    <>
      <div className="answerbox">
        {unit === '$' && <span className="unit">$</span>}
        <input ref={ref} className={`input ${cls}`} value={val} readOnly={revealed} inputMode={numeric ? 'decimal' : 'text'} autoComplete="off" spellCheck={false}
          placeholder={numeric ? 'Type a number' : 'Type your answer'}
          onChange={(e) => { setVal(e.target.value); if (mode === 'test') onRespond({ kind: 'text', value: e.target.value }, false) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !revealed) { e.preventDefault(); e.stopPropagation(); if (val.trim()) submit(val) } }} />
        {unit && unit !== '$' && <span className="unit">{unit}</span>}
      </div>
      {mode === 'learn' && !revealed && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="btn" disabled={!val.trim()} onClick={() => submit(val)}>Check<span className="kbd">Enter</span></button>
          <button className="btn ghost" onClick={() => submit('')} title="Show the answer">Don't know</button>
        </div>
      )}
      {revealed && (
        <div className="feedback">
          {grade?.correct
            ? grade.close ? <><span className="ok">Accepted.</span> Exact wording: <span className="ans">{grade.close}</span></> : <span className="ok">Correct.</span>
            : <><span className="no">{val.trim() ? 'Not quite.' : 'The answer is'}</span><span className="ans">{answer}</span></>}
        </div>
      )}
    </>
  )
}

function ClozeAnswer({ ex, mode, response, revealed, grade, onRespond, keyboard }: { ex: Extract<Exercise, { kind: 'cloze' }> } & Omit<Props, 'ex'>) {
  const n = ex.cloze.blanks.length
  const [vals, setVals] = useState<string[]>(response?.kind === 'blanks' ? response.values : Array(n).fill(''))
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!revealed && keyboard) first.current?.focus() }, [revealed, keyboard])
  const set = (i: number, v: string) => {
    const next = [...vals]; next[i] = v; setVals(next)
    if (mode === 'test') onRespond({ kind: 'blanks', values: next }, false)
  }
  return (
    <>
      <div className="cloze">
        {ex.cloze.parts.map((p, k) => typeof p === 'string'
          // Plain text on purpose: fragments like " + " or "1." would be parsed as Markdown lists.
          ? <span key={k} style={{ whiteSpace: 'pre-wrap' }}>{p.replace(/\*\*|__|`/g, '')}</span>
          : (
            <span key={k}>
              <input ref={p === 0 ? first : undefined} value={vals[p]} readOnly={revealed} aria-label={`Blank ${p + 1}`} autoComplete="off" spellCheck={false}
                className={revealed ? (grade?.blanks?.[p] ? 'good' : 'bad') : ''}
                onChange={(e) => set(p, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !revealed && (mode === 'learn' || vals.some((v) => v.trim()))) { e.preventDefault(); e.stopPropagation(); onRespond({ kind: 'blanks', values: vals }, true) } }} />
              {revealed && !grade?.blanks?.[p] && <span className="fix">{ex.cloze.blanks[p][0]}</span>}
            </span>
          ))}
      </div>
      {mode === 'learn' && !revealed && (
        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => onRespond({ kind: 'blanks', values: vals }, true)}>Check<span className="kbd">Enter</span></button>
        </div>
      )}
    </>
  )
}

function OrderAnswer({ ex, mode, response, revealed, onRespond, keyboard }: { ex: Extract<Exercise, { kind: 'order' }> } & Omit<Props, 'ex' | 'grade'>) {
  const [seq, setSeq] = useState<string[]>(response?.kind === 'order' ? response.order : [])
  const pool = ex.shuffled.filter((s) => !seq.includes(s))
  const update = (next: string[]) => { setSeq(next); if (mode === 'test') onRespond({ kind: 'order', order: next }, false) }
  useNumberKeys(pool.length, !revealed && !!keyboard, (i) => pool[i] && update([...seq, pool[i]]))
  useEffect(() => {
    if (revealed || mode !== 'learn' || !keyboard) return
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      if (e.key === 'Enter' && seq.length === ex.items.length) { e.preventDefault(); e.stopImmediatePropagation(); onRespond({ kind: 'order', order: seq }, true) }
      if (e.key === 'Backspace' && seq.length) { e.preventDefault(); update(seq.slice(0, -1)) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  const shown = revealed ? ex.items : seq
  return (
    <div className="order">
      <div className="slots">
        {ex.items.map((correctItem, i) => {
          const v = revealed ? seq[i] : shown[i]
          const cls = revealed ? (seq[i] === correctItem ? 'filled good' : 'filled bad') : v ? 'filled' : ''
          return (
            <button key={i} className={`slot ${cls}`} disabled={revealed || !v} onClick={() => update(seq.filter((s) => s !== v))}>
              <span className="n">{i + 1}</span>
              <span style={{ flex: 1 }}>{revealed ? <>{correctItem}{seq[i] !== correctItem && seq[i] && <span className="optwhy">You put: {seq[i]}</span>}</> : v ?? 'Pick an item below'}</span>
            </button>
          )
        })}
      </div>
      {!revealed && pool.length > 0 && (
        <div className="pool">{pool.map((s, i) => <button key={s} className="chip" onClick={() => update([...seq, s])}><span className="kbd" style={{ marginRight: 8 }}>{i + 1}</span>{s}</button>)}</div>
      )}
      {mode === 'learn' && !revealed && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={seq.length !== ex.items.length} onClick={() => onRespond({ kind: 'order', order: seq }, true)}>Check<span className="kbd">Enter</span></button>
          {seq.length > 0 && <button className="btn ghost" onClick={() => update([])}>Clear</button>}
        </div>
      )}
    </div>
  )
}
