import { useState } from 'react'
import { parseDeckText } from '../../deck-format/parse'
import type { Choice, Item, QuestionType, Topic } from '../../deck-format/types'
import { QUESTION_TYPES } from '../../deck-format/types'
import { TYPE_LABELS } from '../../prompt/build'
import { Seg, Sheet } from '../../ui/controls'
import { Icon } from '../../ui/Icons'

type Kind = 'term' | QuestionType
type Form = {
  kind: Kind; topic: string; difficulty: 1 | 2 | 3
  term: string; definition: string; aliases: string; example: string
  prompt: string; explanation: string; source: string
  choices: Choice[]; tf: boolean; answer: string; accept: string; tolerance: string; unit: string; items: string
}

function toForm(it: Item | null, topics: Topic[]): Form {
  const base: Form = {
    kind: 'multiple_choice', topic: topics[0]?.id ?? 'general', difficulty: 2, term: '', definition: '', aliases: '', example: '',
    prompt: '', explanation: '', source: '', choices: [{ text: '', correct: true }, { text: '', correct: false }, { text: '', correct: false }, { text: '', correct: false }],
    tf: true, answer: '', accept: '', tolerance: '0', unit: '', items: '',
  }
  if (!it) return base
  if (it.kind === 'term') return { ...base, kind: 'term', topic: it.topic, term: it.term, definition: it.definition, aliases: it.aliases.join(', '), example: it.example ?? '', explanation: it.explanation ?? '', source: it.source ?? '' }
  const f: Form = { ...base, kind: it.qtype, topic: it.topic, difficulty: it.difficulty, prompt: it.prompt, explanation: it.explanation, source: it.source ?? '' }
  switch (it.qtype) {
    case 'multiple_choice': case 'multiple_select': return { ...f, choices: it.choices.map((c) => ({ ...c })) }
    case 'true_false': return { ...f, tf: it.answer }
    case 'short_answer': return { ...f, answer: it.answer, accept: it.accept.join(', ') }
    case 'numeric': return { ...f, answer: String(it.answer), tolerance: String(it.tolerance), unit: it.unit ?? '' }
    case 'ordering': return { ...f, items: it.items.join('\n') }
    default: return f
  }
}

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

/** Turn the form into a deck-file entry and run it through the importer, so edits obey the same rules as imports. */
function toItem(f: Form, key: string): { item?: Item; error?: string } {
  const common = { id: key, topic: f.topic, ...(f.source.trim() ? { source: f.source.trim() } : {}) }
  const raw = f.kind === 'term'
    ? { terms: [{ ...common, term: f.term, definition: f.definition, aliases: list(f.aliases), ...(f.example.trim() ? { example: f.example } : {}), ...(f.explanation.trim() ? { explanation: f.explanation } : {}) }], questions: [] }
    : {
      terms: [], questions: [{
        ...common, type: f.kind, prompt: f.prompt, explanation: f.explanation, difficulty: f.difficulty,
        ...(f.kind === 'multiple_choice' || f.kind === 'multiple_select' ? { choices: f.choices.filter((c) => c.text.trim()).map((c) => ({ text: c.text, correct: c.correct, ...(c.why?.trim() ? { why: c.why } : {}) })) } : {}),
        ...(f.kind === 'true_false' ? { answer: f.tf } : {}),
        ...(f.kind === 'short_answer' ? { answer: f.answer, accept: list(f.accept) } : {}),
        ...(f.kind === 'numeric' ? { answer: Number(f.answer.replace(/[$,\s]/g, '')), tolerance: Number(f.tolerance) || 0, ...(f.unit.trim() ? { unit: f.unit.trim() } : {}) } : {}),
        ...(f.kind === 'ordering' ? { items: f.items.split('\n').map((x) => x.trim()).filter(Boolean) } : {}),
      }],
    }
  const r = parseDeckText(JSON.stringify({ format: 'mneme.deck', version: 1, deck: { title: 'edit' }, topics: [{ id: f.topic, name: f.topic }], ...raw }))
  if (!r.ok) return { error: r.errors.join(' ') }
  const item = r.deck.items[0]
  if (!item) return { error: r.warnings.join(' ').replace(/^Skipped \S+: /, '') || 'Something is missing.' }
  return { item }
}

