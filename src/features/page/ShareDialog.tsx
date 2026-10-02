import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { relTime } from '../../data/stats'
import { accountsEnabled, useAccount } from '../../sync/account'
import { findShare, publishShare, shareUrl, stopShare, type ShareKind, type ShareRow } from '../../sync/share'
import { Icon } from '../../ui/Icons'
import { Sheet } from '../../ui/controls'
import { confirmAction } from '../../ui/confirm'
import { toast } from '../../ui/toasts'

/** Make a public, read-only link to a deck or notes page. `payload` builds the copy (a deck or notes file). */
export function ShareDialog({ kind, sourceId, title, payload, onClose, children }: { kind: ShareKind; sourceId: string; title: string; payload: () => Promise<unknown> | unknown; onClose: () => void; children?: React.ReactNode }) {
  const { user } = useAccount()
  const nav = useNavigate()
  const [share, setShare] = useState<ShareRow | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { if (user) findShare(kind, sourceId).then(setShare).catch((e) => { setShare(null); setErr(String(e.message ?? e)) }) }, [user, kind, sourceId])

  const publish = async () => {
    setBusy(true); setErr('')
    try { setShare(await publishShare(kind, sourceId, title, await payload())); toast(share ? 'Shared copy updated' : 'Link created', 'Anyone with the link can view it') }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  const copy = async () => { if (share) { await navigator.clipboard.writeText(shareUrl(share.id)).catch(() => {}); toast('Link copied') } }
  const noun = kind === 'deck' ? 'deck' : kind === 'note' ? 'notes page' : 'page'

  return (
    <Sheet onClose={onClose} label="Share" width={500} top>
      <h2>Share this {noun}</h2>
      <p className="lede">{kind === 'sheet'
        ? 'Anyone with the link can view a read-only copy. To keep it, they sign in and it\'s copied into their own library.'
        : 'Anyone with the link can view a clean copy. Your progress, highlights and annotations stay private. To keep it, they sign in and it\'s copied into their own library.'}</p>
      {children}
      {!accountsEnabled ? <p className="muted" style={{ marginTop: 16 }}>Sharing needs accounts, which aren't set up in this build.</p>
        : !user ? (
          <div className="actions"><button className="btn primary" onClick={() => { onClose(); nav('/account') }}>Sign in to share</button></div>
        ) : share === undefined ? <p className="muted" style={{ marginTop: 16 }}>Checking…</p>
          : share ? (
            <>
              <div className="share-link">
                <input className="input" readOnly value={shareUrl(share.id)} onFocus={(e) => e.target.select()} aria-label="Share link" />
                <button className="btn primary" onClick={copy}><Icon name="copy" />Copy</button>
              </div>
              <p className="muted small" style={{ marginTop: 8 }}>Shared copy from {relTime(Date.parse(share.updated_at))}. Changes you make later aren't in it until you update it.</p>
              {err && <p className="err">{err}</p>}
              <div className="actions">
                <button className="btn ghost danger" disabled={busy} onClick={async () => {
                  if (!await confirmAction({ title: 'Stop sharing?', body: 'The link stops working for everyone. Copies people already saved stay theirs.', confirm: 'Stop sharing', danger: true })) return
                  await stopShare(share.id); setShare(null); toast('Sharing stopped')
                }}>Stop sharing</button>
                <button className="btn" disabled={busy} onClick={publish}><Icon name="reset" />{busy ? 'Updating…' : 'Update to the current version'}</button>
              </div>
            </>
          ) : (
            <>
              {err && <p className="err">{err}</p>}
              <div className="actions"><button className="btn primary" disabled={busy} onClick={publish}><Icon name="link" />{busy ? 'Creating…' : 'Create a link'}</button></div>
            </>
          )}
    </Sheet>
  )
}
