import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { parseDeckText } from '../../deck-format/parse'
import type { ParseResult } from '../../deck-format/types'
import { importDeck } from '../../data/repo'
import { Icon } from '../../ui/Icons'
import { Sheet } from '../../ui/controls'
import { toast } from '../../ui/toasts'
import { useUI } from '../../app/ui'

type Parsed = { name: string; result: ParseResult }
const MAX_BYTES = 5 * 1024 * 1024

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const [parsed, setParsed] = useState<Parsed[]>([])
  const [over, setOver] = useState(false)
  const [paste, setPaste] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const nav = useNavigate()
  const openDialog = useUI((s) => s.open)

  const readFiles = async (files: FileList | File[]) => {
    const out: Parsed[] = []
    for (const f of Array.from(files)) {
      if (f.size > MAX_BYTES) { out.push({ name: f.name, result: { ok: false, errors: ['This file is over 5 MB, which is larger than any deck should be.'] } }); continue }
      out.push({ name: f.name, result: parseDeckText(await f.text()) })
    }
    // Parts sort by index so part 1 lands first.
    out.sort((a, b) => (a.result.ok && b.result.ok ? (a.result.deck.part?.index ?? 0) - (b.result.deck.part?.index ?? 0) : 0))
    setParsed(out)
  }

  const good = parsed.filter((p): p is { name: string; result: Extract<ParseResult, { ok: true }> } => p.result.ok)

  const doImport = async () => {
    setBusy(true)
    let lastId = ''
    for (const p of good) lastId = (await importDeck(p.result.deck)).deckId
    setBusy(false)
    const titles = [...new Set(good.map((p) => p.result.deck.title))]
    toast(titles.length === 1 ? `Imported ${titles[0]}` : `Imported ${titles.length} decks`, `${good.reduce((n, p) => n + p.result.deck.items.length, 0)} items`)
    onClose()
    if (lastId) nav(`/deck/${lastId}`)
  }

  return (
    <Sheet onClose={onClose} label="Import a deck" width={600}>
      <h2>Import a deck</h2>
      <p className="lede">Upload the <code>.json</code> file your LLM made. If it came in several parts, select them all at once.</p>

      {!paste ? (
        <div className={`drop ${over ? 'over' : ''}`} onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); readFiles(e.dataTransfer.files) }}>
          <Icon name="upload" size={22} />
          <div style={{ marginTop: 8 }}><b>Drop files here</b> or click to choose</div>
          <input ref={input} type="file" accept=".json,.txt,.md,application/json" multiple hidden onChange={(e) => e.target.files && readFiles(e.target.files)} />
        </div>
      ) : (
        <div style={{ marginTop: 18 }}>
          <textarea className="textarea" placeholder="Paste the whole reply from the LLM here" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 180 }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn sm" disabled={!text.trim()} onClick={() => setParsed([{ name: 'Pasted text', result: parseDeckText(text) }])}>Check</button>
          </div>
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 13 }}>
        <button className="btn ghost sm" onClick={() => { setPaste(!paste); setParsed([]) }}>{paste ? 'Upload a file instead' : 'Paste text instead'}</button>
        <button className="btn ghost sm" onClick={() => openDialog('prompt')}>Don't have a file yet? Get the prompt</button>
      </div>

      {parsed.map((p, i) => (
        <div className="preview" key={i}>
          {p.result.ok ? (
            <>
              <div className="t">{p.result.deck.title}{p.result.deck.part && <span className="muted" style={{ fontSize: 13, fontFamily: 'var(--sans)' }}> · part {p.result.deck.part.index} of {p.result.deck.part.of}</span>}</div>
              <div className="muted">
                {p.result.deck.course && <>{p.result.deck.course} · </>}
                {p.result.deck.items.filter((x) => x.kind === 'term').length} terms · {p.result.deck.items.filter((x) => x.kind === 'question').length} questions · {p.result.deck.topics.length} topics
              </div>
              {p.result.warnings.length > 0 && (
                <details className="warn">
                  <summary>{p.result.warnings.length} note{p.result.warnings.length === 1 ? '' : 's'} from the import check</summary>
                  <ul>{p.result.warnings.slice(0, 30).map((w, j) => <li key={j}>{w}</li>)}</ul>
                </details>
              )}
            </>
          ) : (
            <>
              <div className="t">{p.name}</div>
              <ul className="err">{p.result.errors.map((e, j) => <li key={j}>{e}</li>)}</ul>
            </>
          )}
        </div>
      ))}

      <div className="actions">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!good.length || busy} onClick={doImport}>
          {busy ? 'Importing…' : good.length > 1 ? `Import ${good.length} files` : 'Import'}
        </button>
      </div>
    </Sheet>
  )
}
