import { useMemo, useState } from 'react'
import template from '../../../deck-format/mneme-deck-prompt.md?raw'
import notesTemplate from '../../../deck-format/mneme-notes-prompt.md?raw'
import { buildNotesPrompt, type NotesPromptOptions } from '../../prompt/notes'
import { buildPrompt, TYPE_LABELS, type PromptOptions } from '../../prompt/build'
import { QUESTION_TYPES, type QuestionType } from '../../deck-format/types'
import { Icon } from '../../ui/Icons'
import { Seg, Sheet, Toggle } from '../../ui/controls'
import { toast } from '../../ui/toasts'
import { useUI } from '../../app/ui'

const STORE = 'mneme.promptOptions'
type Form = {
  make: 'questions' | 'notes' | 'both'
  course: string; title: string; focus: string; extra: string
  length: 'comprehensive' | 'focused' | 'quick' | 'custom'; count: string
  difficulty: 'mixed' | 'easier' | 'harder'
  types: QuestionType[]
  terms: boolean
  unit: string
  nLength: NonNullable<NotesPromptOptions['length']>
  visuals: NonNullable<NotesPromptOptions['visuals']>
  nQuestions: NonNullable<NotesPromptOptions['questions']>
  maths: NonNullable<NotesPromptOptions['maths']>
}
const DEFAULTS: Form = {
  make: 'questions', course: '', title: '', focus: '', extra: '', length: 'comprehensive', count: '80', difficulty: 'mixed', types: [...QUESTION_TYPES], terms: true,
  unit: '', nLength: 'standard', visuals: 'some', nQuestions: 'few', maths: 'steps',
}

function load(): Form {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) ?? '{}'), title: '', focus: '', unit: '' } } catch { return DEFAULTS }
}

