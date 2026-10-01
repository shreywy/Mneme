import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Folder } from '../../data/db'
import * as repo from '../../data/repo'
import { countMastery, filterItems, plural, relTime, type Filter } from '../../data/stats'
import type { Item } from '../../deck-format/types'
import { answerText, promptText } from '../../engine/exercises'
import { TYPE_LABELS } from '../../prompt/build'
import { Markdown } from '../../content/Markdown'
import { Demo } from '../../content/Demo'
import { TopBar } from '../../app/Shell'
import { Icon } from '../../ui/Icons'
import { Seg, Tabs } from '../../ui/controls'
import { toast } from '../../ui/toasts'
import { confirmAction } from '../../ui/confirm'
import { CardEditor, DeckInfoEditor } from './CardEditor'
import { FolderSelect } from '../library/FolderSelect'

type Tab = 'overview' | 'cards' | 'manage'

export function DeckPage() {
  const { deckId = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const filter = (sp.get('f') as Filter) || 'all'
  const topic = sp.get('topic')
  const [tab, setTab] = useState<Tab>('overview')
  const [editing, setEditing] = useState<Item | 'new' | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const nav = useNavigate()

  const data = useLiveQuery(async () => {
    const deck = await repo.getDeck(deckId)
    if (!deck) return { deck: undefined }
    const [items, states, record, missed, folders] = await Promise.all([
      repo.getItems(deckId), repo.getCardStates(deckId), repo.getDeckRecord(deckId), repo.missedMost(deckId, 5), db.folders.orderBy('position').toArray(),
    ])
    return { deck, items, states, record, missed, folders }
  }, [deckId])

  const shown = useMemo(() => (data?.items ? filterItems(data.items, filter, topic) : []), [data?.items, filter, topic])
  if (!data) return null
  if (!data.deck) return <div className="page"><h1 className="title">Deck not found</h1><p className="empty-note" style={{ marginTop: 12 }}><Link to="/">Back to the library</Link></p></div>
  const { deck, items, states, record, missed, folders } = data
  const crumbs = folderPath(folders, deck.folderId)
  const m = countMastery(shown, states)
  const pct = shown.length ? Math.round(((m.familiar + m.mastered) / shown.length) * 100) : 0
  const qs = sp.toString() ? `?${sp.toString()}` : ''
  const setParam = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }) }
  const hasTerms = deck.termCount > 0, hasQs = deck.questionCount > 0

  const archive = async () => {
    if (!await confirmAction({ title: `Archive "${deck.title}"?`, body: 'It leaves the library but keeps its cards and progress. You can bring it back from Archive any time.', confirm: 'Archive' })) return
    await repo.setArchived('deck', deckId, true)
    toast('Deck archived', 'Find it under Archive in the sidebar', 'archive')
    nav('/')
  }

  return (
    <>
      <TopBar crumbs={<><Link to="/">Library</Link>{crumbs.map((f) => <span key={f.id}> / <Link to={`/folder/${f.id}`}>{f.name}</Link></span>)} / <b>{deck.title}</b></>}>
        <button className="btn ghost sm" onClick={() => setInfoOpen(true)}><Icon name="edit" />Edit info</button>
        <button className="btn ghost sm" onClick={archive}><Icon name="archive" />Archive</button>
      </TopBar>
      <div className="page">
        <h1 className="title">{deck.title}</h1>
        <div className="meta">
          {deck.course && <><span>{deck.course}</span><i>/</i></>}
          <span>{plural(deck.termCount, 'term')}</span><i>/</i><span>{plural(deck.questionCount, 'question')}</span><i>/</i><span>{plural(deck.topics.length, 'topic')}</span><i>/</i><span>studied {relTime(deck.lastStudiedAt)}</span>
        </div>
        {deck.description && <p className="muted" style={{ marginTop: 12, maxWidth: '70ch', lineHeight: 1.55 }}>{deck.description}</p>}

        <div className="bar-row">
          <button className="btn primary" disabled={!shown.length} onClick={() => nav(`/deck/${deckId}/learn${qs}`)}><Icon name="loop" />Learn</button>
          <button className="btn" disabled={!shown.length} onClick={() => nav(`/deck/${deckId}/flashcards${qs}`)}><Icon name="cards" />Flashcards</button>
          <button className="btn" disabled={!shown.length} onClick={() => nav(`/deck/${deckId}/test${qs}`)}><Icon name="clock" />Test</button>
          <span className="bar-gap" />
          <Seg value={filter} onChange={(v) => setParam('f', v === 'all' ? null : v)} options={[
            { value: 'all', label: 'All' },
            { value: 'questions', label: 'Questions', disabled: !hasQs },
            { value: 'terms', label: 'Terms', disabled: !hasTerms },
          ]} />
          {deck.topics.length > 1 && (
            <select className="select" style={{ width: 'auto', maxWidth: 240, height: 36 }} value={topic ?? ''} onChange={(e) => setParam('topic', e.target.value || null)} aria-label="Topic">
              <option value="">All topics</option>
              {deck.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>

        <div style={{ marginTop: 34 }}>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'cards', label: `Cards (${shown.length})` }, { value: 'manage', label: 'Edit cards' }]} />
        </div>

        {tab === 'overview' && (
          <div className="grid2">
            <div className="panel">
              <h3>Progress <span>{shown.length === items.length ? 'whole deck' : 'current filter'}</span></h3>
              <div className="big">{pct}<small>% learned</small></div>
              <div className="mbar">
                <i style={{ flexGrow: m.mastered, background: 'var(--seg4)' }} /><i style={{ flexGrow: m.familiar, background: 'var(--seg3)' }} />
                <i style={{ flexGrow: m.learning, background: 'var(--seg2)' }} /><i style={{ flexGrow: m.new, background: 'var(--seg1)' }} />
              </div>
              <div className="legend">
                <div><span className="dot" style={{ background: 'var(--seg1)' }} />New<b>{m.new}</b></div>
                <div><span className="dot" style={{ background: 'var(--seg2)' }} />Learning<b>{m.learning}</b></div>
                <div><span className="dot" style={{ background: 'var(--seg3)' }} />Familiar<b>{m.familiar}</b></div>
                <div><span className="dot" style={{ background: 'var(--seg4)' }} />Mastered<b>{m.mastered}</b></div>
              </div>
            </div>
            <div className="panel list">
              <h3>Missed most</h3>
              {missed.length === 0 ? <p className="empty-note">Nothing yet. Items you get wrong in Learn or Flashcards show up here.</p>
                : missed.map((x) => {
                  const it = items.find((i) => i.key === x.key)
                  return it ? <div className="it" key={x.key}><span><Markdown inline>{promptText(it)}</Markdown></span><span className="x">{plural(x.misses, 'miss', 'misses')}</span></div> : null
                })}
            </div>
            <div className="panel">
              <h3>Records</h3>
              <div className="legend" style={{ marginTop: 0 }}>
                <div>Best streak<b>{record.bestStreak}</b></div><div>Sessions<b>{record.sessions}</b></div>
                <div>Accuracy<b>{record.answered ? Math.round((record.correct / record.answered) * 100) + '%' : 'n/a'}</b></div>
                <div>Time studied<b>{fmtDuration(record.secondsStudied)}</b></div>
              </div>
            </div>
            <div className="panel">
              <h3>Manage</h3>
              <div className="field" style={{ marginBottom: 14 }}><span>Folder</span>
                <FolderSelect folders={folders} value={deck.folderId} onChange={(id) => repo.moveDeck(deckId, id)} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn ghost danger sm" onClick={async () => {
                  if (await confirmAction({ title: 'Reset progress for this deck?', body: 'Mneme forgets every answer you gave on these cards. The cards themselves stay.', confirm: 'Reset progress', danger: true })) { await repo.resetDeckProgress(deckId); toast('Progress reset') }
                }}><Icon name="reset" />Reset progress</button>
                <button className="btn ghost danger sm" onClick={async () => {
                  if (await confirmAction({ title: `Delete "${deck.title}"?`, body: `This removes ${plural(items.length, 'card')} and all progress for good. Archiving keeps them instead.`, confirm: 'Delete deck', danger: true })) { await repo.deleteDeck(deckId); toast('Deck deleted'); nav('/') }
                }}><Icon name="trash" />Delete deck</button>
              </div>
            </div>
          </div>
        )}
        {tab === 'cards' && <CardsTable items={shown} topics={deck.topics} />}
        {tab === 'manage' && (
          <ManageCards items={shown} topics={deck.topics} onEdit={setEditing} onDelete={async (it) => {
            if (await confirmAction({ title: 'Delete this card?', body: promptText(it).slice(0, 140), confirm: 'Delete card', danger: true })) { await repo.deleteItem(deckId, it.key); toast('Card deleted') }
          }} />
        )}
      </div>
      {editing && (
        <CardEditor item={editing === 'new' ? null : editing} topics={deck.topics.length ? deck.topics : [{ id: 'general', name: 'General' }]}
          onClose={() => setEditing(null)}
          onSave={async (it) => { await repo.saveItem(deckId, it); setEditing(null); toast(editing === 'new' ? 'Card added' : 'Card saved') }} />
      )}
      {tab === 'manage' && !editing && (
        <button className="fab btn primary" onClick={() => setEditing('new')}><Icon name="plus" />Add a card</button>
      )}
      {infoOpen && (
        <DeckInfoEditor title={deck.title} course={deck.course} description={deck.description} onClose={() => setInfoOpen(false)}
          onSave={async (p) => { await repo.updateDeckInfo(deckId, p); setInfoOpen(false); toast('Deck info saved') }} />
      )}
    </>
  )
}

