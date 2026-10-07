import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { ensurePersistentStorage } from '../../data/backup'
import { plural } from '../../data/stats'
import { ancestors, parentsOf } from '../../sheets/tree'
import { buildTree, countTree, zipTitle, type DriveNode, type Item } from '../../importdrive/tree'
import { LIMITS, ZipError, listZip, readEntry } from '../../importdrive/zip'
import type { Dest, Result, Step } from '../../importdrive/write'
import { formatBytes, loadStorage, useStorage } from '../../sync/storage'
import { useAccount } from '../../sync/account'
import { Icon } from '../../ui/Icons'
import { Sheet } from '../../ui/controls'

// Import a Google Drive folder: drop the zip(s) Drive makes when you download a folder, or pick the folder.
// Folders become pages holding their contents; Word, PDF, text and Markdown files become pages.

async function fromZips(files: File[]): Promise<Item[]> {
  const items: Item[] = []
  for (const f of files) for (const e of await listZip(f)) items.push({ path: e.path, size: e.size, read: () => readEntry(f, e) })
  if (items.length > LIMITS.entries) throw new ZipError(`That’s more than ${LIMITS.entries.toLocaleString()} files. Import a smaller folder.`)
  if (items.reduce((s, i) => s + Math.min(i.size, LIMITS.file), 0) > LIMITS.total) throw new ZipError('That unpacks to more than 300 MB. Import a smaller folder.')
  return items
}

const fromFolder = (files: File[]): Item[] => files.map((f) => ({ path: f.webkitRelativePath || f.name, size: f.size, read: async () => new Uint8Array(await f.arrayBuffer()) }))

