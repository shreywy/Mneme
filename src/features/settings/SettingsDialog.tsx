import { useEffect, useRef, useState } from 'react'
import { DARK_PALETTES, ACCENTS, useSettings, type CorrectSound } from '../../settings/store'
import { sfx } from '../../sound/sfx'
import { Seg, Sheet, Toggle } from '../../ui/controls'
import { toast } from '../../ui/toasts'
import { db } from '../../data/db'
import { ensurePersistentStorage, exportBackup, restoreBackup } from '../../data/backup'
import { downloadJson } from '../../deck-format/export'
import { confirmAction } from '../../ui/confirm'

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useSettings()
  const [confirmReset, setConfirmReset] = useState(false)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null)) }, [])
  const backup = async () => {
    downloadJson(`mneme-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportBackup())
    toast('Backup downloaded', 'Keep it somewhere safe, like your Drive')
  }
  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      if (!await confirmAction({ title: 'Restore this backup?', body: 'Decks, folders and progress from the file are added. Anything with the same id is replaced by the backup version.', confirm: 'Restore' })) return
      const r = await restoreBackup(data)
      toast('Backup restored', `${r.decks} deck${r.decks === 1 ? '' : 's'}`)
    } catch (e) { toast("Couldn't restore", e instanceof Error ? e.message : 'The file could not be read', 'x') }
  }
  const resetAll = async () => {
    // toCollection().delete() (not clear()) so each deletion is queued for sync
    await db.transaction('rw', db.cards, db.reviews, db.records, async () => { await db.cards.toCollection().delete(); await db.reviews.toCollection().delete(); await db.records.toCollection().delete() })
    setConfirmReset(false)
    toast('Progress reset', 'Your decks are still here')
  }
  return (
    <Sheet onClose={onClose} label="Settings">
      <h2>Settings</h2>
      <div className="srow"><div className="l"><b>Theme</b><span>{s.customBg ? 'Your custom background decides light or dark' : 'Light, dark, or follow your device'}</span></div>
        <Seg value={s.theme} onChange={(theme) => s.set({ theme, customBg: null })} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} />
      </div>
      <div className="srow"><div className="l"><b>Dark style</b><span>{DARK_PALETTES.find((p) => p.id === s.darkPalette)?.name}</span></div>
        <div className="sw">
          {DARK_PALETTES.map((p) => <button key={p.id} title={p.name} aria-label={p.name} className={!s.customBg && s.darkPalette === p.id ? 'on' : ''} style={{ '--c': p.bg } as React.CSSProperties} onClick={() => s.set({ darkPalette: p.id, customBg: null, theme: s.theme === 'light' ? 'dark' : s.theme })} />)}
        </div>
      </div>
      <div className="srow"><div className="l"><b>Custom background</b><span>Pick any colour. Text and borders adjust to stay readable.</span></div>
        <div className="custombg">
          {s.customBg && <button className="btn ghost sm" onClick={() => s.set({ customBg: null })}>Reset</button>}
          <label className={`sw-pick ${s.customBg ? 'on' : ''}`} style={{ '--c': s.customBg ?? 'conic-gradient(#E58B74, #D8B062, #A7BE8A, #86B59C, #9DB0BF, #B9A3D6, #E58B74)' } as React.CSSProperties} title="Choose a background colour">
            <input type="color" value={s.customBg ?? '#2A2D3A'} onChange={(e) => s.set({ customBg: e.target.value })} aria-label="Custom background colour" />
          </label>
        </div>
      </div>
      <div className="srow"><div className="l"><b>Accent</b><span>Buttons, progress and highlights</span></div>
        <div className="sw">
          {ACCENTS.map((a) => <button key={a.id} title={a.name} aria-label={a.name} className={s.accent === a.id ? 'on' : ''} style={{ '--c': a.light } as React.CSSProperties} onClick={() => s.set({ accent: a.id })} />)}
        </div>
      </div>
      <div className="srow"><div className="l"><b>Sounds</b><span>Soft sounds for answers and streaks. M mutes while studying.</span></div>
        <Toggle on={s.sound} onChange={(sound) => s.set({ sound })} label="Sounds" />
      </div>
      <div className="srow col"><div className="l"><b>Correct-answer sound</b><span>Click one to hear it</span></div>
        <Seg value={s.correctSound} onChange={(v: CorrectSound) => { s.set({ correctSound: v }); sfx.preview(v) }}
          options={(['chime', 'pop', 'wood', 'bell', 'marimba', 'pluck'] as const).map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
      </div>
      <div className="srow"><div className="l"><b>Reduce motion</b><span>Turns animations off</span></div>
        <Toggle on={s.reduceMotion} onChange={(reduceMotion) => s.set({ reduceMotion })} label="Reduce motion" />
      </div>
      <div className="srow"><div className="l"><b>Your data</b>
          <span>{persisted ? 'Saved in this browser, marked as persistent so it is not cleared automatically.' : 'Saved in this browser. Ask for persistent storage so the browser keeps it under low disk space.'}</span></div>
        {!persisted && <button className="btn sm" onClick={async () => { const p = await ensurePersistentStorage(); setPersisted(p); toast(p ? 'Storage is now persistent' : "The browser said no", p ? undefined : 'Firefox may ask first, or allow it after you use the site more', p ? 'check' : 'x') }}>Make persistent</button>}
      </div>
      <div className="srow"><div className="l"><b>Backup</b><span>Every deck, folder and your progress in one file. Restore it here or in another browser.</span></div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn sm" onClick={backup}>Download</button>
          <button className="btn sm ghost" onClick={() => fileRef.current?.click()}>Restore…</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = '' }} />
        </div>
      </div>
      <div className="srow"><div className="l"><b>Hidden tips</b><span>{s.hiddenHints.length ? `${s.hiddenHints.length} tip${s.hiddenHints.length === 1 ? '' : 's'} hidden` : 'No tips hidden'}</span></div>
        <button className="btn sm" disabled={!s.hiddenHints.length} onClick={() => { s.set({ hiddenHints: [] }); toast('Tips are back') }}>Show them again</button>
      </div>
      <div className="srow"><div className="l"><b>Match rounds in Learn</b><span>A quick matching round every few term cards</span></div>
        <Toggle on={s.learnMatch} onChange={(learnMatch) => s.set({ learnMatch })} label="Match rounds in Learn" />
      </div>
      <div className="srow"><div className="l"><b>Gemini API key</b><span>Optional. Unlocks the tutor and other AI tools in a later update.</span></div>
        <button className="btn sm" disabled>Coming soon</button>
      </div>
      <div className="srow"><div className="l"><b>Reset all progress</b><span>Clears what Mneme knows about your answers. Decks stay.</span></div>
        {confirmReset
          ? <div style={{ display: 'flex', gap: 6 }}><button className="btn sm ghost" onClick={() => setConfirmReset(false)}>Cancel</button><button className="btn sm danger" onClick={resetAll}>Yes, reset</button></div>
          : <button className="btn sm danger" onClick={() => setConfirmReset(true)}>Reset…</button>}
      </div>
    </Sheet>
  )
}
