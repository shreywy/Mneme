import { useEffect, useRef, useState } from 'react'
import { ACCENTS, DARK_PALETTES, isDarkTheme, LIGHT_PALETTES, useSettings, type CorrectSound, type DarkPalette, type LightPalette } from '../../settings/store'
import { ColorPicker } from '../../ui/ColorPicker'
import { Collapse } from '../../ui/motion'
import { Icon } from '../../ui/Icons'
import { sfx } from '../../sound/sfx'
import { Seg, Toggle } from '../../ui/controls'
import { TopBar } from '../../app/Shell'
import { toast } from '../../ui/toasts'
import { db } from '../../data/db'
import { ensurePersistentStorage, exportBackup, restoreBackup } from '../../data/backup'
import { downloadJson } from '../../deck-format/export'
import { confirmAction } from '../../ui/confirm'

export function SettingsPage() {
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
  const dark = useEffectiveDark()
  const palettes = dark ? DARK_PALETTES : LIGHT_PALETTES
  const palette = dark ? s.darkPalette : s.lightPalette
  return (
    <>
    <TopBar crumbs={<b>Settings</b>} />
    <div className="page settings-page">
      <h1 className="title">Settings</h1>
      <p className="muted" style={{ marginTop: 6 }}>Preferences for how Mneme looks and behaves. Your account, sync and the destructive actions are on the Account page.</p>
      <Section id="look" title="Appearance" summary="Theme, colours, motion" defaultOpen>
        <div className="srow"><div className="l"><b>Theme</b><span>{s.customBg ? 'Your custom background decides light or dark' : 'Light, dark, or follow your device'}</span></div>
          <Seg value={s.theme} onChange={(theme) => s.set({ theme, customBg: null })} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} />
        </div>
        <div className="srow"><div className="l"><b>{dark ? 'Dark style' : 'Light style'}</b><span>{s.customBg ? 'Custom background' : palettes.find((p) => p.id === palette)?.name}</span></div>
          <div className="sw">
            {palettes.map((p) => <button key={p.id} title={p.name} aria-label={p.name} className={!s.customBg && palette === p.id ? 'on' : ''} style={{ '--c': p.bg } as React.CSSProperties}
              onClick={() => s.set(dark ? { darkPalette: p.id as DarkPalette, customBg: null } : { lightPalette: p.id as LightPalette, customBg: null })} />)}
          </div>
        </div>
        <div className="srow"><div className="l"><b>Custom background</b><span>Any colour. Text and borders adjust to stay readable.</span></div>
          <div className="srow-btns">
            {s.customBg && <button className="btn ghost sm" onClick={() => s.set({ customBg: null })}>Reset</button>}
            <ColorPicker value={s.customBg} fallback={dark ? '#2a2d3a' : '#e9efe4'} active={!!s.customBg} onChange={(customBg) => s.set({ customBg })} label="Custom background colour" />
          </div>
        </div>
        <div className="srow"><div className="l"><b>Accent</b><span>{s.customAccent ? 'Your own colour' : 'Buttons, progress and highlights'}</span></div>
          <div className="sw">
            {ACCENTS.map((a) => <button key={a.id} title={a.name} aria-label={a.name} className={!s.customAccent && s.accent === a.id ? 'on' : ''} style={{ '--c': dark ? a.dark : a.light } as React.CSSProperties} onClick={() => s.set({ accent: a.id, customAccent: null })} />)}
            <ColorPicker value={s.customAccent} fallback={dark ? '#9db0bf' : '#475866'} active={!!s.customAccent} onChange={(customAccent) => s.set({ customAccent })} label="Custom accent colour" />
          </div>
        </div>
        <div className="srow tog"><div className="l"><b>Reduce motion</b><span>Turns animations off</span></div>
          <Toggle on={s.reduceMotion} onChange={(reduceMotion) => s.set({ reduceMotion })} label="Reduce motion" />
        </div>
      </Section>

      <Section id="sound" title="Sound" summary={s.sound ? `On · ${s.correctSound}` : 'Off'}>
        <div className="srow tog"><div className="l"><b>Sounds</b><span>Soft sounds for answers and streaks. M mutes while studying.</span></div>
          <Toggle on={s.sound} onChange={(sound) => s.set({ sound })} label="Sounds" />
        </div>
        <div className="srow"><div className="l"><b>Correct-answer sound</b><span>Pick one to hear it</span></div>
          <Seg value={s.correctSound} onChange={(v: CorrectSound) => { s.set({ correctSound: v }); sfx.preview(v) }}
            options={(['chime', 'pop', 'wood', 'bell', 'marimba', 'pluck'] as const).map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
        </div>
      </Section>

      <Section id="study" title="Studying" summary="Learn mode and tips">
        <div className="srow tog"><div className="l"><b>Match rounds in Learn</b><span>A quick matching round every few term cards</span></div>
          <Toggle on={s.learnMatch} onChange={(learnMatch) => s.set({ learnMatch })} label="Match rounds in Learn" />
        </div>
        <div className="srow"><div className="l"><b>Hidden tips</b><span>{s.hiddenHints.length ? `${s.hiddenHints.length} tip${s.hiddenHints.length === 1 ? '' : 's'} hidden` : 'No tips hidden'}</span></div>
          <button className="btn sm" disabled={!s.hiddenHints.length} onClick={() => { s.set({ hiddenHints: [] }); toast('Tips are back') }}>Show them again</button>
        </div>
      </Section>

      <Section id="data" title="Your data" summary="Storage, backup, reset">
        <div className="srow"><div className="l"><b>Storage</b>
            <span>{persisted ? 'Saved in this browser, marked as persistent so it is not cleared automatically.' : 'Saved in this browser. Ask for persistent storage so the browser keeps it under low disk space.'}</span></div>
          {!persisted && <button className="btn sm" onClick={async () => { const p = await ensurePersistentStorage(); setPersisted(p); toast(p ? 'Storage is now persistent' : 'The browser said no', p ? undefined : 'Firefox may ask first, or allow it after you use the site more', p ? 'check' : 'x') }}>Make persistent</button>}
        </div>
        <div className="srow"><div className="l"><b>Backup</b><span>Every deck, folder and your progress in one file. Restore it here or in another browser.</span></div>
          <div className="srow-btns">
            <button className="btn sm" onClick={backup}>Download</button>
            <button className="btn sm ghost" onClick={() => fileRef.current?.click()}>Restore…</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = '' }} />
          </div>
        </div>
        <div className="srow"><div className="l"><b>Reset all progress</b><span>Clears what Mneme knows about your answers. Decks stay.</span></div>
          {confirmReset
            ? <div className="srow-btns"><button className="btn sm ghost" onClick={() => setConfirmReset(false)}>Cancel</button><button className="btn sm danger" onClick={resetAll}>Yes, reset</button></div>
            : <button className="btn sm danger" onClick={() => setConfirmReset(true)}>Reset…</button>}
        </div>
      </Section>

      <Section id="ai" title="AI" summary="Coming later">
        <div className="srow"><div className="l"><b>Gemini API key</b><span>Optional. Unlocks the tutor and other AI tools in a later update.</span></div>
          <button className="btn sm" disabled>Coming soon</button>
        </div>
      </Section>
    </div>
    </>
  )
}

const OPEN_KEY = 'mneme.settings.sections'
/** A titled group that opens and closes. Which ones are open is remembered on this device. */
function Section({ id, title, summary, defaultOpen = false, children }: { id: string; title: string; summary: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem(OPEN_KEY) ?? 'null') as Record<string, boolean> | null; return v?.[id] ?? defaultOpen } catch { return defaultOpen }
  })
  const toggle = () => {
    const next = !open
    setOpen(next)
    try { localStorage.setItem(OPEN_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}'), [id]: next })) } catch { /* private mode */ }
  }
  return (
    <section className={`sset ${open ? 'open' : ''}`}>
      <button type="button" className="sset-head" onClick={toggle} aria-expanded={open}>
        <span className="t">{title}</span><span className="sum">{summary}</span><Icon name="chev" />
      </button>
      <Collapse open={open}><div className="sset-body">{children}</div></Collapse>
    </section>
  )
}

/** Follows the page's actual light/dark state, including the device switching while "System" is chosen. */
function useEffectiveDark() {
  const s = useSettings()
  const [, bump] = useState(0)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => bump((n) => n + 1)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return isDarkTheme(s)
}