export function DriveImport({ onClose, page }: { onClose: () => void; page?: string | null }) {
  const nav = useNavigate()
  const [tree, setTree] = useState<DriveNode | null>(null)
  const [off, setOff] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [over, setOver] = useState(false)
  const [reading, setReading] = useState(false)
  const [dest, setDest] = useState(page ? `p:${page}` : 'f:')
  const [step, setStep] = useState<Step | null>(null)
  const [done, setDone] = useState<Result | null>(null)
  const zipInput = useRef<HTMLInputElement>(null)
  const dirInput = useRef<HTMLInputElement>(null)
  const user = useAccount((s) => s.user)
  const usage = useStorage((s) => s.usage)
  useEffect(() => { if (user) loadStorage(60_000).catch(() => {}) }, [user])
  const places = useLiveQuery(async () => {
    const folders = (await db.folders.toArray()).filter((f) => !f.archived).sort((a, b) => a.name.localeCompare(b.name))
    const rows = (await db.sheets.toArray()).filter((s) => !s.archived && !s.deletedAt && !s.hidden)
    const parents = parentsOf(rows)
    const byId = new Map(rows.map((r) => [r.id, r]))
    const pages = rows.map((r) => ({ id: r.id, label: [...ancestors(r.id, parents).reverse().map((a) => byId.get(a)!.title), r.title].join(' › ') }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    return { folders, pages }
  }, [])

  const load = async (get: () => Promise<Item[]>, name: string) => {
    setError(''); setReading(true)
    try {
      const items = await get()
      const t = buildTree(items, name)
      if (!t.children.length) throw new Error('There’s nothing in it to import.')
      setTree(t); setOff(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That couldn’t be read.')
    }
    setReading(false)
  }
  const takeZips = (list: FileList | File[]) => {
    const zips = [...list].filter((f) => /\.zip$/i.test(f.name))
    if (!zips.length) { setError('Drop the .zip file Drive gave you, or pick the folder instead.'); return }
    void load(() => fromZips(zips), zipTitle(zips[0].name))
  }
  const takeFolder = (list: FileList) => {
    const files = [...list]
    if (!files.length) return
    if (files.length > LIMITS.entries) { setError(`That’s more than ${LIMITS.entries.toLocaleString()} files. Import a smaller folder.`); return }
    void load(async () => fromFolder(files), files[0].webkitRelativePath.split('/')[0] || 'Imported')
  }

  const c = tree ? countTree(tree, off) : null
  const room = user && usage && usage.cap !== null ? usage.cap - usage.used : null
  const tooBig = c && room !== null && c.bytes > room
  const run = async () => {
    if (!tree || !c) return
    const target: Dest = dest.startsWith('p:') ? { pageId: dest.slice(2) } : { folderId: dest.slice(2) || null }
    const hasDocx = (n: DriveNode): boolean => !off.has(n.key) && (n.type === 'docx' || n.children.some(hasDocx))
    const pictures = hasDocx(tree) ? await (await import('../sheet/editor/image')).agreeToImgur() : true
    const { importDrive } = await import('../../importdrive/write')
    setStep({ done: 0, total: c.folders + c.files, name: tree.name })
    try {
      const r = await importDrive(tree, target, { off, pictures, onStep: setStep })
      ensurePersistentStorage()
      setDone(r)
    } catch (e) {
      // Pages made before it stopped stay; the dialog mustn't stay stuck on "Importing…".
      setStep(null)
      const full = e instanceof Error && (e.name === 'QuotaExceededError' || /quota/i.test(e.message))
      setError(`The import stopped: ${full ? 'this browser has no more room for Mneme’s data' : e instanceof Error && e.message ? e.message : 'something went wrong'}. Pages made before that are kept.`)
    }
  }

  if (done) {
    return (
      <Sheet onClose={onClose} label="Import a Google Drive folder" width={560}>
        <h2>Imported</h2>
        <p className="lede">{plural(done.pages, 'page')} from {tree?.name}.{done.failed.length ? ` ${plural(done.failed.length, 'file')} couldn’t be read:` : ''}</p>
        {done.failed.length > 0 && <ul className="drive-failed">{done.failed.map((f, i) => <li key={i}><b>{f.name}</b> · {f.why}</li>)}</ul>}
        <div className="actions">
          <button className="btn ghost" onClick={onClose}>Close</button>
          {done.top && <button className="btn primary" onClick={() => { onClose(); nav(`/write/${done.top}`) }}>Open {tree?.name}</button>}
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet onClose={() => { if (!step) onClose() }} label="Import a Google Drive folder" width={620}>
      <h2>Import a Google Drive folder</h2>
      <p className="lede">In Drive, right-click the folder and choose <b>Download</b>. Drive gives you a <code>.zip</code> (big folders come as several). Drop them all here. Folders become pages that hold their contents. Word, PDF, text and Markdown files become pages.</p>

      {!tree && (
        <>
          <div className={`drop ${over ? 'over' : ''}`} onClick={() => zipInput.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); takeZips(e.dataTransfer.files) }}>
            <Icon name="upload" size={22} />
            <div style={{ marginTop: 8 }}>{reading ? <b>Reading…</b> : <><b className="for-keys">Drop the zip here</b><span className="for-keys"> or click to choose</span><b className="for-touch">Tap to choose the zip</b></>}</div>
            <input ref={zipInput} type="file" accept=".zip,application/zip" multiple hidden onChange={(e) => { if (e.target.files) takeZips(e.target.files); e.target.value = '' }} />
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn ghost sm" onClick={() => dirInput.current?.click()}><Icon name="folder" size={14} />Pick a folder instead</button>
            <input ref={dirInput} type="file" hidden multiple {...{ webkitdirectory: '' }} onChange={(e) => { if (e.target.files) takeFolder(e.target.files); e.target.value = '' }} />
          </div>
        </>
      )}
      {error && <p className="drive-error" role="alert">{error}</p>}

      {tree && c && (
        <>
          <div className="drive-tree" role="tree" aria-label="What will be imported">
            <Row n={tree} off={off} setOff={setOff} depth={0} />
          </div>
          <p className="drive-sum">
            {plural(c.folders + c.files, 'page')} ({c.folders} from folders, {c.files} from files) · about {formatBytes(c.bytes)}{room !== null && usage?.cap ? ` of your ${formatBytes(usage.cap)}` : ''}{c.skipped ? ` · ${plural(c.skipped, 'file')} skipped` : ''}
          </p>
          {tooBig && <p className="drive-error" role="alert">That won’t fit in your space: it needs about {formatBytes(c.bytes)} and you have {formatBytes(Math.max(0, room!))} left. Free up {formatBytes(c.bytes - room!)}, or untick some files.</p>}
          <label className="drive-dest">Put it
            <select className="input" value={dest} onChange={(e) => setDest(e.target.value)} disabled={!!step}>
              <optgroup label="In a folder">
                <option value="f:">No folder</option>
                {places?.folders.map((f) => <option key={f.id} value={`f:${f.id}`}>{f.name}</option>)}
              </optgroup>
              {!!places?.pages.length && <optgroup label="Inside a page (in a new “Imported” box)">
                {places.pages.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.label}</option>)}
              </optgroup>}
            </select>
          </label>
          {step && (
            <div className="drive-progress" aria-live="polite">
              <progress max={step.total || 1} value={step.done} />
              <span>{step.name ? `Reading ${step.name}… ${Math.min(step.done + 1, step.total)} of ${step.total}` : 'Finishing…'}</span>
            </div>
          )}
          <div className="actions">
            <button className="btn ghost" disabled={!!step} onClick={() => { setTree(null); setError('') }}>Choose something else</button>
            <button className="btn primary" disabled={!!step || !!tooBig || !(c.folders + c.files)} onClick={() => void run()}>{step ? 'Importing…' : `Import ${plural(c.folders + c.files, 'page')}`}</button>
          </div>
        </>
      )}
    </Sheet>
  )
}

/** One item in the preview: a checkbox (unticking a folder leaves out everything in it), or why it's skipped. */
function Row({ n, off, setOff, depth }: { n: DriveNode; off: Set<string>; setOff: (s: Set<string>) => void; depth: number }) {
  const on = !off.has(n.key)
  return (
    <div role="treeitem" aria-expanded={n.folder ? on : undefined}>
      <div className={`drive-row ${n.skip ? 'skip' : ''}`} style={{ paddingLeft: depth * 18 }}>
        {n.skip
          ? <><Icon name="x" size={13} /><s>{n.name}</s><em className="drive-why">{n.skip}</em></>
          : <label>
              <input type="checkbox" checked={on} disabled={depth === 0} onChange={() => { const s = new Set(off); if (on) s.add(n.key); else s.delete(n.key); setOff(s) }} />
              <Icon name={n.folder ? 'folder' : 'page'} size={14} />{n.name}
              {n.folder && <em className="drive-why">page with sub-pages</em>}
            </label>}
      </div>
      {n.folder && on && n.children.map((k) => <Row key={k.key} n={k} off={off} setOff={setOff} depth={depth + 1} />)}
    </div>
  )
}
