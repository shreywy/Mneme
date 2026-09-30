import { useMemo, useState } from 'react'
import template from '../../../deck-format/mneme-deck-prompt.md?raw'
import { buildPrompt, TYPE_LABELS, type PromptOptions } from '../../prompt/build'
import { QUESTION_TYPES, type QuestionType } from '../../deck-format/types'
import { Icon } from '../../ui/Icons'
import { Seg, Sheet, Toggle } from '../../ui/controls'
import { toast } from '../../ui/toasts'

const STORE = 'mneme.promptOptions'
type Form = {
  make: 'questions' | 'notes' | 'both'
  course: string; title: string; focus: string; extra: string
  length: 'comprehensive' | 'focused' | 'quick' | 'custom'; count: string
  difficulty: 'mixed' | 'easier' | 'harder'
  types: QuestionType[]
  terms: boolean
}
const DEFAULTS: Form = { make: 'questions', course: '', title: '', focus: '', extra: '', length: 'comprehensive', count: '80', difficulty: 'mixed', types: [...QUESTION_TYPES], terms: true }

function load(): Form {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) ?? '{}'), title: '', focus: '' } } catch { return DEFAULTS }
}

export function PromptDialog({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState<Form>(load)
  const up = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }))

  const text = useMemo(() => {
    const n = parseInt(f.count, 10)
    const o: PromptOptions = {
      course: f.course, title: f.title, focus: f.focus, extra: f.extra, difficulty: f.difficulty, terms: f.terms,
      types: f.types.length ? f.types : undefined,
      length: f.length === 'custom' ? (n > 0 ? n : 'comprehensive') : f.length,
    }
    return buildPrompt(template, o)
  }, [f])

  const remember = () => { try { localStorage.setItem(STORE, JSON.stringify(f)) } catch { /* private mode */ } }
  const copy = async () => {
    remember()
    try { await navigator.clipboard.writeText(text); toast('Prompt copied', 'Paste it into your LLM with your course files') }
    catch { toast('Copy failed', 'Use Download instead', 'x') }
  }
  const download = () => {
    remember()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
    a.download = 'mneme-deck-prompt.md'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const toggleType = (t: QuestionType) => up({ types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t] })

  return (
    <Sheet onClose={onClose} label="Get the LLM prompt" width={640}>
      <h2>Get the LLM prompt</h2>
      <p className="lede">
        Paste this prompt into Claude, ChatGPT or Gemini along with your slides, notes or textbook pages. It replies with a deck file you can import.
        Every field is optional, so you can copy it straight away.
      </p>

      <div className="formgrid">
        <div className="field full"><span>What to make</span>
          <Seg value={f.make} onChange={(v) => up({ make: v })} options={[
            { value: 'questions', label: 'Study deck' },
            { value: 'notes', label: 'Notes (soon)', disabled: true, title: 'Interactive notes are coming in the next update' },
            { value: 'both', label: 'Both (soon)', disabled: true, title: 'Interactive notes are coming in the next update' },
          ]} />
        </div>
        <label className="field"><span>Course</span><input className="input" placeholder="e.g. ACC100" value={f.course} onChange={(e) => up({ course: e.target.value })} /></label>
        <label className="field"><span>Deck title</span><input className="input" placeholder="e.g. Midterm review" value={f.title} onChange={(e) => up({ title: e.target.value })} /></label>
        <label className="field full"><span>Focus</span><input className="input" placeholder="e.g. chapters 1 to 3, skip the history of GAAP" value={f.focus} onChange={(e) => up({ focus: e.target.value })} /></label>
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
        <label className="field full"><span>Anything else</span><input className="input" placeholder="e.g. my prof asks a lot of journal-entry questions" value={f.extra} onChange={(e) => up({ extra: e.target.value })} /></label>
      </div>

      <div className="actions">
        <span className="muted" style={{ marginRight: 'auto', fontSize: 12.5, alignSelf: 'center' }}>{Math.round(text.length / 1000)}k characters</span>
        <button className="btn" onClick={download}><Icon name="down" />Download .md</button>
        <button className="btn primary" onClick={copy}><Icon name="copy" />Copy prompt</button>
      </div>
    </Sheet>
  )
}
