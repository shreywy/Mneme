import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { parseAnyText, type AnyParse } from '../../notes-format/parse'
import type { ParseResult } from '../../deck-format/types'
import type { Block, NotesParseResult } from '../../notes-format/types'
import { db } from '../../data/db'
import { importDeck } from '../../data/repo'
import { importNotes } from '../../data/notes'
import { ensurePersistentStorage } from '../../data/backup'
import { plural } from '../../data/stats'
import { Icon } from '../../ui/Icons'
import { Sheet } from '../../ui/controls'
import { toast } from '../../ui/toasts'
import { useUI } from '../../app/ui'

type Parsed = { name: string; any: AnyParse }
type NotesOk = Extract<NotesParseResult, { ok: true }>
type DeckOk = Extract<ParseResult, { ok: true }>
/** Per notes file: where it goes. `folder` is 'auto' (the course's folder), '' (no folder) or a folder id. */
type NotesOpts = { folder: string; unit: string; link: boolean }
const MAX_BYTES = 5 * 1024 * 1024

const countBlocks = (blocks: Block[]) => {
  const all: Block[] = []
  const walk = (bs: Block[]) => bs.forEach((b) => { all.push(b); if (b.type === 'section' || b.type === 'quickref') walk(b.blocks) })
  walk(blocks)
  const n = (types: Block['type'][]) => all.filter((b) => types.includes(b.type)).length
  return {
    sections: n(['section']),
    visuals: n(['flow', 'steps', 'cycle', 'compare', 'decision', 'tree', 'timeline', 'chart', 'diagram', 'demo']),
    questions: n(['question', 'match', 'reveal', 'worked']),
  }
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const [parsed, setParsed] = useState<Parsed[]>([])
  const [opts, setOpts] = useState<Record<number, NotesOpts>>({})
  const [over, setOver] = useState(false)
  const [paste, setPaste] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const nav = useNavigate()
  const openDialog = useUI((s) => s.open)
  const folders = useLiveQuery(() => db.folders.toArray(), []) ?? []

  const accept = (out: Parsed[]) => {
    // Deck parts sort by index so part 1 lands first; notes keep their order.
    out.sort((a, b) => (a.any.kind === 'deck' && b.any.kind === 'deck' && a.any.result.ok && b.any.result.ok ? (a.any.result.deck.part?.index ?? 0) - (b.any.result.deck.part?.index ?? 0) : 0))
    setParsed(out)
    const o: Record<number, NotesOpts> = {}
    out.forEach((p, i) => { if (p.any.kind === 'notes' && p.any.result.ok) o[i] = { folder: 'auto', unit: p.any.result.notes.unit ?? '', link: true } })
    setOpts(o)
  }
  const readFiles = async (files: FileList | File[]) => {
    const out: Parsed[] = []
    for (const f of Array.from(files)) {
      if (f.size > MAX_BYTES) { out.push({ name: f.name, any: { kind: 'deck', result: { ok: false, errors: ['This file is over 5 MB, which is larger than any Mneme file should be.'] } } }); continue }
      out.push({ name: f.name, any: parseAnyText(await f.text()) })
    }
    accept(out)
  }

  const okCount = parsed.filter((p) => p.any.result.ok).length
  const notesCount = parsed.filter((p) => p.any.kind === 'notes' && p.any.result.ok).length

  const doImport = async () => {
    setBusy(true)
    let goTo = ''
    let decks = 0, notes = 0
    for (const [i, p] of parsed.entries()) {
      if (p.any.kind === 'deck' && p.any.result.ok) { goTo = goTo || `/deck/${(await importDeck(p.any.result.deck)).deckId}`; decks++ }
      if (p.any.kind === 'notes' && p.any.result.ok) {
        const o = opts[i] ?? { folder: 'auto', unit: '', link: true }
        const r = await importNotes(p.any.result.notes, p.any.result.deck, {
          ...(o.folder === 'auto' ? {} : { folderId: o.folder || null }), unit: o.unit, link: o.link,
        })
        goTo = `/notes/${r.noteId}`; notes++; if (r.deckId) decks++
      }
    }
    ensurePersistentStorage()
    setBusy(false)
    toast('Imported', [notes && plural(notes, 'notes page'), decks && plural(decks, 'deck')].filter(Boolean).join(' and '))
    onClose()
    if (goTo) nav(goTo)
  }

  return (
    <Sheet onClose={onClose} label="Import" width={600}>
      <h2>Import</h2>
      <p className="lede">Upload the <code>.json</code> file your AI chat made: a deck, notes, or both in one. If a deck came in several parts, select them all at once.</p>

      {!paste ? (
        <div className={`drop ${over ? 'over' : ''}`} onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); readFiles(e.dataTransfer.files) }}>
          <Icon name="upload" size={22} />
          <div style={{ marginTop: 8 }}><b className="for-keys">Drop files here</b><span className="for-keys"> or click to choose</span><b className="for-touch">Tap to choose a file</b></div>
          <input ref={input} type="file" accept=".json,.txt,.md,application/json" multiple hidden onChange={(e) => e.target.files && readFiles(e.target.files)} />
        </div>
      ) : (
        <div style={{ marginTop: 18 }}>
          <textarea className="textarea" placeholder="Paste the whole reply from the AI here" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 180 }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn sm" disabled={!text.trim()} onClick={() => accept([{ name: 'Pasted text', any: parseAnyText(text) }])}>Check</button>
          </div>
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 13 }}>
        <button className="btn ghost sm" onClick={() => { setPaste(!paste); setParsed([]) }}>{paste ? 'Upload a file instead' : 'Paste text instead'}</button>
        <button className="btn ghost sm" onClick={() => openDialog('prompt')}>Don't have a file yet? Get the prompt</button>
      </div>

      {parsed.map((p, i) => p.any.kind === 'notes' && p.any.result.ok
        ? <NotesPreview key={i} r={p.any.result} o={opts[i]} folders={folders} onChange={(o) => setOpts({ ...opts, [i]: o })} />
        : p.any.kind === 'deck' && p.any.result.ok
          ? <DeckPreview key={i} r={p.any.result} />
          : (
            <div className="preview" key={i}>
              <div className="t">{p.name}</div>
              <ul className="err">{(p.any.result as { errors: string[] }).errors.map((e, j) => <li key={j}>{e}</li>)}</ul>
            </div>
          ))}

      <div className="actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!okCount || busy} onClick={doImport}>
          {busy ? 'Importing…' : okCount > 1 ? `Import ${okCount} files` : notesCount && parsed.some((p) => p.any.kind === 'notes' && p.any.result.ok && p.any.result.deck) ? 'Import both' : 'Import'}
        </button>
      </div>
    </Sheet>
  )
}