/** Breadcrumb chain from the top-level folder down to this one. */
function folderPath(folders: Folder[], id: string | null): Folder[] {
  const out: Folder[] = []
  for (let f = folders.find((x) => x.id === id); f; f = folders.find((x) => x.id === f!.parentId)) out.unshift(f)
  return out
}

function fmtDuration(s: number) {
  if (s < 60) return `${s}s`
  const mm = Math.round(s / 60)
  return mm < 60 ? `${mm} min` : `${Math.floor(mm / 60)}h ${mm % 60}m`
}

const typeLabel = (it: Item) => (it.kind === 'term' ? 'Term' : TYPE_LABELS[it.qtype])
const whyOf = (it: Item) => (it.kind === 'question' ? it.explanation : [it.explanation, it.example && `*Example:* ${it.example}`].filter(Boolean).join('\n\n'))

function CardsTable({ items, topics }: { items: Item[]; topics: { id: string; name: string }[] }) {
  if (!items.length) return <p className="empty-note" style={{ marginTop: 22 }}>No cards match this filter.</p>
  return (
    <div className="panel ctable" style={{ marginTop: 22 }}>
      <div className="ct-row ct-head"><span>Type</span><span>Question or term</span><span>Answer</span><span>Explanation</span></div>
      {items.map((it) => (
        <div className="ct-row" key={it.key}>
          <span className="ct-type" title={topics.find((t) => t.id === it.topic)?.name}>{typeLabel(it)}</span>
          <div className="ct-q"><Markdown>{promptText(it)}</Markdown></div>
          <div className="ct-a"><Markdown>{answerText(it)}</Markdown></div>
          <div className="ct-e"><Markdown>{whyOf(it) || ''}</Markdown></div>
        </div>
      ))}
    </div>
  )
}

