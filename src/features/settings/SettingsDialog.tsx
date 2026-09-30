import { useState } from 'react'
import { ACCENTS, useSettings, type CorrectSound } from '../../settings/store'
import { sfx } from '../../sound/sfx'
import { Seg, Sheet, Toggle } from '../../ui/controls'
import { toast } from '../../ui/toasts'
import { db } from '../../data/db'

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useSettings()
  const [confirmReset, setConfirmReset] = useState(false)
  const resetAll = async () => {
    await db.transaction('rw', db.cards, db.reviews, db.records, async () => { await db.cards.clear(); await db.reviews.clear(); await db.records.clear() })
    setConfirmReset(false)
    toast('Progress reset', 'Your decks are still here')
  }
  return (
    <Sheet onClose={onClose} label="Settings">
      <h2>Settings</h2>
      <div className="srow"><div className="l"><b>Theme</b><span>Paper light or paper dark</span></div>
        <Seg value={s.theme} onChange={(theme) => s.set({ theme })} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} />
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
