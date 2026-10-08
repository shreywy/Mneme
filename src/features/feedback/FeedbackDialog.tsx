import { useState } from 'react'
import { Seg, Sheet } from '../../ui/controls'
import { toast } from '../../ui/toasts'
import { supabase } from '../../sync/supabase'
import { useAccount } from '../../sync/account'

type Kind = 'bug' | 'idea' | 'other'
const ASK: Record<Kind, string> = {
  bug: 'What happened, and what did you expect to happen?',
  idea: 'What would you like Mneme to do?',
  other: 'What’s on your mind?',
}

// The last few errors on this page, sent with a bug report so it can be traced.
const errors: string[] = []
const keep = (s: string) => { errors.push(s.slice(0, 300)); if (errors.length > 5) errors.shift() }
if (typeof window !== 'undefined') {
  addEventListener('error', (e) => keep(`${e.message} (${e.filename?.split('/').pop()}:${e.lineno})`))
  addEventListener('unhandledrejection', (e) => keep(String(e.reason?.message ?? e.reason)))
}

/** Where the feedback was sent from, without the ids of anyone's pages. */
export const pageOf = (path: string) => path.replace(/^\/(write|deck|notes|folder|s)\/[^/]+/, '/$1/:id')

export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const signedIn = useAccount((a) => !!a.user)
  const [kind, setKind] = useState<Kind>('bug')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const send = async () => {
    setBusy(true); setError('')
    const about = {
      build: import.meta.env.VITE_BUILD,
      browser: navigator.userAgent,
      screen: `${innerWidth}x${innerHeight}`,
      ...(errors.length ? { errors } : {}),
    }
    const { error: e } = await supabase!.rpc('send_feedback', { kind, message: text.trim(), page: pageOf(location.pathname), about })
    setBusy(false)
    if (!e) { toast('Feedback sent', 'Thank you.'); onClose(); return }
    setError(e.message === 'rate_limited' ? (e.hint ?? 'Too much feedback for now. Try again later.') : navigator.onLine ? `Couldn’t send it: ${e.message}` : 'You’re offline. Your message is still here, so send it once you’re back online.')
  }

  return (
    <Sheet onClose={onClose} label="Send feedback" width={520}>
      <h2>Send feedback</h2>
      <p className="lede">Found a bug, or want something changed? It goes straight to the person who makes Mneme.</p>
      <Seg className="fb-kind" value={kind} onChange={setKind} options={[{ value: 'bug', label: 'Something’s broken' }, { value: 'idea', label: 'An idea' }, { value: 'other', label: 'Other' }]} />
      <textarea className="textarea plain fb-text" autoFocus value={text} maxLength={4000} placeholder={ASK[kind]}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim().length >= 3 && !busy) void send() }} />
      <p className="lede fb-note">
        Sent with the kind of page you’re on, your browser and screen size{signedIn ? ', and your account' : ''}. Not your notes or decks.
      </p>
      {error && <p className="fb-error" role="alert">{error}</p>}
      <div className="actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || text.trim().length < 3} onClick={send}>{busy ? 'Sending…' : 'Send'}</button>
      </div>
    </Sheet>
  )
}