export function CardEditor({ item, topics, onSave, onClose }: { item: Item | null; topics: Topic[]; onSave: (it: Item) => void; onClose: () => void }) {
  const [f, setF] = useState<Form>(() => toForm(item, topics))
  const [err, setErr] = useState('')
  const up = (p: Partial<Form>) => { setF((x) => ({ ...x, ...p })); setErr('') }
  const isNew = !item
  const save = () => {
    const key = item?.key ?? `${f.kind === 'term' ? 't' : 'q'}-custom-${Date.now().toString(36)}`
    const r = toItem(f, key)
    if (r.error || !r.item) { setErr(r.error ?? 'Check the fields.'); return }
    onSave(r.item)
  }
  if (f.kind === 'scenario') {
    return (
      <Sheet onClose={onClose} label="Edit card" width={480}>
        <h2>Case questions</h2>
        <p className="lede">Cases with several questions can't be edited here yet. You can delete this one, or fix it in the deck file and import it again (your progress on other cards is kept).</p>
        <div className="actions"><button className="btn primary" onClick={onClose}>OK</button></div>
      </Sheet>
    )
  }
  const setChoice = (i: number, p: Partial<Choice>) => up({ choices: f.choices.map((c, k) => (k === i ? { ...c, ...p } : f.kind === 'multiple_choice' && p.correct ? { ...c, correct: false } : c)) })

  return (
    <Sheet onClose={onClose} label={isNew ? 'Add a card' : 'Edit card'} width={640}>
      <h2>{isNew ? 'Add a card' : 'Edit card'}</h2>
      <div className="formgrid">
        <label className="field"><span>Type</span>
          <select className="select" value={f.kind} disabled={!isNew} onChange={(e) => up({ kind: e.target.value as Kind })}>
            <option value="term">Term</option>
            {QUESTION_TYPES.filter((t) => t !== 'scenario' || !isNew).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <label className="field"><span>Topic</span>
          <select className="select" value={f.topic} onChange={(e) => up({ topic: e.target.value })}>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>

        {f.kind === 'term' ? (
          <>
            <label className="field full"><span>Term</span><input className="input" value={f.term} onChange={(e) => up({ term: e.target.value })} /></label>
            <label className="field full"><span>Definition</span><textarea className="textarea plain" rows={3} value={f.definition} onChange={(e) => up({ definition: e.target.value })} /></label>
            <label className="field full"><span>Other accepted spellings (comma separated)</span><input className="input" value={f.aliases} onChange={(e) => up({ aliases: e.target.value })} /></label>
            <label className="field full"><span>Example</span><input className="input" value={f.example} onChange={(e) => up({ example: e.target.value })} /></label>
          </>
        ) : (
          <>
            <div className="field full"><span>Difficulty</span>
              <Seg value={String(f.difficulty) as '1' | '2' | '3'} onChange={(v) => up({ difficulty: Number(v) as 1 | 2 | 3 })} options={[{ value: '1', label: 'Recall' }, { value: '2', label: 'Understand' }, { value: '3', label: 'Apply' }]} />
            </div>
            <label className="field full"><span>{f.kind === 'cloze' ? 'Text, with each blank in {{double braces}} (alternatives with |)' : 'Question'}</span>
              <textarea className="textarea plain" rows={3} value={f.prompt} onChange={(e) => up({ prompt: e.target.value })} /></label>

            {(f.kind === 'multiple_choice' || f.kind === 'multiple_select') && (
              <div className="field full"><span>Choices ({f.kind === 'multiple_choice' ? 'one correct' : 'tick every correct one'})</span>
                <div className="choice-edit">
                  {f.choices.map((c, i) => (
                    <div className="ce-row" key={i}>
                      <input type={f.kind === 'multiple_choice' ? 'radio' : 'checkbox'} name="correct" checked={c.correct} onChange={(e) => setChoice(i, { correct: e.target.checked })} aria-label="Correct" />
                      <input className="input" placeholder={`Choice ${i + 1}`} value={c.text} onChange={(e) => setChoice(i, { text: e.target.value })} />
                      <input className="input why" placeholder="Why (optional)" value={c.why ?? ''} onChange={(e) => setChoice(i, { why: e.target.value })} />
                      <button className="iconbtn" onClick={() => up({ choices: f.choices.filter((_, k) => k !== i) })} aria-label="Remove choice" disabled={f.choices.length <= 2}><Icon name="x" /></button>
                    </div>
                  ))}
                  {f.choices.length < 8 && <button className="btn ghost sm" onClick={() => up({ choices: [...f.choices, { text: '', correct: false }] })}><Icon name="plus" />Add a choice</button>}
                </div>
              </div>
            )}
            {f.kind === 'true_false' && <div className="field full"><span>Answer</span><Seg value={f.tf ? 't' : 'f'} onChange={(v) => up({ tf: v === 't' })} options={[{ value: 't', label: 'True' }, { value: 'f', label: 'False' }]} /></div>}
            {f.kind === 'short_answer' && (
              <>
                <label className="field"><span>Answer</span><input className="input" value={f.answer} onChange={(e) => up({ answer: e.target.value })} /></label>
                <label className="field"><span>Also accept (comma separated)</span><input className="input" value={f.accept} onChange={(e) => up({ accept: e.target.value })} /></label>
              </>
            )}
            {f.kind === 'numeric' && (
              <>
                <label className="field"><span>Answer</span><input className="input" inputMode="decimal" value={f.answer} onChange={(e) => up({ answer: e.target.value })} /></label>
                <div className="field" style={{ gridTemplateColumns: '1fr 1fr', display: 'grid', gap: 10 }}>
                  <label className="field"><span>Tolerance</span><input className="input" value={f.tolerance} onChange={(e) => up({ tolerance: e.target.value })} /></label>
                  <label className="field"><span>Unit</span><input className="input" placeholder="$" value={f.unit} onChange={(e) => up({ unit: e.target.value })} /></label>
                </div>
              </>
            )}
            {f.kind === 'ordering' && <label className="field full"><span>Items in the correct order, one per line</span><textarea className="textarea plain" rows={5} value={f.items} onChange={(e) => up({ items: e.target.value })} /></label>}
          </>
        )}
        <label className="field full"><span>Explanation{f.kind === 'term' ? ' (optional)' : ''}</span><textarea className="textarea plain" rows={3} value={f.explanation} onChange={(e) => up({ explanation: e.target.value })} /></label>
      </div>
      {err && <p className="err">{err}</p>}
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>{isNew ? 'Add card' : 'Save'}</button>
      </div>
    </Sheet>
  )
}

export function DeckInfoEditor({ title, course, description, onSave, onClose }: {
  title: string; course?: string; description?: string; onSave: (p: { title: string; course: string; description: string }) => void; onClose: () => void
}) {
  const [t, setT] = useState(title), [c, setC] = useState(course ?? ''), [d, setD] = useState(description ?? '')
  return (
    <Sheet onClose={onClose} label="Edit deck info" width={540}>
      <h2>Edit deck info</h2>
      <div className="formgrid">
        <label className="field full"><span>Title</span><input className="input" value={t} onChange={(e) => setT(e.target.value)} autoFocus /></label>
        <label className="field full"><span>Course</span><input className="input" value={c} onChange={(e) => setC(e.target.value)} /></label>
        <label className="field full"><span>Description</span><textarea className="textarea plain" rows={4} value={d} onChange={(e) => setD(e.target.value)} /></label>
      </div>
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!t.trim()} onClick={() => onSave({ title: t, course: c, description: d })}>Save</button>
      </div>
    </Sheet>
  )
}
