import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { TopBar } from '../../app/Shell'
import { relTime } from '../../data/stats'
import { exportBackup } from '../../data/backup'
import { downloadJson } from '../../deck-format/export'
import {
  accountsEnabled, clearAllDecks, confirmWithCode, deleteAccount, displayName, sendConfirmCode, signOut, syncNow, unsyncedCount, useAccount,
} from '../../sync/account'
import {
  AVATAR_COLORS, AVATAR_ICONS, loadProfile, saveProfile, uploadAvatar, useProfile, USERNAME_RE, usernameAvailable,
  type Avatar as AvatarData, type AvatarIcon,
} from '../../sync/profile'
import { Avatar } from '../../ui/Avatar'
import { Icon } from '../../ui/Icons'
import { Seg, Sheet } from '../../ui/controls'
import { confirmAction } from '../../ui/confirm'
import { toast } from '../../ui/toasts'
import { SlideToConfirm } from '../../ui/SlideToConfirm'
import { friendly, SignIn, STATUS } from './SignIn'

export function AccountPage() {
  const { user, ready } = useAccount()
  return (
    <>
      <TopBar crumbs={<b>Account</b>} />
      <div className="page account-page">
        {!accountsEnabled ? <p className="muted">Accounts aren't set up in this build. Everything stays in this browser.</p>
          : !ready ? null
          : user ? <SignedIn /> : <div className="acard"><SignIn /></div>}
      </div>
    </>
  )
}

function SignedIn() {
  const { user } = useAccount()
  const { profile, loaded } = useProfile()
  const [danger, setDanger] = useState<null | 'clear' | 'delete'>(null)
  useEffect(() => { loadProfile().catch(() => {}) }, [])
  if (!user) return null
  const firstTime = loaded && !profile
  return (
    <>
      <h1 className="title">{firstTime ? 'Set up your profile' : 'Account'}</h1>
      <p className="muted acct-email">{user.email}</p>

      <ProfileCard key={profile?.username ?? 'new'} firstTime={firstTime} />
      <SyncCard />
      <MethodsCard />

      <div className="acard danger-zone">
        <h2>Danger zone</h2>
        <div className="srow"><div className="l"><b>Clear all decks</b><span>Deletes every deck and its progress on all your devices. Folders and notes stay.</span></div>
          <button className="btn sm danger" onClick={() => setDanger('clear')}>Clear decks…</button>
        </div>
        <div className="srow"><div className="l"><b>Delete account</b><span>Removes your account and everything in it, for good.</span></div>
          <button className="btn sm danger" onClick={() => setDanger('delete')}>Delete account…</button>
        </div>
      </div>

      <div className="acct-foot">
        <SignOutButton />
      </div>
      {danger && <DangerDialog kind={danger} onClose={() => setDanger(null)} />}
    </>
  )
}

// ---------- profile ----------

type Mode = 'letter' | 'icon' | 'image'

