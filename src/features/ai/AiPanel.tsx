import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { db, type Chat } from '../../data/db'
import { ask } from '../../ai/gemini'
import { BUDGET, contentsFor, emptyChat, needsSummary, saveChat, summarize, systemFor } from '../../ai/chat'
import { getKey, loadAiKey, useAiKey } from '../../ai/key'
import { closeAi, NO_KEY, useAiPanel, type AiOpen } from '../../ai/panel'
import { Markdown } from '../../content/Markdown'
import { Icon } from '../../ui/Icons'
import { toast } from '../../ui/toasts'

/** The one AI panel: the tutor, Explain, Ask Gemini and snapshots all open it. */
export function AiPanel() {
  const { cur, n } = useAiPanel()
  const { has } = useAiKey()
  useEffect(() => { void loadAiKey() }, [])
  useEffect(() => {
    if (!cur) return
    // Capture, so Escape closes the panel before a page's own Escape (leaving Learn, say) sees it.
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); closeAi() } }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [cur])
  if (!cur) return null
  return <Panel key={cur.id} o={cur} n={n} hasKey={has} />
}

const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast('Copied'), () => toast('Couldn’t copy', 'Select the text and copy it instead', 'x'))

function Panel({ o, n, hasKey }: { o: AiOpen; n: number; hasKey: boolean }) {
  const [chat, setChat] = useState<Chat | null>(null)
  const [live, setLive] = useState<{ q: string; text: string } | null>(null)
  const [failed, setFailed] = useState<{ q: string; why: string } | null>(null)
  const [draft, setDraft] = useState('')
  const ctl = useRef<AbortController | null>(null)
  const sofar = useRef('')
  const end = useRef<HTMLDivElement>(null)
  const asked = useRef(0)

  useEffect(() => { void db.chats.get(o.id).then((c) => setChat(c ?? emptyChat(o.id, o.title))) }, [o.id, o.title])
  useEffect(() => () => ctl.current?.abort(), [])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [chat, live?.text, failed])

  const send = async (q: string, base: Chat) => {
    const key = await getKey()
    if (!key) { setFailed({ q, why: NO_KEY }); return }
    ctl.current?.abort()
    const c = (ctl.current = new AbortController())
    setFailed(null); sofar.current = ''; setLive({ q, text: '' })
    let cur = base
    const keep = async (answer: string, tokens = cur.tokens) => {
      const next = { ...cur, title: o.title, turns: [...cur.turns, { role: 'user' as const, text: q }, { role: 'model' as const, text: answer }], tokens }
      setChat(next); await saveChat(next)
    }
    try {
      if (needsSummary(cur)) { cur = await summarize(key, cur, c.signal); setChat(cur) }
      const r = await ask(key, { system: systemFor(o.pinned, cur, o.system), contents: contentsFor(cur, o.pinned, q) }, {
        signal: c.signal, onText: (t) => { sofar.current = t; setLive({ q, text: t }) },
      })
      await keep(r.text, r.tokens)
    } catch (e) {
      if (c.signal.aborted) { if (sofar.current) await keep(sofar.current + ' …') }
      else { setChat(cur); setFailed({ q, why: e instanceof Error ? e.message : 'Something went wrong' }) }
    } finally { if (ctl.current === c) { ctl.current = null; setLive(null) } }
  }

  // The question the panel was opened with (once per open, and only into an idle chat).
  useEffect(() => {
    if (!chat || !o.ask || asked.current === n) return
    asked.current = n
    if (hasKey) void send(o.ask, chat)
    else setFailed({ q: o.ask, why: NO_KEY })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat, n])

  const submit = () => {
    const q = draft.trim()
    if (!q || !chat || live) return
    setDraft('')
    void send(q, chat)
  }
  const redo = () => {
    if (!chat || live) return
    const last = chat.turns.at(-2)
    if (last?.role !== 'user') return
    void send(last.text, { ...chat, turns: chat.turns.slice(0, -2) })
  }
  const pct = chat ? Math.min(100, Math.round((chat.tokens / BUDGET) * 100)) : 0

  return (
    <aside className="aipanel" aria-label={`Gemini: ${o.title}`}>
      <header>
        <Icon name="spark" />
        <b title={o.title}>{o.title}</b>
        {chat && chat.tokens > 0 && (
          <span className="ai-meter" title={`This chat uses ${chat.tokens.toLocaleString()} of ${BUDGET.toLocaleString()} tokens. Past 60%, older messages are summarised.`}>
            <i style={{ width: `${pct}%` }} />
          </span>
        )}
        <button className="iconbtn" onClick={closeAi} aria-label="Close" title="Close  Esc"><Icon name="x" /></button>
      </header>
      <div className="ai-log" aria-live="polite">
        {!hasKey && (
          <p className="ai-nokey">{NO_KEY}. It’s free from Google AI Studio and takes a minute. <Link to="/settings#ai" onClick={closeAi}>Open Settings</Link></p>
        )}
        {chat?.summary && <p className="ai-summary" title={chat.summary}>Earlier messages are summarised to keep this chat short.</p>}
        {chat?.turns.map((t, i) => (
          t.role === 'user'
            ? <p key={i} className="ai-q">{t.text}</p>
            : (
              <div key={i} className="ai-a">
                <Markdown dollarMath>{t.text}</Markdown>
                <div className="ai-acts">
                  <button className="btn ghost sm" onClick={() => copy(t.text)}><Icon name="copy" size={14} />Copy</button>
                  {i === chat.turns.length - 1 && !live && <button className="btn ghost sm" onClick={redo}><Icon name="reset" size={14} />Retry</button>}
                </div>
              </div>
            )
        ))}
        {(live || failed) && <p className="ai-q">{(live ?? failed)!.q}</p>}
        {live && <div className="ai-a">{live.text ? <Markdown dollarMath>{live.text}</Markdown> : <span className="ai-dots" aria-label="Thinking"><i /><i /><i /></span>}</div>}
        {failed && (
          <div className="ai-err">
            {failed.why}
            {failed.why !== NO_KEY && <button className="btn sm" onClick={() => chat && send(failed.q, chat)}>Retry</button>}
          </div>
        )}
        <div ref={end} />
      </div>
      <footer>
        <textarea
          rows={1} autoFocus value={draft} placeholder={hasKey ? 'Ask a follow-up' : 'Add a key in Settings first'} disabled={!hasKey}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); submit() } }}
        />
        {live
          ? <button className="btn" onClick={() => ctl.current?.abort()}>Stop</button>
          : <button className="btn primary" onClick={submit} disabled={!draft.trim() || !hasKey}>Ask</button>}
      </footer>
    </aside>
  )
}
