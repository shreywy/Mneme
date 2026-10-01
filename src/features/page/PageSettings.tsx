import { useState, type ReactNode } from 'react'
import type { Folder } from '../../data/db'
import { FolderSelect } from '../library/FolderSelect'
import { Sheet } from '../../ui/controls'

/** Where a page lives (folder, unit) plus its own actions. Opened from the page's ⋯ menu. */
export function PageSettings({ title, folders, folderId, unit, onFolder, onUnit, onClose, children }: {
  title: string; folders: Folder[]; folderId: string | null; unit?: string
  onFolder: (id: string | null) => void; onUnit: (unit: string) => void; onClose: () => void; children?: ReactNode
}) {
  const [u, setU] = useState(unit ?? '')
  const saveUnit = () => { if (u.trim() !== (unit ?? '')) onUnit(u.trim()) }
  return (
    <Sheet onClose={() => { saveUnit(); onClose() }} label="Page settings" width={480} top>
      <h2>Page settings</h2>
      <p className="lede">{title}</p>
      <div className="page-settings">
        <label className="field"><span>Folder</span><FolderSelect folders={folders} value={folderId} onChange={onFolder} /></label>
        <label className="field"><span>Unit</span><input className="input" value={u} placeholder="e.g. Chapter 4" onChange={(e) => setU(e.target.value)} onBlur={saveUnit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} /></label>
      </div>
      {children && <div className="page-settings-actions">{children}</div>}
    </Sheet>
  )
}