function Warnings({ list }: { list: string[] }) {
  if (!list.length) return null
  return (
    <details className="warn">
      <summary>{list.length} note{list.length === 1 ? '' : 's'} from the import check</summary>
      <ul>{list.slice(0, 30).map((w, j) => <li key={j}>{w}</li>)}</ul>
    </details>
  )
}

function DeckPreview({ r }: { r: DeckOk }) {
  return (
    <div className="preview">
      <div className="t">{r.deck.title}{r.deck.part && <span className="muted" style={{ fontSize: 13, fontFamily: 'var(--sans)' }}> · part {r.deck.part.index} of {r.deck.part.of}</span>}</div>
      <div className="muted">
        {r.deck.course && <>{r.deck.course} · </>}
        {plural(r.deck.items.filter((x) => x.kind === 'term').length, 'term')} · {plural(r.deck.items.filter((x) => x.kind === 'question').length, 'question')} · {plural(r.deck.topics.length, 'topic')}
      </div>
      <Warnings list={r.warnings} />
    </div>
  )
}

function NotesPreview({ r, o, folders, onChange }: { r: NotesOk; o?: NotesOpts; folders: { id: string; name: string }[]; onChange: (o: NotesOpts) => void }) {
  const c = countBlocks(r.notes.blocks)
  const opts = o ?? { folder: 'auto', unit: r.notes.unit ?? '', link: true }
  const courseFolder = r.notes.course ? folders.find((f) => f.name.toLowerCase() === r.notes.course!.toLowerCase())?.name ?? `${r.notes.course} (new folder)` : null
  return (
    <div className="preview">
      <div className="muted small" style={{ fontWeight: 500 }}>{r.deck ? 'Notes and a deck, in one file' : 'Notes'}{r.notes.course ? ` · ${r.notes.course}` : ''}</div>
      <div className="imp-pages">
        <div className="imp-page">
          <Icon name="notes" />
          <div className="t"><b>{r.notes.title}</b><span className="muted small">{[c.sections && plural(c.sections, 'section'), c.visuals && plural(c.visuals, 'diagram'), c.questions && plural(c.questions, 'question')].filter(Boolean).join(' · ') || 'One page'}</span></div>
        </div>
        {r.deck && (
          <div className="imp-page">
            <Icon name="cards" />
            <div className="t"><b>{r.deck.title}</b><span className="muted small">{plural(r.deck.items.filter((x) => x.kind === 'term').length, 'term')} · {plural(r.deck.items.filter((x) => x.kind === 'question').length, 'question')}</span></div>
          </div>
        )}
      </div>
      <div className="imp-opts">
        <label className="field"><span>Folder</span>
          <select className="select" value={opts.folder} onChange={(e) => onChange({ ...opts, folder: e.target.value })}>
            {courseFolder && <option value="auto">{courseFolder}</option>}
            {!courseFolder && <option value="auto">Not in a folder</option>}
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            {courseFolder && <option value="">Not in a folder</option>}
          </select>
        </label>
        <label className="field"><span>Unit</span>
          <input className="input" value={opts.unit} placeholder="e.g. Chapter 4" onChange={(e) => onChange({ ...opts, unit: e.target.value })} />
        </label>
      </div>
      {r.deck && (
        <label className="imp-check"><input type="checkbox" checked={opts.link} onChange={(e) => onChange({ ...opts, link: e.target.checked })} />Link them, so the notes can open the deck and its questions count toward it</label>
      )}
      <Warnings list={r.warnings} />
    </div>
  )
}
