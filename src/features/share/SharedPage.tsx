import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { TopBar } from '../../app/Shell'
import { importDeck } from '../../data/repo'
import { importNotes } from '../../data/notes'
import { plural, relTime } from '../../data/stats'
import { Markdown } from '../../content/Markdown'
import { promptText } from '../../engine/exercises'
import { parseAnyText } from '../../notes-format/parse'
import { accountsEnabled, useAccount } from '../../sync/account'
import { AFTER_SIGN_IN, openShare } from '../../sync/share'
import { Icon } from '../../ui/Icons'
import { toast } from '../../ui/toasts'
import { BlockView } from '../notes/blocks'
import { importPage } from '../../data/sheets'
import { parsePagePayload } from '../../sheets/sharepage'
import type { ShareKind } from '../../sync/share'
import { SharedSheet } from '../sheet/SharedSheet'


/** A shared deck or notes page, read-only. Anyone with the link can see it; saving needs an account. */
export function SharedPage() {
  const { shareId = '' } = useParams()
  const nav = useNavigate()
  const { user, ready } = useAccount()
  const [state, setState] = useState<'loading' | 'missing' | 'ok'>('loading')
  const [share, setShare] = useState<{ kind: ShareKind; title: string; payload: unknown; updated_at: string } | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    openShare(shareId).then((s) => { setShare(s); setState(s ? 'ok' : 'missing') }).catch(() => setState('missing'))
  }, [shareId])
  // The copy is someone else's data: it goes through the same parser as any import.
  const parsed = useMemo(() => (share && share.kind !== 'sheet' ? parseAnyText(JSON.stringify(share.payload)) : null), [share])
  const page = useMemo(() => (share?.kind === 'sheet' ? parsePagePayload(share.payload) : null), [share])
  const savePage = async () => {
    if (!page) return
    if (!user) { try { sessionStorage.setItem(AFTER_SIGN_IN, `/s/${shareId}`) } catch { /* private mode */ } nav('/account'); return }
    setSaving(true)
    try { const id = await importPage(page); toast('Saved to your library'); nav(`/write/${id}`) } finally { setSaving(false) }
  }

  const save = async () => {
    if (!parsed || !parsed.result.ok) return
    if (!user) { try { sessionStorage.setItem(AFTER_SIGN_IN, `/s/${shareId}`) } catch { /* private mode */ } nav('/account'); return }
    setSaving(true)
    try {
      if (parsed.kind === 'deck' && parsed.result.ok) { const { deckId } = await importDeck(parsed.result.deck); toast('Saved to your library'); nav(`/deck/${deckId}`) }
      else if (parsed.kind === 'notes' && parsed.result.ok) { const { noteId } = await importNotes(parsed.result.notes, parsed.result.deck); toast('Saved to your library'); nav(`/notes/${noteId}`) }
    } finally { setSaving(false) }
  }

  if (state === 'loading') return <><TopBar crumbs={<b>Shared</b>} /><div className="page"><p className="muted">Opening the link…</p></div></>
  if (state === 'ok' && share && page) {
    return (
      <>
        <TopBar crumbs={<><b>Shared</b> / {share.title}</>}>
          {accountsEnabled && <button className="btn sm primary" disabled={saving || !ready} onClick={savePage}><Icon name="plus" />{user ? (saving ? 'Saving…' : 'Save to my library') : 'Sign in to save'}</button>}
        </TopBar>
        <div className="page shared-page">
          <div className="shared-banner"><Icon name="link" size={14} />A shared page, updated {relTime(Date.parse(share.updated_at))}. Read-only here; save it to write in it and make it yours.</div>
          <SharedSheet page={page} />
        </div>
      </>
    )
  }
  if (state === 'missing' || !share || !parsed?.result.ok) {
    return (
      <>
        <TopBar crumbs={<b>Shared</b>} />
        <div className="page"><h1 className="title">This link doesn't work</h1><p className="muted" style={{ marginTop: 10 }}>It may have been turned off by the person who shared it, or copied incompletely.</p></div>
      </>
    )
  }
  const r = parsed.result
  return (
    <>
      <TopBar crumbs={<><b>Shared</b> / {share.title}</>}>
        {accountsEnabled && <button className="btn sm primary" disabled={saving || !ready} onClick={save}><Icon name="plus" />{user ? (saving ? 'Saving…' : 'Save to my library') : 'Sign in to save'}</button>}
      </TopBar>
      <div className="page shared-page">
        <div className="shared-banner"><Icon name="link" size={14} />A shared {share.kind === 'deck' ? 'deck' : 'notes page'}, updated {relTime(Date.parse(share.updated_at))}. Read-only here; save it to study it, highlight it and make it yours.</div>
        {parsed.kind === 'notes' && 'notes' in r ? (
          <article className="notes-body">
            <header className="notes-head">
              <span className="kind"><Icon name="notes" size={13} />Notes{r.notes.unit ? ` · ${r.notes.unit}` : ''}</span>
              <h1 className="title">{r.notes.title}</h1>
              {r.notes.summary && <p className="notes-summary">{r.notes.summary}</p>}
            </header>
            {r.notes.blocks.map((b, i) => <div key={i} className={`nblock nbw-${b.type}`}><BlockView b={b} /></div>)}
          </article>
        ) : 'deck' in r && r.deck ? (
          <div>
            <span className="kind" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 11.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' }}><Icon name="cards" size={13} />Deck</span>
            <h1 className="title" style={{ marginTop: 6 }}>{r.deck.title}</h1>
            <div className="meta"><span>{plural(r.deck.items.filter((i) => i.kind === 'term').length, 'term')}</span><i>/</i><span>{plural(r.deck.items.filter((i) => i.kind === 'question').length, 'question')}</span>{r.deck.course && <><i>/</i><span>{r.deck.course}</span></>}</div>
            {r.deck.description && <p className="notes-summary">{r.deck.description}</p>}
            <div className="shared-cards">
              {r.deck.items.map((it) => (
                <div key={it.key} className="shared-card">
                  {it.kind === 'term'
                    ? <><b><Markdown inline>{it.term}</Markdown></b><Markdown>{it.definition}</Markdown></>
                    : <><span className="muted small">Question</span><Markdown>{promptText(it)}</Markdown></>}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
