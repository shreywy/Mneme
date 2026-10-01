import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { BackButton, TopBar } from '../../app/Shell'
import { db } from '../../data/db'
import { listNotes } from '../../data/notes'
import { listLibrary } from '../../data/repo'
import { gatherSheet, type SheetInclude, type SheetSource } from '../../notes-format/cheatsheet'
import { Markdown } from '../../content/Markdown'
import { BlockView } from '../notes/blocks'
import { Icon } from '../../ui/Icons'
import { Seg, Sheet } from '../../ui/controls'

type Density = 'cozy' | 'balanced' | 'crunched'
type Paper = 'letter' | 'a4'
const PAPER = { letter: { w: 215.9, h: 279.4, label: 'Letter' }, a4: { w: 210, h: 297, label: 'A4' } }
const DENSITY: Record<Density, { cols: number; margin: number; pt: number }> = {
  cozy: { cols: 2, margin: 14, pt: 10 },
  balanced: { cols: 3, margin: 9, pt: 8.5 },
  crunched: { cols: 4, margin: 5, pt: 7 },
}
const INCLUDE_LABELS: [keyof SheetInclude, string][] = [
  ['quickref', 'Quick references'], ['formulas', 'Formulas'], ['terms', 'Key terms'], ['tips', 'Exam tips and mistakes'], ['worked', 'Worked examples (answers)'], ['charts', 'Charts and diagrams'],
]
const PREFS = 'mneme.cheatsheet'

