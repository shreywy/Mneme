import { Seg, Toggle } from '../../ui/controls'
import { useSettings } from '../../settings/store'
import { toast } from '../../ui/toasts'
import { paperStyle } from '../../sheets/grid'
import type { Paper } from '../../sheets/types'

const LINES: { id: Paper['lines']; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'ruled', label: 'Ruled' }, { id: 'dots', label: 'Dots' }, { id: 'squares', label: 'Squares' },
]
const COLORS: { id: string | null; label: string; swatch: string }[] = [
  { id: null, label: 'Theme', swatch: 'var(--muted)' }, { id: '#5B7DB8', label: 'Blue', swatch: '#5B7DB8' }, { id: '#6E8F55', label: 'Green', swatch: '#6E8F55' },
]
const SPACING = [{ value: '24', label: 'Compact' }, { value: '28', label: 'College' }, { value: '32', label: 'Wide' }]

/** Lines, spacing, strength, colour and margin for one page, inside Page settings. */
export function PaperSettings({ paper, onChange }: { paper: Paper; onChange: (p: Paper) => void }) {
  const set = (patch: Partial<Paper>) => onChange({ ...paper, ...patch })
  return (
    <div className="paper-settings">
      <h3>Paper</h3>
      <div className="paper-lines" role="radiogroup" aria-label="Lines">
        {LINES.map((l) => (
          <button key={l.id} role="radio" aria-checked={paper.lines === l.id} className={paper.lines === l.id ? 'on' : ''} onClick={() => set({ lines: l.id })}
            style={paperStyle({ ...paper, lines: l.id, spacing: 24, margin: false, strength: Math.max(paper.strength, 0.5) }, { x: 0, y: 0, zoom: 0.5 })}>
            <span>{l.label}</span>
          </button>
        ))}
      </div>
      <div className="srow"><div className="l"><b>Spacing</b></div>
        <Seg value={String(paper.spacing)} options={SPACING} onChange={(v) => set({ spacing: Number(v) as Paper['spacing'] })} /></div>
      <label className="srow"><div className="l"><b>How strong the lines are</b></div>
        <input type="range" min={0} max={1} step={0.05} value={paper.strength} onChange={(e) => set({ strength: Number(e.target.value) })} /></label>
      <div className="srow"><div className="l"><b>Line colour</b></div>
        <div className="paper-colors">
          {COLORS.map((c) => <button key={c.label} aria-label={c.label} aria-pressed={paper.color === c.id} className={paper.color === c.id ? 'on' : ''} style={{ background: c.swatch }} onClick={() => set({ color: c.id })} />)}
        </div>
      </div>
      <div className="srow"><div className="l"><b>Red margin line</b><span>Like notebook paper</span></div><Toggle on={paper.margin} onChange={(margin) => set({ margin })} label="Red margin line" /></div>
      <button className="btn sm ghost" onClick={() => { useSettings.getState().set({ paperDefault: paper }); toast('New pages will use this paper') }}>Use for my new pages</button>
    </div>
  )
}