function ProfileCard({ firstTime }: { firstTime: boolean }) {
  const { user } = useAccount()
  const saved = useProfile((p) => p.profile)
  const [username, setUsername] = useState(saved?.username ?? (user ? displayName(user).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 24) : ''))
  const [avatar, setAvatar] = useState<AvatarData>(saved?.avatar ?? { kind: 'letter', color: AVATAR_COLORS[0] })
  const [mode, setMode] = useState<Mode>(avatar.kind)
  const [color, setColor] = useState(avatar.kind !== 'image' && avatar.color ? avatar.color : AVATAR_COLORS[0])
  const [icon, setIcon] = useState<AvatarIcon>(avatar.kind === 'icon' ? avatar.icon : 'flame')
  const [nameState, setNameState] = useState<'' | 'checking' | 'free' | 'taken' | 'invalid'>('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Check the name as it's typed, after a short pause.
  useEffect(() => {
    const n = username.trim()
    if (n === saved?.username) { setNameState(''); return }
    if (!USERNAME_RE.test(n)) { setNameState(n ? 'invalid' : ''); return }
    setNameState('checking')
    const t = setTimeout(() => { usernameAvailable(n).then((ok) => setNameState(ok ? 'free' : 'taken')).catch(() => setNameState('')) }, 350)
    return () => clearTimeout(t)
  }, [username, saved?.username])

  const shown: AvatarData = mode === 'image' && avatar.kind === 'image' ? avatar : mode === 'icon' ? { kind: 'icon', icon, color } : { kind: 'letter', color }
  const dirty = !saved || saved.username !== username.trim() || JSON.stringify(saved.avatar) !== JSON.stringify(shown)

  const pickFile = async (f: File) => {
    setBusy(true); setErr('')
    try { const a = await uploadAvatar(f); setAvatar(a); setMode('image') }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't upload that image.") }
    finally { setBusy(false) }
  }
  const save = async () => {
    setBusy(true); setErr('')
    try { await saveProfile({ username: username.trim(), avatar: shown }); toast(firstTime ? 'Profile set up' : 'Profile saved', undefined, 'check') }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="acard profile-card">
      {firstTime && <p className="lede" style={{ marginTop: 0, marginBottom: 16 }}>Pick a name and a picture. You can change both any time.</p>}
      <div className="pc-top">
        <Avatar avatar={shown} name={username || '?'} size={72} />
        <label className="field" style={{ flex: 1, minWidth: 0 }}><span>Username</span>
          <input className="input" value={username} maxLength={24} autoComplete="username" spellCheck={false} onChange={(e) => setUsername(e.target.value)} />
          <small className={`name-state ${nameState}`}>
            {nameState === 'invalid' ? '3 to 24 letters, numbers, dots, dashes or underscores'
              : nameState === 'checking' ? 'Checking…'
              : nameState === 'taken' ? 'Taken. Try another.'
              : nameState === 'free' ? 'Available' : ' '}
          </small>
        </label>
      </div>

      <div className="pc-pick">
        <Seg value={mode} onChange={(m: Mode) => { setMode(m); if (m === 'image' && avatar.kind !== 'image') fileRef.current?.click() }}
          options={[{ value: 'letter', label: 'Letter' }, { value: 'icon', label: 'Icon' }, { value: 'image', label: 'Photo' }]} />
        {mode !== 'image' && (
          <div className="sw" aria-label="Colour">
            {AVATAR_COLORS.map((c) => <button key={c} aria-label={c} title={c} className={color === c ? 'on' : ''} style={{ '--c': c } as React.CSSProperties} onClick={() => setColor(c)} />)}
          </div>
        )}
        {mode === 'icon' && (
          <div className="icon-grid">
            {AVATAR_ICONS.map((i) => (
              <button key={i} className={icon === i ? 'on' : ''} aria-label={i} onClick={() => setIcon(i)} style={icon === i ? { background: color, color: '#FBFAF6' } : undefined}>
                <Icon name={i} size={18} />
              </button>
            ))}
          </div>
        )}
        {mode === 'image' && (
          <div className="srow-btns">
            <button className="btn sm" disabled={busy} onClick={() => fileRef.current?.click()}><Icon name="upload" />{avatar.kind === 'image' ? 'Choose another' : 'Choose a photo'}</button>
            <span className="muted" style={{ fontSize: 12.5 }}>Cropped to a square and shrunk to about 20 KB.</span>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = '' }} />
      </div>

      {err && <p className="err">{err}</p>}
      <div className="actions">
        <button className="btn primary" disabled={busy || !dirty || nameState === 'taken' || nameState === 'invalid' || nameState === 'checking' || (mode === 'image' && avatar.kind !== 'image')} onClick={save}>
          {busy ? 'Saving…' : firstTime ? 'Save profile' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

// ---------- sync ----------

function SyncCard() {
  const { status, lastSync, error } = useAccount()
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(t) }, [])
  const pending = unsyncedCount()
  return (
    <div className="acard">
      <div className="srow" style={{ borderTop: 0, paddingTop: 0 }}>
        <div className="l"><b><span className={`syncdot ${status}`} style={{ marginRight: 8 }} />{STATUS[status]}</b>
          <span>{lastSync ? `Last synced ${relTime(lastSync)}` : 'Not synced yet on this device'}{pending ? ` · ${pending} change${pending === 1 ? '' : 's'} waiting` : ''}</span></div>
        <button className="btn sm" onClick={() => syncNow()} disabled={status === 'syncing'}><Icon name="reset" />Sync now</button>
      </div>
      {error && status === 'error' && <p className="err" style={{ fontSize: 12 }}>{error}</p>}
    </div>
  )
}

function MethodsCard() {
  const { user } = useAccount()
  const methods = [...new Set((user?.identities ?? []).map((i) => i.provider))]
  const label: Record<string, string> = { email: 'Email code', github: 'GitHub', google: 'Google' }
  return (
    <div className="acard">
      <div className="srow" style={{ borderTop: 0, paddingTop: 0, paddingBottom: 0 }}>
        <div className="l"><b>Ways to sign in</b><span>Anything using {user?.email} opens this same account.</span></div>
        <div className="srow-btns">{methods.map((m) => <span key={m} className="mchip">{label[m] ?? m}</span>)}</div>
      </div>
    </div>
  )
}

function SignOutButton() {
  const nav = useNavigate()
  return (
    <button className="btn ghost" onClick={async () => {
      const n = unsyncedCount()
      if (!await confirmAction({
        title: 'Sign out?',
        body: `Your decks stay in your account, and this device's copy is removed.${n ? ` ${n} change${n === 1 ? '' : 's'} haven't synced yet; Mneme will try to upload them first.` : ''}`,
        confirm: 'Sign out', danger: true,
      })) return
      await signOut(); nav('/'); toast('Signed out')
    }}><Icon name="x" />Sign out</button>
  )
}

// ---------- clear decks / delete account ----------

const PHRASE = 'delete my account'

function DangerDialog({ kind, onClose }: { kind: 'clear' | 'delete'; onClose: () => void }) {
  const nav = useNavigate()
  const [step, setStep] = useState<'backup' | 'code' | 'final'>(kind === 'delete' ? 'backup' : 'code')
  const [sentTo, setSentTo] = useState('')
  const [code, setCode] = useState('')
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const send = async () => {
    setBusy(true); setErr('')
    try { setSentTo(await sendConfirmCode()) } catch (e) { setErr(friendly(e)) } finally { setBusy(false) }
  }
  const verify = async (v = code) => {
    if (v.length < 6) return
    setBusy(true); setErr('')
    try { await confirmWithCode(v); setStep('final') } catch (e) { setErr(friendly(e)); setCode('') } finally { setBusy(false) }
  }
  const finish = async () => {
    setBusy(true); setErr('')
    try {
      if (kind === 'clear') { const n = await clearAllDecks(); toast('Decks cleared', `${n} deck${n === 1 ? '' : 's'} deleted`); onClose() }
      else { await deleteAccount(); onClose(); nav('/'); toast('Account deleted', 'Everything in it is gone.') }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }

  return (
    <Sheet onClose={onClose} label={kind === 'clear' ? 'Clear all decks' : 'Delete account'} width={480} top>
      <h2>{kind === 'clear' ? 'Clear all decks' : 'Delete your account'}</h2>
      <ol className="steps">
        {kind === 'delete' && <li className={step === 'backup' ? 'on' : 'done'}>Backup</li>}
        <li className={step === 'code' ? 'on' : step === 'final' ? 'done' : ''}>Email code</li>
        <li className={step === 'final' ? 'on' : ''}>Confirm</li>
      </ol>

      {step === 'backup' && (
        <>
          <p className="lede">This can't be undone. Download a copy of everything first: you can restore it later in Settings, signed in or not.</p>
          <div className="actions">
            <button className="btn" onClick={async () => { downloadJson(`mneme-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportBackup()); toast('Backup downloaded') }}><Icon name="down" />Download everything</button>
            <button className="btn primary" onClick={() => setStep('code')}>Continue</button>
          </div>
        </>
      )}

      {step === 'code' && (
        <>
          <p className="lede">{sentTo ? <>We sent a 6-digit code to <b style={{ color: 'var(--ink)' }}>{sentTo}</b>.</> : 'First, prove it’s you: we’ll email a 6-digit code to the address on this account.'}</p>
          {sentTo ? (
            <form className="codeform" onSubmit={(e) => { e.preventDefault(); verify() }}>
              <input className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" aria-label="Code" autoFocus
                value={code} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); if (v.length === 6) verify(v) }} />
              {err && <p className="err">{err}</p>}
              <button className="btn primary block" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
            </form>
          ) : (
            <>
              {err && <p className="err">{err}</p>}
              <div className="actions"><button className="btn primary" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Email me a code'}</button></div>
            </>
          )}
        </>
      )}

      {step === 'final' && (
        kind === 'clear' ? (
          <>
            <p className="lede">Every deck and its progress will be deleted on all your devices. Folders and notes stay.</p>
            {err && <p className="err">{err}</p>}
            <div style={{ marginTop: 18 }}><SlideToConfirm label="Slide to clear all decks" disabled={busy} onConfirm={finish} /></div>
          </>
        ) : (
          <>
            <p className="lede">Type <b style={{ color: 'var(--ink)' }}>{PHRASE}</b> below, then slide. Your decks, notes, progress, settings and profile are deleted from every device and our servers.</p>
            <input className="input" style={{ marginTop: 14 }} value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder={PHRASE} aria-label="Confirmation phrase" autoComplete="off" spellCheck={false} />
            {err && <p className="err">{err}</p>}
            <div style={{ marginTop: 14 }}><SlideToConfirm label="Slide to delete your account" disabled={busy || phrase.trim().toLowerCase() !== PHRASE} onConfirm={finish} /></div>
          </>
        )
      )}
    </Sheet>
  )
}
