import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import * as repo from '../../data/repo'
import { countMastery, filterItems, plural, relTime, type Filter } from '../../data/stats'
import type { Item } from '../../deck-format/types'
import { answerText, promptText } from '../../engine/exercises'
import { TYPE_LABELS } from '../../prompt/build'
import { Markdown } from '../../content/Markdown'
import { TopBar } from '../../app/Shell'
import { Icon } from '../../ui/Icons'
import { Seg, Tabs } from '../../ui/controls'
import { toast } from '../../ui/toasts'

export function DeckPage() {
  const { deckId = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const filter = (sp.get('f') as Filter) || 'all'
  const topic = sp.get('topic')
  const [tab, setTab] = useState<'overview' | 'cards'>('overview')
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
  const folder = folders.find((f) => f.id === deck.folderId)
  const m = countMastery(shown, states)
  const learned = m.familiar + m.mastered
  const pct = shown.length ? Math.round((learned / shown.length) * 100) : 0
  const qs = sp.toString() ? `?${sp.toString()}` : ''
  const setParam = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }) }
  const hasTerms = deck.termCount > 0, hasQs = deck.questionCount > 0

  return (
    <>
      <TopBar crumbs={<><Link to="/">Library</Link>{folder && <> / <Link to={`/folder/${folder.id}`}>{folder.name}</Link></>} / <b>{deck.title}</b></>} />
      <div className="page">
        <h1 className="title">{deck.title}</h1>
        <div className="meta">
          <span>{plural(deck.termCount, 'term')}</span><i>/</i><span>{plural(deck.questionCount, 'question')}</span><i>/</i><span>{plural(deck.topics.length, 'topic')}</span><i>/</i><span>studied {relTime(deck.lastStudiedAt)}</span>
        </div>
        {deck.description && <p className="muted" style={{ marginTop: 12, maxWidth: '70ch', lineHeight: 1.55 }}>{deck.description}</p>}

        <div className="bar-row">
          <button className="btn primary" disabled={!shown.length} onClick={() => nav(`/deck/${deckId}/learn${qs}`)}><Icon name="loop" />Learn</button>
          <button className="btn" disabled={!shown.length} onClick={() => nav(`/deck/${deckId}/flashcards${qs}`)}><Icon name="cards" />Flashcards</button>
          <button className="btn" disabled={!shown.length} onClick={() => nav(`/deck/${deckId}/test${qs}`)}><Icon name="clock" />Test</button>
          <button className="btn" disabled title="Match is coming in the next update"><Icon name="match" />Match</button>
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
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'cards', label: `Cards (${shown.length})` }]} />
        </div>

        {tab === 'overview' ? (
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
                  return it ? <div className="it" key={x.key}><span><Markdown inline>{promptText(it)}</Markdown></span><span className="x">{x.misses} miss{x.misses === 1 ? '' : 'es'}</span></div> : null
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
            <Manage deckId={deckId} folderId={deck.folderId} folders={folders} />
          </div>
        ) : (
          <CardsList items={shown} topics={deck.topics} />
        )}
      </div>
    </>
  )
}

function fmtDuration(s: number) {
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`
}

function Manage({ deckId, folderId, folders }: { deckId: string; folderId: string | null; folders: { id: string; name: string }[] }) {
  const [confirm, setConfirm] = useState<null | 'reset' | 'delete'>(null)
  const nav = useNavigate()
  return (
    <div className="panel">
      <h3>Manage</h3>
      <label className="field" style={{ marginBottom: 14 }}><span>Folder</span>
        <select className="select" value={folderId ?? ''} onChange={(e) => repo.moveDeck(deckId, e.target.value || null)}>
          <option value="">Not in a folder</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      {confirm ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5 }}>{confirm === 'reset' ? 'Clear all progress for this deck?' : 'Delete this deck and its progress?'}</span>
          <button className="btn sm ghost" onClick={() => setConfirm(null)}>Cancel</button>
          <button className="btn sm danger" onClick={async () => {
            if (confirm === 'reset') { await repo.resetDeckProgress(deckId); toast('Progress reset'); setConfirm(null) }
            else { await repo.deleteDeck(deckId); toast('Deck deleted'); nav('/') }
          }}>{confirm === 'reset' ? 'Reset' : 'Delete'}</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn ghost danger sm" onClick={() => setConfirm('reset')}><Icon name="reset" />Reset progress</button>
          <button className="btn ghost danger sm" onClick={() => setConfirm('delete')}><Icon name="x" />Delete deck</button>
        </div>
      )}
    </div>
  )
}

function CardsList({ items, topics }: { items: Item[]; topics: { id: string; name: string }[] }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!items.length) return <p className="empty-note" style={{ marginTop: 22 }}>No cards match this filter.</p>
  return (
    <div className="panel cardlist" style={{ marginTop: 22 }}>
      {items.map((it) => {
        const why = it.kind === 'question' ? it.explanation : [it.explanation, it.example && `Example: ${it.example}`].filter(Boolean).join('\n\n')
        const isOpen = open === it.key
        return (
          <div className="crow" key={it.key}>
            <span className="tag" title={topics.find((t) => t.id === it.topic)?.name}>{it.kind === 'term' ? 'Term' : TYPE_LABELS[it.qtype]}</span>
            <div className="q"><Markdown>{promptText(it)}</Markdown></div>
            <div className="a">
              <Markdown>{answerText(it)}</Markdown>
              {why && <button className="whybtn" onClick={() => setOpen(isOpen ? null : it.key)}>{isOpen ? 'Hide why' : 'Why'}</button>}
              {why && isOpen && <div className="whytext"><Markdown>{why}</Markdown></div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
