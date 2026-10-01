import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import * as notesRepo from '../../data/notes'
import { listLibrary } from '../../data/repo'
import { compareUnits } from '../../data/notes'
import { Icon } from '../../ui/Icons'
import { Sheet } from '../../ui/controls'
import { toast } from '../../ui/toasts'

type Props =
  | { kind: 'decks'; noteId: string; onClose: () => void }
  | { kind: 'notes'; deckId: string; onClose: () => void }

/** Choose which decks a notes page links to, or which notes pages a deck links to. Grouped by folder. */
export function LinkPicker(props: Props) {
  const { kind, onClose } = props
  const data = useLiveQuery(async () => {
    const [{ folders, decks }, notes, links] = await Promise.all([listLibrary(), notesRepo.listNotes(), db.links.toArray()])
    const items = kind === 'decks'
      ? decks.map((d) => ({ id: d.id, title: d.title, unit: d.unit, folderId: d.folderId }))
      : notes.map((n) => ({ id: n.id, title: n.title, unit: n.unit, folderId: n.folderId }))
    const linked = new Set(kind === 'decks'
      ? links.filter((l) => l.noteId === (props as { noteId: string }).noteId).map((l) => l.deckId)
      : links.filter((l) => l.deckId === (props as { deckId: string }).deckId).map((l) => l.noteId))
    return { folders, items, linked }
  }, [kind])
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [q, setQ] = useState('')
  const sel = picked ?? data?.linked ?? new Set<string>()
  const groups = useMemo(() => {
    if (!data) return []
    const needle = q.trim().toLowerCase()
    const hits = data.items.filter((i) => !needle || `${i.title} ${i.unit ?? ''}`.toLowerCase().includes(needle))
    const name = (id: string | null) => (id ? data.folders.find((f) => f.id === id)?.name ?? 'Folder' : 'Not in a folder')
    const by = new Map<string, typeof hits>()
    for (const i of hits) by.set(name(i.folderId), [...(by.get(name(i.folderId)) ?? []), i])
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([folder, list]) => ({ folder, list: list.sort((a, b) => compareUnits(a.unit, b.unit) || a.title.localeCompare(b.title, undefined, { numeric: true })) }))
  }, [data, q])
  const toggle = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setPicked(n) }
  const save = async () => {
    if (!data) return
    const before = data.linked
    for (const id of sel) if (!before.has(id)) await (kind === 'decks' ? notesRepo.link((props as { noteId: string }).noteId, id) : notesRepo.link(id, (props as { deckId: string }).deckId))
    for (const id of before) if (!sel.has(id)) await (kind === 'decks' ? notesRepo.unlink((props as { noteId: string }).noteId, id) : notesRepo.unlink(id, (props as { deckId: string }).deckId))
    toast('Links saved')
    onClose()
  }
  const noun = kind === 'decks' ? 'decks' : 'notes pages'
  return (
    <Sheet onClose={onClose} label={kind === 'decks' ? 'Link decks' : 'Link notes'} width={500} top>
      <h2>{kind === 'decks' ? 'Link decks' : 'Link notes'}</h2>
      <p className="lede">{kind === 'decks' ? 'Linked decks can be studied straight from these notes, and questions here count toward them.' : 'Linked notes show on this deck, one click away.'}</p>
      <div className="searchbar" style={{ marginTop: 14 }}><Icon name="search" /><input className="input" placeholder={`Search your ${noun}`} value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      <div className="linklist">
        {data && data.items.length === 0 && <p className="empty-note">You don't have any {noun} yet.</p>}
        {groups.map((g) => (
          <div key={g.folder}>
            <div className="ll-folder">{g.folder}</div>
            {g.list.map((i) => (
              <label key={i.id} className={`ll-row ${sel.has(i.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} />
                <Icon name={kind === 'decks' ? 'cards' : 'notes'} size={14} />
                <span className="t">{i.title}</span>{i.unit && <span className="muted u">{i.unit}</span>}
              </label>
            ))}
          </div>
        ))}
      </div>
      <div className="actions"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={!data}>Save links</button></div>
    </Sheet>
  )
}