function loadPrefs(): { density: Density; paper: Paper; include: SheetInclude } {
  const d = { density: 'balanced' as Density, paper: 'letter' as Paper, include: { quickref: true, formulas: true, terms: true, tips: true, worked: false, charts: false } }
  try { return { ...d, ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') } } catch { return d }
}

export function CheatSheetPage() {
  const [sp, setSp] = useSearchParams()
  const noteIds = (sp.get('n') ?? '').split(',').filter(Boolean)
  const deckIds = (sp.get('d') ?? '').split(',').filter(Boolean)
  const [prefs, setPrefs] = useState(loadPrefs)
  const [title, setTitle] = useState('')
  const [picking, setPicking] = useState(false)
  useEffect(() => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)) } catch { /* private mode */ } }, [prefs])

  const sources = useLiveQuery(async (): Promise<SheetSource[]> => {
    const notes = (await db.notes.bulkGet(noteIds)).filter((n): n is NonNullable<typeof n> => !!n)
    const decks = (await db.decks.bulkGet(deckIds)).filter((d): d is NonNullable<typeof d> => !!d)
    const deckSources = await Promise.all(decks.map(async (d): Promise<SheetSource> => {
      const items = await db.items.where('deckId').equals(d.id).sortBy('position')
      return { kind: 'deck', id: d.id, title: d.title, terms: items.flatMap((i) => (i.kind === 'term' ? [{ term: i.term, definition: i.definition }] : [])) }
    }))
    return [...notes.map((n): SheetSource => ({ kind: 'note', id: n.id, title: n.title, blocks: n.blocks })), ...deckSources]
  }, [noteIds.join(), deckIds.join()])
  const sections = useMemo(() => (sources ? gatherSheet(sources, prefs.include) : []), [sources, prefs.include])
  const names = [...new Set((sources ?? []).map((x) => x.title))]
  const shownTitle = title || (names.length === 1 ? names[0] : names.length ? `${names[0]} and ${names.length - 1} more` : 'Cheat sheet')

  const setIds = (n: string[], d: string[]) => { const p = new URLSearchParams(); if (n.length) p.set('n', n.join(',')); if (d.length) p.set('d', d.join(',')); setSp(p, { replace: true }) }
  const dens = DENSITY[prefs.density], paper = PAPER[prefs.paper]

  // Scale the paper preview to fit the space, and estimate how many pages it prints to.
  const wrapRef = useRef<HTMLDivElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [pages, setPages] = useState(1)
  useLayoutEffect(() => {
    const fit = () => {
      const w = wrapRef.current?.clientWidth ?? 0, el = paperRef.current
      if (!w || !el) return
      const pxPerMm = el.offsetWidth / paper.w
      setScale(Math.min(1, (w - 8) / el.offsetWidth))
      setPages(Math.max(1, Math.ceil(el.scrollHeight / ((paper.h - 2 * dens.margin) * pxPerMm + 2 * dens.margin * pxPerMm))))
    }
    fit()
    const ro = new ResizeObserver(fit)
    if (wrapRef.current) ro.observe(wrapRef.current)
    if (paperRef.current) ro.observe(paperRef.current)
    return () => ro.disconnect()
  }, [paper, dens, sections])

  return (
    <>
      <TopBar crumbs={<><BackButton /><b>Cheat sheet</b></>} />
      {/* Page size and margins for printing this sheet. */}
      <style>{`@page { size: ${prefs.paper === 'a4' ? 'A4' : 'letter'}; margin: ${dens.margin}mm; }`}</style>
      <div className="page cheat-page">
        <aside className="cheat-opts">
          <h1 className="title" style={{ fontSize: 30 }}>Cheat sheet</h1>
          <label className="field"><span>Title</span><input className="input" value={title} placeholder={shownTitle} onChange={(e) => setTitle(e.target.value)} /></label>

          <div className="field"><span>From</span>
            <div className="cheat-sources">
              {sources?.map((s) => (
                <div key={s.id} className="cs-row">
                  <Icon name={s.kind === 'note' ? 'notes' : 'cards'} size={14} /><span className="t">{s.title}</span>
                  <button className="iconbtn" aria-label={`Remove ${s.title}`} onClick={() => setIds(noteIds.filter((x) => x !== s.id), deckIds.filter((x) => x !== s.id))}><Icon name="x" size={13} /></button>
                </div>
              ))}
              <button className="btn sm" onClick={() => setPicking(true)}><Icon name="plus" />Add notes or decks</button>
            </div>
          </div>

          <div className="field"><span>Include</span>
            <div className="cheat-checks">
              {INCLUDE_LABELS.map(([k, label]) => (
                <label key={k} className="check"><input type="checkbox" checked={prefs.include[k]} onChange={(e) => setPrefs({ ...prefs, include: { ...prefs.include, [k]: e.target.checked } })} />{label}</label>
              ))}
            </div>
          </div>

          <div className="field"><span>Density</span>
            <Seg value={prefs.density} onChange={(density: Density) => setPrefs({ ...prefs, density })} options={[{ value: 'cozy', label: 'Cozy' }, { value: 'balanced', label: 'Balanced' }, { value: 'crunched', label: 'Crunched' }]} />
            <small className="muted">{prefs.density === 'cozy' ? 'Two columns, easy to read.' : prefs.density === 'balanced' ? 'Three columns, normal margins.' : 'Four columns, small type, thin margins: fits the most.'}</small>
          </div>
          <div className="field"><span>Paper</span>
            <Seg value={prefs.paper} onChange={(p: Paper) => setPrefs({ ...prefs, paper: p })} options={[{ value: 'letter', label: 'Letter' }, { value: 'a4', label: 'A4' }]} />
          </div>

          <div className="cheat-print">
            <button className="btn primary" disabled={!sections.length} onClick={() => window.print()}><Icon name="down" />Print or save as PDF</button>
            <span className="muted small">{sections.length ? `About ${pages} page${pages === 1 ? '' : 's'} on ${paper.label}` : ''}</span>
          </div>
        </aside>

        <div className="cheat-preview" ref={wrapRef}>
          {!sources?.length && <p className="empty-note">Add notes pages or decks to build a sheet from them.</p>}
          {sources && sources.length > 0 && !sections.length && <p className="empty-note">Nothing to show with these choices. Turn on more under Include.</p>}
          {sections.length > 0 && (
            <div className="cheat-scale" style={{ height: paperRef.current ? paperRef.current.offsetHeight * scale : undefined }}>
              <div ref={paperRef} className={`sheet-paper d-${prefs.density}`}
                style={{ width: `${paper.w}mm`, minHeight: `${paper.h}mm`, padding: `${dens.margin}mm`, fontSize: `${dens.pt}pt`, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                <div className="chs-title">{shownTitle}</div>
                <div className="chs-cols" style={{ columnCount: dens.cols }}>
                  {sections.map((sec) => (
                    <section key={sec.id} className="chs-sec">
                      {sections.length > 1 && <div className="chs-src"><Icon name={sec.kind === 'note' ? 'notes' : 'cards'} size={11} />{sec.title}</div>}
                      {sec.parts.map((p, i) => (
                        <div key={i} className={`chs-part chs-${p.kind}`}>
                          <div className="chs-h">{{ quickref: 'Quick reference', formulas: 'Formulas', terms: 'Key terms', tips: 'Exam tips', worked: 'Worked examples', charts: 'Charts' }[p.kind]}</div>
                          {p.kind === 'quickref' && p.blocks.map((b, k) => <BlockView key={k} b={b} />)}
                          {p.kind === 'charts' && p.blocks.map((b, k) => <BlockView key={k} b={b} />)}
                          {p.kind === 'formulas' && p.items.map((f, k) => <div key={k} className="chs-f"><Markdown>{`$$${f.tex}$$`}</Markdown>{f.caption && <small>{f.caption}</small>}</div>)}
                          {p.kind === 'terms' && p.items.map((t, k) => <div key={k} className="chs-t"><b>{t.term}.</b> <Markdown inline>{t.definition}</Markdown></div>)}
                          {p.kind === 'tips' && <ul>{p.items.map((t, k) => <li key={k}><Markdown inline>{t}</Markdown></li>)}</ul>}
                          {p.kind === 'worked' && p.items.map((w, k) => <div key={k} className="chs-w"><Markdown inline>{w.prompt}</Markdown>{(w.answer ?? w.last) && <> <b>→</b> <Markdown inline>{w.answer ?? w.last!}</Markdown></>}</div>)}
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {picking && <SourcePicker noteIds={noteIds} deckIds={deckIds} onClose={() => setPicking(false)} onSave={(n, d) => { setIds(n, d); setPicking(false) }} />}
    </>
  )
}

function SourcePicker({ noteIds, deckIds, onClose, onSave }: { noteIds: string[]; deckIds: string[]; onClose: () => void; onSave: (n: string[], d: string[]) => void }) {
  const data = useLiveQuery(async () => ({ lib: await listLibrary(), notes: await listNotes() }), [])
  const [n, setN] = useState(new Set(noteIds))
  const [d, setD] = useState(new Set(deckIds))
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const folderName = (id: string | null) => (id ? data?.lib.folders.find((f) => f.id === id)?.name ?? 'Folder' : 'Not in a folder')
  const rows = data ? [
    ...data.notes.map((x) => ({ kind: 'note' as const, id: x.id, title: x.title, folder: folderName(x.folderId) })),
    ...data.lib.decks.map((x) => ({ kind: 'deck' as const, id: x.id, title: x.title, folder: folderName(x.folderId) })),
  ].filter((r) => !needle || r.title.toLowerCase().includes(needle)).sort((a, b) => a.folder.localeCompare(b.folder) || a.title.localeCompare(b.title, undefined, { numeric: true })) : []
  const toggle = (kind: 'note' | 'deck', id: string) => {
    const set = new Set(kind === 'note' ? n : d)
    if (set.has(id)) set.delete(id); else set.add(id)
    if (kind === 'note') setN(set); else setD(set)
  }
  let lastFolder = ''
  return (
    <Sheet onClose={onClose} label="Choose what goes on the sheet" width={500} top>
      <h2>Choose sources</h2>
      <div className="searchbar" style={{ marginTop: 12 }}><Icon name="search" /><input className="input" placeholder="Search notes and decks" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      <div className="linklist">
        {rows.map((r) => {
          const head = r.folder !== lastFolder ? r.folder : null
          lastFolder = r.folder
          const on = (r.kind === 'note' ? n : d).has(r.id)
          return (
            <div key={`${r.kind}-${r.id}`}>
              {head && <div className="ll-folder">{head}</div>}
              <label className={`ll-row ${on ? 'on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(r.kind, r.id)} />
                <Icon name={r.kind === 'note' ? 'notes' : 'cards'} size={14} /><span className="t">{r.title}</span>
              </label>
            </div>
          )
        })}
      </div>
      <div className="actions"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => onSave([...n], [...d])}>Use these</button></div>
    </Sheet>
  )
}