export function PromptDialog({ onClose }: { onClose: () => void }) {
  const openDialog = useUI((u) => u.open)
  const [copied, setCopied] = useState(false)
  const [f, setF] = useState<Form>(load)
  const up = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }))

  const text = useMemo(() => {
    const n = parseInt(f.count, 10)
    const o: PromptOptions = {
      course: f.course, title: f.title, focus: f.focus, extra: f.extra, difficulty: f.difficulty, terms: f.terms,
      types: f.types.length ? f.types : undefined,
      length: f.length === 'custom' ? (n > 0 ? n : 'comprehensive') : f.length,
    }
    if (f.make === 'questions') return buildPrompt(template, o)
    return buildNotesPrompt(notesTemplate, template, {
      withDeck: f.make === 'both', course: f.course, unit: f.unit, title: f.title, focus: f.focus, extra: f.extra,
      length: f.nLength, visuals: f.visuals, questions: f.nQuestions, maths: f.maths,
      deck: { difficulty: o.difficulty, terms: o.terms, types: o.types, length: o.length },
    })
  }, [f])
  const notes = f.make !== 'questions'
  const deck = f.make !== 'notes'

  const remember = () => { try { localStorage.setItem(STORE, JSON.stringify(f)) } catch { /* private mode */ } }
  const copy = async () => {
    remember()
    try { await navigator.clipboard.writeText(text); setCopied(true); toast('Prompt copied', 'Paste it into your LLM with your course files') }
    catch { toast('Copy failed', 'Use Download instead', 'x') }
  }
  const download = () => {
    remember()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
    a.download = f.make === 'questions' ? 'mneme-deck-prompt.md' : f.make === 'notes' ? 'mneme-notes-prompt.md' : 'mneme-notes-and-deck-prompt.md'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const toggleType = (t: QuestionType) => up({ types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t] })

  return (
    <Sheet onClose={onClose} label="Get the LLM prompt" width={640}>
      <h2>Get the LLM prompt</h2>
      <p className="lede">
        Paste this prompt into Claude, ChatGPT or Gemini along with your slides, notes or textbook pages. It replies with a file you can import: a deck, notes, or both.
        Every field is optional, so you can copy it straight away.
      </p>
      <p className="lede" style={{ fontSize: 12.5 }}>
        Best results: Claude makes a file on its own. In ChatGPT, ask for a downloadable file. In Gemini, turn on Canvas first.
        If the reply shows up as a code block instead, use that block's copy button, not a text selection.
      </p>

      <div className="formgrid">
        <div className="field full"><span>What to make</span>
          <Seg value={f.make} onChange={(v) => up({ make: v })} options={[
            { value: 'questions', label: 'Study deck' },
            { value: 'notes', label: 'Notes' },
            { value: 'both', label: 'Both', title: 'Notes and a deck in one file, linked when you import it' },
          ]} />
        </div>
        <label className="field"><span>Course</span><input className="input" placeholder="e.g. ACC100" value={f.course} onChange={(e) => up({ course: e.target.value })} /></label>
        {notes
          ? <label className="field"><span>Unit</span><input className="input" placeholder="e.g. Chapter 4 or Week 5" value={f.unit} onChange={(e) => up({ unit: e.target.value })} /></label>
          : <label className="field"><span>Deck title</span><input className="input" placeholder="e.g. Midterm review" value={f.title} onChange={(e) => up({ title: e.target.value })} /></label>}
        {notes && <label className="field full"><span>Title</span><input className="input" placeholder="Leave blank to use the unit's own title" value={f.title} onChange={(e) => up({ title: e.target.value })} /></label>}
        <label className="field full"><span>Focus</span><input className="input" placeholder="e.g. chapters 1 to 3, skip the history of GAAP" value={f.focus} onChange={(e) => up({ focus: e.target.value })} /></label>
        {notes && (
          <div className="field full notes-opts">
            <div className="nopt"><span>Length</span><Seg value={f.nLength} onChange={(v) => up({ nLength: v })} options={[{ value: 'short', label: 'Short' }, { value: 'standard', label: 'Standard' }, { value: 'thorough', label: 'Thorough' }]} /></div>
            <div className="nopt"><span>Plots and figures</span><Seg value={f.visuals} onChange={(v) => up({ visuals: v })} options={[{ value: 'none', label: 'None' }, { value: 'some', label: 'Some' }, { value: 'lots', label: 'Lots' }]} /></div>
            <div className="nopt"><span>Questions on the page</span><Seg value={f.nQuestions} onChange={(v) => up({ nQuestions: v })} options={[{ value: 'none', label: 'None' }, { value: 'few', label: 'A few' }, { value: 'many', label: 'Many' }]} /></div>
            <div className="nopt"><span>Maths, when there is any</span><Seg value={f.maths} onChange={(v) => up({ maths: v })} options={[{ value: 'plain', label: 'Brief' }, { value: 'steps', label: 'Step by step' }]} /></div>
          </div>
        )}
        {f.make === 'both' && <div className="field full"><span style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 14, marginTop: 6 }}>The deck</span></div>}
        {deck && <>
        <div className="field"><span>Length</span>
          <select className="select" value={f.length} onChange={(e) => up({ length: e.target.value as Form['length'] })}>
            <option value="comprehensive">Everything testable</option>
            <option value="focused">Only the focus above</option>
            <option value="quick">Quick (20 to 40 items)</option>
            <option value="custom">About a set number</option>
          </select>
        </div>
        {f.length === 'custom'
          ? <label className="field"><span>Number of items</span><input className="input" inputMode="numeric" value={f.count} onChange={(e) => up({ count: e.target.value.replace(/\D/g, '') })} /></label>
          : <div className="field"><span>Difficulty</span><Seg value={f.difficulty} onChange={(v) => up({ difficulty: v })} options={[{ value: 'mixed', label: 'Mixed' }, { value: 'easier', label: 'Easier' }, { value: 'harder', label: 'Harder' }]} /></div>}
        {f.length === 'custom' && <div className="field full"><span>Difficulty</span><Seg value={f.difficulty} onChange={(v) => up({ difficulty: v })} options={[{ value: 'mixed', label: 'Mixed' }, { value: 'easier', label: 'Easier' }, { value: 'harder', label: 'Harder' }]} /></div>}
        <div className="field full"><span>Question styles</span>
          <div className="checks">
            {QUESTION_TYPES.map((t) => (
              <label className="check" key={t}><input type="checkbox" checked={f.types.includes(t)} onChange={() => toggleType(t)} />{TYPE_LABELS[t]}</label>
            ))}
          </div>
        </div>
        <div className="field full" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: 'var(--ink)', fontSize: 14 }}>Include vocabulary terms<br /><small className="muted">Terms power the definition drills, flashcards and matching.</small></span>
          <Toggle on={f.terms} onChange={(v) => up({ terms: v })} label="Include vocabulary terms" />
        </div>
        </>}
        <label className="field full"><span>Anything else</span><input className="input" placeholder="e.g. my prof asks a lot of journal-entry questions" value={f.extra} onChange={(e) => up({ extra: e.target.value })} /></label>
      </div>

      <div className="actions">
        <span className="muted" style={{ marginRight: 'auto', fontSize: 12.5, alignSelf: 'center' }}>{Math.round(text.length / 1000)}k characters</span>
        <button className="btn" onClick={download}><Icon name="down" />Download .md</button>
        <button className={`btn ${copied ? '' : 'primary'}`} onClick={copy}><Icon name={copied ? 'check' : 'copy'} />{copied ? 'Copied' : 'Copy prompt'}</button>
        <button className={`btn ${copied ? 'primary' : ''}`} onClick={() => openDialog('import')} title="When your LLM gives you the file">Next: import the file<Icon name="chev" className="flip-x" /></button>
      </div>
    </Sheet>
  )
}
