import { deleteWithUndo } from '../../app/trash'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Folder } from '../../data/db'
import * as repo from '../../data/repo'
import * as notesRepo from '../../data/notes'
import { LinkPicker } from '../notes/LinkPicker'
import { DropMenu } from '../../ui/DropMenu'
import { ShareDialog } from '../page/ShareDialog'
import { PageSettings } from '../page/PageSettings'
import { countMastery, filterItems, plural, relTime, type Filter } from '../../data/stats'
import type { Item } from '../../deck-format/types'
import { answerText, promptText } from '../../engine/exercises'
import { Markdown } from '../../content/Markdown'
import { Demo } from '../../content/Demo'
import { TopBar } from '../../app/Shell'
import { Icon } from '../../ui/Icons'
import { Seg, Tabs } from '../../ui/controls'
import { toast } from '../../ui/toasts'
import { confirmAction } from '../../ui/confirm'
import { CardEditor, DeckInfoEditor } from './CardEditor'
import { AnimatedNumber, Collapse } from '../../ui/motion'
import { downloadJson, fileSlug, toDeckFile } from '../../deck-format/export'

type Tab = 'overview' | 'cards'

export function DeckPage() {
  const { deckId = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const filter = (sp.get('f') as Filter) || 'all'
  const topic = sp.get('topic')
  const [tab, setTab] = useState<Tab>('overview')
  const [editing, setEditing] = useState<Item | 'new' | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [linking, setLinking] = useState(false)
  const [dialog, setDialog] = useState<null | 'share' | 'settings'>(null)
  const [leaving, setLeaving] = useState(false)
  /** Fade the page out, then go: used after delete and archive so the page doesn't just vanish. */
  const leaveTo = (to: string) => { setLeaving(true); setTimeout(() => nav(to), 200) }
  const nav = useNavigate()

  const data = useLiveQuery(async () => {
    const deck = await repo.getDeck(deckId)
    if (!deck) return { deck: undefined }
    const [items, states, record, missed, folders, notes] = await Promise.all([
      repo.getItems(deckId), repo.getCardStates(deckId), repo.getDeckRecord(deckId), repo.missedMost(deckId, 5), db.folders.orderBy('position').toArray(), notesRepo.notesForDeck(deckId),
    ])
    return { deck, items, states, record, missed, folders, notes }
  }, [deckId])

  const shown = useMemo(() => (data?.items ? filterItems(data.items, filter, topic) : []), [data?.items, filter, topic])
  if (!data) return null
  if (!data.deck) return <div className="page"><h1 className="title">Deck not found</h1><p className="empty-note" style={{ marginTop: 12 }}><Link to="/">Back to the library</Link></p></div>
  const { deck, items, states, record, missed, folders, notes } = data
  const crumbs = folderPath(folders, deck.folderId)
  const m = countMastery(shown, states)
  const pct = shown.length ? Math.round(((m.familiar + m.mastered) / shown.length) * 100) : 0
  const qs = sp.toString() ? `?${sp.toString()}` : ''
  const setParam = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }) }
  const hasTerms = deck.termCount > 0, hasQs = deck.questionCount > 0

  const archive = async () => {
    if (!await confirmAction({ title: `Archive "${deck.title}"?`, body: 'It leaves the library but keeps its cards and progress. You can bring it back from Archive any time.', confirm: 'Archive' })) return
    leaveTo('/')
    setTimeout(async () => { await repo.setArchived('deck', deckId, true); toast('Deck archived', 'Find it under Archive in the sidebar', 'archive') }, 200)
  }

  return (
    <>
      <TopBar crumbs={<><Link to="/">Library</Link>{crumbs.map((f) => <span key={f.id}> / <Link to={`/folder/${f.id}`}>{f.name}</Link></span>)} / <b>{deck.title}</b></>}>
        <DropMenu label="More for this deck" button={({ open, toggle }) => <button className="btn sm ghost" aria-label="More for this deck" aria-expanded={open} onClick={toggle}><Icon name="more" /></button>}>
          {(close) => {
            const item = (label: string, icon: string, fn: () => void, danger = false) => (
              <button role="menuitem" className={danger ? 'danger' : ''} onClick={() => { close(); fn() }}><Icon name={icon} size={15} />{label}</button>
            )
            return <>
              {item('Share…', 'link', () => setDialog('share'))}
              {item('Make a cheat sheet', 'list', () => nav(`/cheatsheet?d=${deckId}`))}
              {item('Export deck file', 'down', () => { downloadJson(`${fileSlug(deck.title)}.mneme.json`, toDeckFile(deck, items)); toast('Deck exported', 'Saved as a .mneme.json file you can re-import or share') })}
              {item('Edit title and description', 'edit', () => setInfoOpen(true))}
              <div className="ctx-sep" role="separator" />
              {item('Page settings…', 'gear', () => setDialog('settings'))}
              {item('Archive', 'archive', archive)}
            </>
          }}
        </DropMenu>
      </TopBar>
      <div className={`page ${leaving ? 'page-leave' : ''}`} key={deckId}>
        <h1 className="title">{deck.title}</h1>
        <div className="meta">
          {deck.course && <><span>{deck.course}</span><i>/</i></>}
          <span>{plural(deck.termCount, 'term')}</span><i>/</i><span>{plural(deck.questionCount, 'question')}</span><i>/</i><span>{plural(deck.topics.length, 'topic')}</span><i>/</i><span>studied {relTime(deck.lastStudiedAt)}</span>
        </div>
        {deck.description && <Description text={deck.description} />}

        <div className="bar-row">
          <button className="btn primary" disabled={!shown.length} onClick={() => nav(`/deck/${deckId}/learn${qs}`)}><Icon name="loop" />Learn</button>
          <button className="btn" disabled={!shown.length} onClick={() => nav(`/deck/${deckId}/flashcards${qs}`)}><Icon name="cards" />Flashcards</button>
          <button className="btn" disabled={!shown.length} onClick={() => nav(`/deck/${deckId}/test${qs}`)}><Icon name="clock" />Test</button>
          <span className="bar-gap" />
          {hasTerms && hasQs && (
            <Seg value={filter} onChange={(v) => setParam('f', v === 'all' ? null : v)} options={[
              { value: 'all', label: 'All' },
              { value: 'questions', label: 'Questions' },
              { value: 'terms', label: 'Terms' },
            ]} />
          )}
          {deck.topics.length > 1 && (
            <select className="select" style={{ width: 'auto', maxWidth: 240, height: 36 }} value={topic ?? ''} onChange={(e) => setParam('topic', e.target.value || null)} aria-label="Topic">
              <option value="">All topics</option>
              {deck.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>

        <div style={{ marginTop: 34 }}>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'cards', label: `All cards (${shown.length})` }]} />
        </div>

        {tab === 'overview' && (
          <div className="grid2 tabpanel">
            <div className="panel">
              <h3>Progress <span>{shown.length === items.length ? 'whole deck' : 'current filter'}</span></h3>
              <div className="big"><AnimatedNumber value={pct} /><small>% learned</small></div>
              <div className="mbar">
                <i style={{ flexGrow: m.mastered, background: 'var(--seg4)' }} /><i style={{ flexGrow: m.familiar, background: 'var(--seg3)' }} />
                <i style={{ flexGrow: m.learning, background: 'var(--seg2)' }} /><i style={{ flexGrow: m.new, background: 'var(--seg1)' }} />
              </div>
              <div className="legend">
                <div><span className="dot" style={{ background: 'var(--seg1)' }} />New<b><AnimatedNumber value={m.new} /></b></div>
                <div><span className="dot" style={{ background: 'var(--seg2)' }} />Learning<b><AnimatedNumber value={m.learning} /></b></div>
                <div><span className="dot" style={{ background: 'var(--seg3)' }} />Familiar<b><AnimatedNumber value={m.familiar} /></b></div>
                <div><span className="dot" style={{ background: 'var(--seg4)' }} />Mastered<b><AnimatedNumber value={m.mastered} /></b></div>
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
            <div className="panel list">
              <h3>Notes for this deck <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setLinking(true)}><Icon name="plus" />Link</button></h3>
              {notes.length === 0 ? <p className="empty-note">No notes linked. Link a notes page to open it from here, and to study this deck from the notes.</p>
                : notes.map((n) => {
                  const r = notesRepo.readingProgress(n)
                  return (
                    <div className="it" key={n.id}>
                      <Link to={`/notes/${n.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--ink)' }}><Icon name="notes" size={14} />{n.title}</Link>
                      <span className="x">{r.read} of {r.total} read</span>
                    </div>
                  )
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
          </div>
        )}
        {tab === 'cards' && (
          <ManageCards items={shown} topics={deck.topics} onEdit={setEditing} onDelete={async (it) => {
            if (await confirmAction({ title: 'Delete this card?', body: promptText(it).slice(0, 140), confirm: 'Delete card', danger: true })) { await repo.deleteItem(deckId, it.key); toast('Card deleted') }
          }} />
        )}
      </div>
      {linking && <LinkPicker kind="notes" deckId={deckId} onClose={() => setLinking(false)} />}
      {dialog === 'share' && <ShareDialog kind="deck" sourceId={deckId} title={deck.title} payload={() => toDeckFile(deck, items)} onClose={() => setDialog(null)} />}
      {dialog === 'settings' && (
        <PageSettings title={deck.title} folders={folders} folderId={deck.folderId} unit={deck.unit} onClose={() => setDialog(null)}
          onFolder={(id) => repo.moveDeck(deckId, id)} onUnit={(u) => repo.setDeckUnit(deckId, u)}>
          <button className="btn sm ghost danger" onClick={async () => {
            if (await confirmAction({ title: 'Reset progress for this deck?', body: 'Mneme forgets every answer you gave on these cards. The cards themselves stay.', confirm: 'Reset progress', danger: true })) { await repo.resetDeckProgress(deckId); toast('Progress reset') }
          }}><Icon name="reset" />Reset progress</button>
          <button className="btn sm ghost danger" onClick={async () => {
            setDialog(null); leaveTo('/'); setTimeout(() => { void deleteWithUndo('deck', deckId) }, 200)
          }}><Icon name="trash" />Delete deck</button>
        </PageSettings>
      )}
      {editing && (
        <CardEditor item={editing === 'new' ? null : editing} topics={deck.topics.length ? deck.topics : [{ id: 'general', name: 'General' }]}
          onClose={() => setEditing(null)}
          onSave={async (it) => { await repo.saveItem(deckId, it); setEditing(null); toast(editing === 'new' ? 'Card added' : 'Card saved') }} />
      )}
      {tab === 'cards' && !editing && (
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

const whyOf = (it: Item) => (it.kind === 'question' ? it.explanation : [it.explanation, it.example && `*Example:* ${it.example}`].filter(Boolean).join('\n\n'))

const GROUP_ORDER = ['term', 'multiple_choice', 'multiple_select', 'true_false', 'short_answer', 'numeric', 'cloze', 'ordering', 'scenario'] as const
const GROUP_LABEL: Record<string, string> = { term: 'Terms', multiple_choice: 'Multiple choice', multiple_select: 'Select all that apply', true_false: 'True or false', short_answer: 'Typed answer', numeric: 'Numeric', cloze: 'Fill in the blank', ordering: 'Put in order', scenario: 'Cases with questions' }

function ManageCards({ items, topics, onEdit, onDelete }: { items: Item[]; topics: { id: string; name: string }[]; onEdit: (it: Item) => void; onDelete: (it: Item) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const needle = q.trim().toLowerCase()
  const list = needle ? items.filter((it) => JSON.stringify(it).toLowerCase().includes(needle)) : items
  const groups = GROUP_ORDER.map((g) => ({ g, cards: list.filter((it) => (it.kind === 'term' ? 'term' : it.qtype) === g) })).filter((x) => x.cards.length)
  const isOpen = (g: string) => (needle ? true : open[g] ?? groups.length === 1)
  return (
    <div style={{ marginTop: 22 }} className="tabpanel">
      <div className="searchbar"><Icon name="search" /><input className="input" placeholder={`Search ${items.length} cards`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {groups.length === 0 && <p className="empty-note">No cards match.</p>}
      {groups.map(({ g, cards }) => (
        <section className={`cgroup ${isOpen(g) ? 'open' : ''}`} key={g}>
          <button className="cg-head" onClick={() => setOpen({ ...open, [g]: !isOpen(g) })} aria-expanded={isOpen(g)}>
            <svg className="i chev"><use href="#i-down2" /></svg>
            <b>{GROUP_LABEL[g]}</b><span className="muted">{cards.length}</span>
          </button>
          <Collapse open={isOpen(g)}><div className="cg-body">{cards.map((it) => <CardRow key={it.key} it={it} topics={topics} onEdit={onEdit} onDelete={onDelete} />)}</div></Collapse>
        </section>
      ))}
    </div>
  )
}

function CardRow({ it, topics, onEdit, onDelete }: { it: Item; topics: { id: string; name: string }[]; onEdit: (it: Item) => void; onDelete: (it: Item) => void }) {
  return (
    <div className="mcard">
      <div className="mc-head">
        <span className="ct-type">{topics.find((t) => t.id === it.topic)?.name}</span>
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
      {it.kind === 'question' && it.qtype === 'scenario' && (
        <ol className="mc-parts">{it.parts.map((p) => <li key={p.key}><Markdown>{p.prompt}</Markdown><div className="mc-ans"><span>Answer</span><Markdown inline>{answerText(p)}</Markdown></div></li>)}</ol>
      )}
      {it.kind === 'question' && !['multiple_choice', 'multiple_select', 'scenario'].includes(it.qtype) && (
        <div className="mc-ans"><span>Answer</span><Markdown inline>{answerText(it)}</Markdown>{it.qtype === 'short_answer' && it.accept.length > 0 && <span className="muted"> · also accepts {it.accept.join(', ')}</span>}</div>
      )}
      {it.kind === 'term' && it.aliases.length > 0 && <div className="mc-ans"><span>Also accepts</span>{it.aliases.join(', ')}</div>}
      {whyOf(it) && <div className="mc-why"><Markdown>{whyOf(it)}</Markdown></div>}
      {it.demo && <DemoToggle demo={it.demo} />}
    </div>
  )
}

function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 160
  return (
    <div className="desc">
      <p className={`muted ${long ? 'clampable' : ''} ${long && !open ? 'clamp' : ''}`}>{text}</p>
      {long && <button className="linkbtn" onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Show more'}</button>}
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
