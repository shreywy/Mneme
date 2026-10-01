import { useEffect, useRef, useState } from 'react'
import { Sheet } from '../../ui/controls'
import { Icon } from '../../ui/Icons'
import { toast } from '../../ui/toasts'
import { confirmAction } from '../../ui/confirm'
import { relTime } from '../../data/stats'
import { oauthProviders, sendSignInEmail, signInWithProvider, signOut, type OAuthProvider, syncNow, unsyncedCount, useAccount, verifyCode } from '../../sync/account'

const STATUS: Record<string, string> = { off: 'Not syncing', syncing: 'Syncing…', synced: 'Synced', offline: 'Offline. Changes will sync when you reconnect.', error: "Couldn't sync. Mneme will keep trying." }

const PROVIDERS: Record<OAuthProvider, { name: string; icon: React.ReactNode }> = {
  github: { name: 'GitHub', icon: <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" /></svg> },
  google: {
    name: 'Google',
    icon: (
      <svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    ),
  },
}

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAccount()
  return (
    <Sheet onClose={onClose} label="Account" width={460}>
      {user ? <SignedIn onClose={onClose} /> : <SignIn />}
    </Sheet>
  )
}

function SignIn() {
  const [email, setEmail] = useState(() => localStorage.getItem('mneme.lastEmail') ?? '')
  const [stage, setStage] = useState<'email' | 'code'>('email')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [wait, setWait] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)
  const [providers, setProviders] = useState<OAuthProvider[]>([])
  useEffect(() => { oauthProviders().then((p) => setProviders((['github', 'google'] as const).filter((k) => p[k]))) }, [])
  useEffect(() => { if (!wait) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t) }, [wait])
  useEffect(() => { if (stage === 'code') codeRef.current?.focus() }, [stage])

  const send = async () => {
    const e = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(e)) { setErr('Enter a full email address.'); return }
    setBusy(true); setErr('')
    try {
      await sendSignInEmail(e)
      localStorage.setItem('mneme.lastEmail', e)
      setStage('code'); setWait(60)
    } catch (x) { setErr(friendly(x)) } finally { setBusy(false) }
  }
  const verify = async (value = code) => {
    if (value.length < 6) return
    setBusy(true); setErr('')
    try { await verifyCode(email.trim(), value); toast('Signed in', 'Your decks will sync to this account', 'check') }
    catch (x) { setErr(friendly(x)); setCode('') } finally { setBusy(false) }
  }

  return (
    <>
      <h2>{stage === 'email' ? 'Sign in to sync' : 'Check your email'}</h2>
      {stage === 'email' ? (
        <>
          <p className="lede">Your decks, notes, progress and settings follow you to every device.</p>
          {providers.map((p) => (
            <button key={p} className="btn oauth" type="button" disabled={busy} onClick={async () => {
              setBusy(true); setErr('')
              try { await signInWithProvider(p) } catch (x) { setErr(friendly(x)); setBusy(false) }
            }}>{PROVIDERS[p].icon}Continue with {PROVIDERS[p].name}</button>
          ))}
          {providers.length > 0 && <div className="or"><span>or use email</span></div>}
          <form className="formgrid" style={{ gridTemplateColumns: '1fr' }} onSubmit={(e) => { e.preventDefault(); send() }}>
            <label className="field"><span>Email</span>
              <input className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.ca" />
            </label>
            {err && <p className="err">{err}</p>}
            <div className="actions" style={{ marginTop: 4 }}>
              <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</button>
            </div>
          </form>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>Anything you made as a guest on this device moves into your account when you sign in.</p>
        </>
      ) : (
        <>
          <p className="lede">We sent a 6-digit code to <b style={{ color: 'var(--ink)' }}>{email}</b>. It works for 10 minutes. Check spam if it isn't there in a minute.</p>
          <form onSubmit={(e) => { e.preventDefault(); verify() }} style={{ marginTop: 18 }}>
            <input ref={codeRef} className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="000000" aria-label="Sign-in code"
              value={code} onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setCode(v); if (v.length === 6) verify(v) }} />
            {err && <p className="err">{err}</p>}
            <div className="actions">
              <button className="btn ghost" type="button" onClick={() => { setStage('email'); setCode(''); setErr('') }}>Use a different email</button>
              <button className="btn" type="button" disabled={wait > 0 || busy} onClick={send}>{wait > 0 ? `Resend in ${wait}s` : 'Resend'}</button>
              <button className="btn primary" type="submit" disabled={busy || code.length < 6}>{busy ? 'Checking…' : 'Sign in'}</button>
            </div>
          </form>
        </>
      )}
    </>
  )
}

function SignedIn({ onClose }: { onClose: () => void }) {
  const { user, status, lastSync, error } = useAccount()
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(t) }, [])
  return (
    <>
      <h2>Account</h2>
      <p className="lede">{user?.email}</p>
      <div className="srow"><div className="l"><b>Sync</b><span>{STATUS[status]}{status === 'synced' && lastSync ? ` · ${relTime(lastSync)}` : ''}</span></div>
        <span className={`syncdot ${status}`} aria-hidden="true" />
      </div>
      {error && status === 'error' && <p className="err" style={{ fontSize: 12 }}>{error}</p>}
      <div className="actions">
        <button className="btn ghost danger" onClick={async () => {
          const n = unsyncedCount()
          if (!await confirmAction({
            title: 'Sign out?',
            body: `Your decks stay in your account, and this device's copy is removed.${n ? ` ${n} change${n === 1 ? '' : 's'} haven't synced yet; Mneme will try to upload them first.` : ''}`,
            confirm: 'Sign out', danger: true,
          })) return
          await signOut(); onClose(); toast('Signed out')
        }}><Icon name="x" />Sign out</button>
        <button className="btn primary" onClick={() => syncNow()} disabled={status === 'syncing'}><Icon name="reset" />Sync now</button>
      </div>
    </>
  )
}

function friendly(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/rate limit|too many/i.test(m)) return 'Too many emails in a short time. Wait a minute and try again.'
  if (/expired|invalid/i.test(m)) return "That code didn't work. Check it, or request a new one."
  if (/fetch|network/i.test(m)) return "Couldn't reach the server. Check your connection."
  return m
}
