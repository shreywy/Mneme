import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Markdown } from '../../content/Markdown'
import type { Block, CalloutTone } from '../../notes-format/types'
import { buildExercise } from '../../engine/exercises'
import { gradeResponse, type Grade, type Response } from '../../engine/respond'
import { shuffle } from '../../engine/rng'
import { sfx } from '../../sound/sfx'
import { QuestionView } from '../study/QuestionView'
import { Demo } from '../../content/Demo'
import { Chart, Compare, Cycle, Decision, Diagram, Flow, Steps, Timeline, Tree } from './visuals'

type B<T extends Block['type']> = Extract<Block, { type: T }>

/**
 * What the page around the blocks wants to know. The notes page provides it; previews (import) don't.
 * - `reached(index)`: the end of top-level block `index` came into view (used for reading progress).
 * - `answered(item key, correct, ms)`: a question on the page was answered.
 */
export type NotesHooks = {
  reached?: (index: number) => void
  answered?: (key: string, correct: boolean, ms: number) => void
  /** Ask the section at top-level `index` to open (`n` changes on every request). */
  openSignal?: { index: number; n: number }
}
export const NotesHooksCtx = createContext<NotesHooks>({})
/** The index of the top-level block being rendered, so a section knows which one it is. */
export const BlockIndexCtx = createContext<number>(-1)

/** Calls `reached` once when this point scrolls into view. Put at the end of something to know it was read through. */
export function EndMarker() {
  const { reached } = useContext(NotesHooksCtx)
  const index = useContext(BlockIndexCtx)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !reached || index < 0) return
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { reached(index); io.disconnect() } }, { rootMargin: '0px 0px -10% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [reached, index])
  return <span ref={ref} className="end-marker" aria-hidden="true" />
}

const TONE_LABEL: Record<CalloutTone, string> = { tip: 'Tip', warning: 'Watch out', exam: 'On the exam', definition: 'Definition', note: 'Note' }

export function BlockList({ blocks, openAll }: { blocks: Block[]; openAll?: boolean | null }) {
  return <>{blocks.map((b, i) => <BlockView key={i} b={b} openAll={openAll} />)}</>
}

export function BlockView({ b, openAll }: { b: Block; openAll?: boolean | null }) {
  switch (b.type) {
    case 'quickref': return (
      <section className="quickref">
        <div className="qr-title">{b.title ?? 'Quick reference'}</div>
        <BlockList blocks={b.blocks} />
      </section>
    )
    case 'section': return <Section b={b} openAll={openAll} />
    case 'part': return <h2 className="nb-part">{b.title}</h2>
    case 'heading': return <h4 className="nb-h">{b.text}</h4>
    case 'paragraph': return <Markdown className="nb-p">{b.text}</Markdown>
    case 'list': {
      const L = b.ordered ? 'ol' : 'ul'
      return <L className="nb-list">{b.items.map((it, i) => <li key={i}><Markdown inline>{it}</Markdown></li>)}</L>
    }
    case 'table': return (
      <figure className="nb-table">
        <table>
          <thead><tr>{b.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
          <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, k) => <td key={k}><Markdown inline>{c}</Markdown></td>)}</tr>)}</tbody>
        </table>
        {b.caption && <figcaption>{b.caption}</figcaption>}
      </figure>
    )
    case 'math': return <figure className="nb-math"><Markdown>{`$$\n${b.tex}\n$$`}</Markdown>{b.caption && <figcaption>{b.caption}</figcaption>}</figure>
    case 'callout': return (
      <aside className={`callout ${b.tone}`}>
        <span className="tone">{b.title ?? TONE_LABEL[b.tone]}</span>
        <Markdown>{b.text}</Markdown>
      </aside>
    )
    case 'keyterms': return <KeyTerms b={b} />
    case 'flow': return <Flow b={b} />
    case 'steps': return <Steps b={b} />
    case 'cycle': return <Cycle b={b} />
    case 'compare': return <Compare b={b} />
    case 'decision': return <Decision b={b} />
    case 'tree': return <Tree b={b} />
    case 'timeline': return <Timeline b={b} />
    case 'chart': return <Chart b={b} />
    case 'diagram': return <Diagram b={b} />
    case 'question': return <InlineQuestion b={b} />
    case 'match': return <Match b={b} />
    case 'reveal': return <Reveal b={b} />
    case 'worked': return <Worked b={b} />
    case 'demo': return <Demo demo={b.demo} />
  }
}

function Section({ b, openAll }: { b: B<'section'>; openAll?: boolean | null }) {
  const [open, setOpen] = useState(b.open)
  const { openSignal } = useContext(NotesHooksCtx)
  const index = useContext(BlockIndexCtx)
  useEffect(() => { if (openSignal && openSignal.index === index) setOpen(true) }, [openSignal, index])
  const [last, setLast] = useState(openAll)
  if (openAll !== last) { setLast(openAll); if (openAll !== null && openAll !== undefined) setOpen(openAll) }
  return (
    <section className={`nsec ${open ? 'open' : ''}`}>
      <button className="nsec-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{b.title}</span><svg className="i chev"><use href="#i-chev" /></svg>
      </button>
      {open && <div className="nsec-body"><BlockList blocks={b.blocks} /><EndMarker /></div>}
    </section>
  )
}

