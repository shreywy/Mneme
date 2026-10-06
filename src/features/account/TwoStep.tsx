import { useEffect, useRef, useState } from 'react'
import {
  cancelAuthenticator, checkAuthenticatorCode, listAuthenticators, removeAuthenticator, signOut, startAuthenticator, useAccount, type Authenticator,
} from '../../sync/account'
import { relTime } from '../../data/stats'
import { Sheet } from '../../ui/controls'
import { confirmAction } from '../../ui/confirm'
import { toast } from '../../ui/toasts'
import { Icon } from '../../ui/Icons'

/** Six digits, checked as soon as the sixth is typed. */
function CodeField({ onCode, busy, label }: { onCode: (code: string) => void; busy: boolean; label: string }) {
  const [code, setCode] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  useEffect(() => { if (!busy && code.length === 6) { setCode(''); ref.current?.focus() } }, [busy]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input ref={ref} className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" aria-label={label}
      value={code} disabled={busy} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); if (v.length === 6) onCode(v) }} />
  )
}

/** Shown over everything when this session still needs the authenticator code. Nothing syncs until then. */
export function SecondStepGate() {
  const needed = useAccount((s) => s.secondStep)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (!needed) return null
  const check = async (code: string) => {
    setBusy(true); setErr('')
    try { await checkAuthenticatorCode(code) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return (
    <Sheet onClose={() => {}} label="Two-step sign-in" width={420} top closable={false}>
      <h2 className="acct-h">Enter your authenticator code</h2>
      <p className="lede">Your account has two-step sign-in. Open your authenticator app and type the 6-digit code for Mneme.</p>
      <form className="codeform" onSubmit={(e) => e.preventDefault()}>
        <CodeField onCode={check} busy={busy} label="Authenticator code" />
        {err && <p className="err">{err}</p>}
        <div className="code-links">
          <button className="linkbtn" type="button" onClick={async () => {
            if (await confirmAction({ title: 'Sign out?', body: 'Your account stays as it is, but this device’s copy is removed, including any changes made here that haven’t synced yet. Entering the code keeps them.', confirm: 'Sign out', danger: true })) await signOut()
          }}>Sign out instead</button>
        </div>
      </form>
    </Sheet>
  )
}

/** Account page: turn two-step sign-in on (scan a QR code, type a code), add a backup authenticator, or turn it off. */
export function TwoStepCard() {
  const [list, setList] = useState<Authenticator[] | null>(null)
  const [adding, setAdding] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = () => listAuthenticators().then(setList, () => setList(null))
  useEffect(() => { void load() }, [])
  if (!list) return null
  const start = async () => {
    setErr('')
    try { setAdding(await startAuthenticator()) } catch (e) { toast('Couldn’t start', e instanceof Error ? e.message : String(e)) }
  }
  const finish = async (code: string) => {
    if (!adding) return
    setBusy(true); setErr('')
    try {
      await checkAuthenticatorCode(code, adding.id)
      setAdding(null)
      toast(list.length ? 'Backup authenticator added' : 'Two-step sign-in is on', 'New sign-ins will ask for a code from your app')
      void load()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  const close = () => { if (adding) void cancelAuthenticator(adding.id); setAdding(null); setErr('') }
  return (
    <div className="acard">
      <h2>Two-step sign-in</h2>
      {list.length === 0 ? (
        <div className="srow">
          <div className="l"><b>Off</b><span>Ask for a code from an authenticator app (Google Authenticator, 1Password, Authy…) after signing in, so an emailed code alone can’t open your account.</span></div>
          <button className="btn sm" onClick={start}>Turn on…</button>
        </div>
      ) : (
        <>
          {list.map((a) => (
            <div key={a.id} className="srow">
              <div className="l"><b>{a.name}</b><span>Added {relTime(Date.parse(a.createdAt))}</span></div>
              <button className="btn sm danger" disabled={busy} onClick={async () => {
                const last = list.length === 1
                if (!await confirmAction({ title: last ? 'Turn off two-step sign-in?' : `Remove ${a.name}?`, body: last ? 'Signing in will only need your email code or GitHub/Google again.' : 'Its codes stop working. Your other authenticator still does.', confirm: last ? 'Turn off' : 'Remove', danger: true })) return
                try { await removeAuthenticator(a.id); toast(last ? 'Two-step sign-in is off' : 'Authenticator removed'); void load() } catch (e) { toast('Couldn’t remove it', e instanceof Error ? e.message : String(e)) }
              }}>{list.length === 1 ? 'Turn off' : 'Remove'}</button>
            </div>
          ))}
          <div className="srow">
            <div className="l"><span>There’s no other way back in if you lose your phone. A second authenticator, on another device, is your backup.</span></div>
            <button className="btn sm" onClick={start}>Add a backup…</button>
          </div>
        </>
      )}
      {adding && (
        <Sheet onClose={close} label="Set up an authenticator" width={440}>
          <h2 className="acct-h">Scan this with your authenticator app</h2>
          <div style={{ display: 'grid', justifyItems: 'center', gap: 12, margin: '14px 0' }}>
            <img src={adding.qr} alt="QR code for your authenticator app" width={180} height={180} style={{ background: '#fff', borderRadius: 10, padding: 8 }} />
            <details className="muted small" style={{ textAlign: 'center' }}>
              <summary style={{ cursor: 'pointer' }}>Can’t scan it? Type this key instead</summary>
              <code style={{ display: 'block', marginTop: 6, wordBreak: 'break-all', userSelect: 'all' }}>{adding.secret}</code>
            </details>
          </div>
          <p className="lede">Then type the 6-digit code it shows.</p>
          <form className="codeform" onSubmit={(e) => e.preventDefault()}>
            <CodeField onCode={finish} busy={busy} label="Code from your authenticator app" />
            {err && <p className="err">{err}</p>}
            <button className="btn ghost" type="button" onClick={close}><Icon name="x" />Cancel</button>
          </form>
        </Sheet>
      )}
    </div>
  )
}