function ManageCards({ items, topics, onEdit, onDelete }: { items: Item[]; topics: { id: string; name: string }[]; onEdit: (it: Item) => void; onDelete: (it: Item) => void }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const list = needle ? items.filter((it) => JSON.stringify(it).toLowerCase().includes(needle)) : items
  return (
    <div style={{ marginTop: 22 }}>
      <div className="searchbar"><Icon name="search" /><input className="input" placeholder={`Search ${items.length} cards`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {list.map((it) => (
        <div className="mcard" key={it.key}>
          <div className="mc-head">
            <span className="ct-type">{typeLabel(it)}</span>
            <span className="muted" style={{ fontSize: 12 }}>{topics.find((t) => t.id === it.topic)?.name}</span>
            <span style={{ flex: 1 }} />
            <button className="iconbtn" onClick={() => onEdit(it)} title="Edit" aria-label="Edit card"><Icon name="edit" /></button>
            <button className="iconbtn" onClick={() => onDelete(it)} title="Delete" aria-label="Delete card"><Icon name="trash" /></button>
          </div>
          <div className="mc-q"><Markdown>{it.kind === 'term' ? `**${it.term}**: ${it.definition}` : it.prompt}</Markdown></div>
          {it.kind === 'question' && (it.qtype === 'multiple_choice' || it.qtype === 'multiple_select') && (
            <ul className="mc-choices">
              {it.choices.map((c, k) => (
                <li key={k} className={c.correct ? 'right' : ''}>
                  <span className="mark">{c.correct ? <Icon name="check" size={14} /> : <Icon name="x" size={12} />}</span>
                  <div><Markdown inline>{c.text}</Markdown>{c.why && <span className="optwhy">{c.why}</span>}</div>
                </li>
              ))}
            </ul>
          )}
          {it.kind === 'question' && !(it.qtype === 'multiple_choice' || it.qtype === 'multiple_select') && (
            <div className="mc-ans"><span>Answer</span><Markdown inline>{answerText(it)}</Markdown>{it.qtype === 'short_answer' && it.accept.length > 0 && <span className="muted"> · also accepts {it.accept.join(', ')}</span>}</div>
          )}
          {it.kind === 'term' && it.aliases.length > 0 && <div className="mc-ans"><span>Also accepts</span>{it.aliases.join(', ')}</div>}
          {whyOf(it) && <div className="mc-why"><Markdown>{whyOf(it)}</Markdown></div>}
          {it.demo && <DemoToggle demo={it.demo} />}
        </div>
      ))}
    </div>
  )
}

function DemoToggle({ demo }: { demo: NonNullable<Item['demo']> }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: 10 }}>
      <button className="btn ghost sm" onClick={() => setOpen(!open)}><Icon name="spark" />{open ? 'Hide demo' : `Demo${demo.title ? `: ${demo.title}` : ''}`}</button>
      {open && <Demo demo={demo} />}
    </div>
  )
}