function KeyTerms({ b }: { b: B<'keyterms'> }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="keyterms">
      <div className="kt-chips">
        {b.items.map((t, i) => <button key={i} className={`kt ${open === i ? 'on' : ''}`} onClick={() => setOpen(open === i ? null : i)}>{t.term}</button>)}
      </div>
      {open !== null && <div className="kt-def"><b>{b.items[open].term}</b><Markdown>{b.items[open].definition}</Markdown></div>}
    </div>
  )
}

function Box({ label, children }: { label: string; children: ReactNode }) {
  return <div className="nb-box"><span className="nb-box-label">{label}</span>{children}</div>
}

function InlineQuestion({ b }: { b: B<'question'> }) {
  const { answered } = useContext(NotesHooksCtx)
  const shownAt = useRef(performance.now())
  const [seed, setSeed] = useState(0)
  // Keyed on the question's id, not the object: the page re-reads its data often (reading progress, sync),
  // and a new object here used to reshuffle the choices every few seconds.
  const ex = useMemo(() => buildExercise(b.item, [b.item], 'recall'), [b.item.key, seed]) // eslint-disable-line react-hooks/exhaustive-deps
  const [resp, setResp] = useState<Response>()
  const [grade, setGrade] = useState<Grade>()
  const onRespond = (r: Response, final: boolean) => {
    setResp(r)
    if (!final || grade) return
    const g = gradeResponse(ex, r)
    setGrade(g)
    if (g.correct) sfx.correct(); else sfx.wrong()
    if (seed === 0) answered?.(b.item.key, g.correct, performance.now() - shownAt.current) // only the first try counts
  }
  return (
    <Box label="Check yourself">
      <div className="nb-q">
        <QuestionView key={seed} ex={ex} mode="learn" response={resp} revealed={!!grade} grade={grade} onRespond={onRespond} keyboard={false} />
      </div>
      {grade && b.item.explanation && <div className="why"><div className="h">Why</div><Markdown>{b.item.explanation}</Markdown></div>}
      {grade && <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => { setSeed(seed + 1); setResp(undefined); setGrade(undefined) }}>Try again</button>}
    </Box>
  )
}

function Match({ b }: { b: B<'match'> }) {
  const rights = JSON.stringify(b.pairs.map((p) => p.right))
  const options = useMemo(() => shuffle(JSON.parse(rights) as string[]), [rights])
  const [picks, setPicks] = useState<string[]>(Array(b.pairs.length).fill(''))
  const [checked, setChecked] = useState(false)
  const [reveal, setReveal] = useState(false)
  const right = picks.filter((p, i) => p === b.pairs[i].right).length
  return (
    <Box label={b.title ?? 'Match them up'}>
      <table className="match">
        <tbody>
          {b.pairs.map((p, i) => {
            const ok = picks[i] === p.right
            return (
              <tr key={i} className={checked && picks[i] ? (ok ? 'good' : 'bad') : ''}>
                <td><Markdown inline>{p.left}</Markdown></td>
                <td>
                  <select className="select" value={picks[i]} onChange={(e) => { const n = [...picks]; n[i] = e.target.value; setPicks(n); setChecked(false) }}>
                    <option value="">Choose…</option>
                    {options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {reveal && !ok && <div className="fix">{p.right}</div>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="nb-actions">
        <button className="btn sm" onClick={() => { setChecked(true); if (right === b.pairs.length) sfx.correct() }}>Check</button>
        <button className="btn ghost sm" onClick={() => setReveal(!reveal)}>{reveal ? 'Hide answers' : 'Show answers'}</button>
        {checked && <span className={right === b.pairs.length ? 'ok' : 'muted'}>{right} of {b.pairs.length} right</span>}
      </div>
    </Box>
  )
}

function Reveal({ b }: { b: B<'reveal'> }) {
  const [open, setOpen] = useState(false)
  return (
    <Box label="Think first">
      <Markdown className="nb-prompt">{b.prompt}</Markdown>
      {open ? <div className="why"><Markdown>{b.answer}</Markdown></div> : <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setOpen(true)}>Show answer</button>}
    </Box>
  )
}

function Worked({ b }: { b: B<'worked'> }) {
  const [shown, setShown] = useState(0)
  const done = shown >= b.steps.length
  return (
    <Box label="Worked example">
      <Markdown className="nb-prompt">{b.prompt}</Markdown>
      <ol className="worked">
        {b.steps.slice(0, shown).map((s, i) => <li key={i}><Markdown>{s}</Markdown></li>)}
      </ol>
      {done && b.answer && <div className="worked-ans"><span>Answer</span><Markdown inline>{b.answer}</Markdown></div>}
      <div className="nb-actions">
        {!done && <button className="btn sm" onClick={() => setShown(shown + 1)}>{shown === 0 ? 'Show the first step' : 'Next step'}</button>}
        {!done && shown > 0 && <button className="btn ghost sm" onClick={() => setShown(b.steps.length)}>Show all</button>}
        {shown > 0 && <button className="btn ghost sm" onClick={() => setShown(0)}>Hide</button>}
        <span className="muted">{Math.min(shown, b.steps.length)} of {b.steps.length} steps</span>
      </div>
    </Box>
  )
}
