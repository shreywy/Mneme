import { Fragment, useMemo, useState } from 'react'
import { Markdown } from '../../content/Markdown'
import type { Block, TreeNode } from '../../notes-format/types'

type B<T extends Block['type']> = Extract<Block, { type: T }>
const OPS = new Set(['=', '+', '−', '-', '×', '÷', '→', '*', '/'])
const PALETTE = ['var(--accent)', '#C8742C', 'var(--seg3)', '#6B7F95']

export function Flow({ b }: { b: B<'flow'> }) {
  return (
    <div className="flow">
      {b.rows.map((row, i) => (
        <Fragment key={i}>
          {i > 0 && <div className="flow-link"><span className="line" />{row.link && <span className="lab">{row.link}</span>}</div>}
          <div className="flow-row">
            {row.parts.map((p, k) => OPS.has(p.trim())
              ? <span key={k} className="flow-op">{p.trim() === '-' ? '−' : p.trim()}</span>
              : <span key={k} className="flow-chip"><Markdown inline>{p}</Markdown></span>)}
          </div>
        </Fragment>
      ))}
    </div>
  )
}

export function Steps({ b }: { b: B<'steps'> }) {
  return (
    <ol className="steps">
      {b.items.map((s, i) => (
        <li key={i}><span className="num">{i + 1}</span><div>{s.title && <b>{s.title}</b>}<Markdown>{s.text}</Markdown></div></li>
      ))}
    </ol>
  )
}

export function Cycle({ b }: { b: B<'cycle'> }) {
  const n = b.items.length
  const R = 38 // percent of the box
  return (
    <div className="cycle" role="list">
      <svg viewBox="0 0 100 100" className="ring" aria-hidden="true">
        <defs><marker id="cyc-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--muted)" /></marker></defs>
        {b.items.map((_, i) => {
          const a0 = (i / n) * 2 * Math.PI - Math.PI / 2 + 0.32, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2 - 0.32
          const p = (a: number) => `${50 + R * Math.cos(a)} ${50 + R * Math.sin(a)}`
          return <path key={i} d={`M ${p(a0)} A ${R} ${R} 0 0 1 ${p(a1)}`} fill="none" stroke="var(--line)" strokeWidth="0.8" markerEnd="url(#cyc-arrow)" />
        })}
      </svg>
      {b.items.map((it, i) => {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2
        return <span role="listitem" key={i} className="cycle-item" style={{ left: `${50 + R * Math.cos(a)}%`, top: `${50 + R * Math.sin(a)}%` }}>{it}</span>
      })}
    </div>
  )
}

export function Compare({ b }: { b: B<'compare'> }) {
  return (
    <div className="compare" style={{ gridTemplateColumns: `repeat(${b.columns.length}, 1fr)` }}>
      {b.columns.map((c, i) => (
        <div key={i} className="compare-col"><b>{c.title}</b><ul>{c.points.map((p, k) => <li key={k}><Markdown inline>{p}</Markdown></li>)}</ul></div>
      ))}
    </div>
  )
}

export function Decision({ b }: { b: B<'decision'> }) {
  const [sel, setSel] = useState<number | null>(null)
  const last = b.columns.length - 1
  return (
    <div className="decision">
      {b.title && <div className="vis-title">{b.title}</div>}
      <table>
        <thead><tr>{b.columns.map((c, i) => <th key={i} className={i === last ? 'out' : ''}>{c}</th>)}</tr></thead>
        <tbody>
          {b.rows.map((r, i) => (
            <tr key={i} className={sel === i ? 'on' : sel !== null ? 'off' : ''} onClick={() => setSel(sel === i ? null : i)} tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSel(sel === i ? null : i)}>
              {r.map((cell, k) => <td key={k} className={k === last ? 'out' : ''}><Markdown inline>{cell}</Markdown></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="hint">Click a row to follow it through.</div>
    </div>
  )
}

function TreeItem({ n }: { n: TreeNode }) {
  return <li><span className="tree-node">{n.label}</span>{n.children.length > 0 && <ul>{n.children.map((c, i) => <TreeItem key={i} n={c} />)}</ul>}</li>
}
export function Tree({ b }: { b: B<'tree'> }) {
  return <ul className="ntree"><TreeItem n={b.root} /></ul>
}

export function Timeline({ b }: { b: B<'timeline'> }) {
  return (
    <ol className="timeline">
      {b.items.map((it, i) => <li key={i}><span className="when">{it.when}</span><Markdown>{it.text}</Markdown></li>)}
    </ol>
  )
}

const fmt = (v: number, unit?: string) => `${unit === '$' ? '$' : ''}${v.toLocaleString()}${unit && unit !== '$' ? ` ${unit}` : ''}`

export function Chart({ b }: { b: B<'chart'> }) {
  const W = 560, H = 240, pad = { l: 44, r: 12, t: 16, b: 34 }
  const all = b.series.flatMap((s) => s.values)
  const max = Math.max(0, ...all), min = Math.min(0, ...all)
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / (max - min || 1))
  const n = b.labels.length
  const bandW = (W - pad.l - pad.r) / n
  if (b.kind === 'pie') {
    const vals = b.series[0].values, total = vals.reduce((a, c) => a + Math.max(0, c), 0) || 1
    let acc = 0
    return (
      <figure className="chart">
        {b.title && <figcaption className="vis-title">{b.title}</figcaption>}
        <div className="pie">
          <svg viewBox="-1.1 -1.1 2.2 2.2" width="180" height="180" role="img" aria-label={b.title ?? 'Pie chart'}>
            {vals.map((v, i) => {
              const a0 = (acc / total) * 2 * Math.PI - Math.PI / 2; acc += Math.max(0, v)
              const a1 = (acc / total) * 2 * Math.PI - Math.PI / 2
              const large = a1 - a0 > Math.PI ? 1 : 0
              const d = vals.length === 1 ? 'M 1 0 A 1 1 0 1 1 -1 0 A 1 1 0 1 1 1 0' : `M 0 0 L ${Math.cos(a0)} ${Math.sin(a0)} A 1 1 0 ${large} 1 ${Math.cos(a1)} ${Math.sin(a1)} Z`
              return <path key={i} d={d} fill={PALETTE[i % PALETTE.length]} stroke="var(--surface)" strokeWidth="0.02" />
            })}
          </svg>
          <ul className="legend-list">{b.labels.map((l, i) => <li key={i}><span className="dot" style={{ background: PALETTE[i % PALETTE.length] }} />{l}<b>{fmt(vals[i], b.unit)}</b></li>)}</ul>
        </div>
      </figure>
    )
  }
  const ticks = [min, (min + max) / 2, max]
  return (
    <figure className="chart">
      {b.title && <figcaption className="vis-title">{b.title}</figcaption>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={b.title ?? 'Chart'}>
        {ticks.map((t, i) => (
          <g key={i}><line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? '' : '3 3'} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="axis">{Math.round(t).toLocaleString()}</text></g>
        ))}
        {b.labels.map((l, i) => <text key={i} x={pad.l + bandW * (i + 0.5)} y={H - 12} textAnchor="middle" className="axis">{l}</text>)}
        {b.kind === 'bar'
          ? b.series.map((s, si) => s.values.map((v, i) => {
            const gw = bandW * 0.7, bw = gw / b.series.length
            const x = pad.l + bandW * i + (bandW - gw) / 2 + bw * si
            return (
              <g key={`${si}-${i}`}>
                <rect x={x + 1} width={bw - 2} y={Math.min(y(v), y(0))} height={Math.abs(y(v) - y(0))} rx="3" fill={PALETTE[si % PALETTE.length]} />
                <text x={x + bw / 2} y={Math.min(y(v), y(0)) - 5} textAnchor="middle" className="val">{v.toLocaleString()}</text>
              </g>
            )
          }))
          : b.series.map((s, si) => (
            <g key={si}>
              <polyline fill="none" stroke={PALETTE[si % PALETTE.length]} strokeWidth="2.5" strokeLinejoin="round" points={s.values.map((v, i) => `${pad.l + bandW * (i + 0.5)},${y(v)}`).join(' ')} />
              {s.values.map((v, i) => <g key={i}><circle cx={pad.l + bandW * (i + 0.5)} cy={y(v)} r="4" fill="var(--surface)" stroke={PALETTE[si % PALETTE.length]} strokeWidth="2" /><text x={pad.l + bandW * (i + 0.5)} y={y(v) - 10} textAnchor="middle" className="val">{v.toLocaleString()}</text></g>)}
            </g>
          ))}
      </svg>
      {b.series.length > 1 && <ul className="legend-list row">{b.series.map((s, i) => <li key={i}><span className="dot" style={{ background: PALETTE[i % PALETTE.length] }} />{s.name}</li>)}</ul>}
      {b.unit && <div className="hint">Values in {b.unit === '$' ? 'dollars' : b.unit}</div>}
    </figure>
  )
}

/** Left-to-right layered layout: each node's column is its longest distance from a source. */
function layout(nodes: { id: string; label: string }[], edges: { from: string; to: string }[]) {
  const ids = new Set(nodes.map((n) => n.id))
  const es = edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
  const level = new Map(nodes.map((n) => [n.id, 0]))
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false
    for (const e of es) {
      const next = level.get(e.from)! + 1
      if (next > level.get(e.to)! && next < nodes.length) { level.set(e.to, next); changed = true }
    }
    if (!changed) break
  }
  const cols = new Map<number, string[]>()
  for (const n of nodes) { const l = level.get(n.id)!; cols.set(l, [...(cols.get(l) ?? []), n.id]) }
  return { level, cols, es }
}

function wrap(label: string, max = 18): string[] {
  const words = label.split(/\s+/), lines: string[] = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w } else cur = (cur + ' ' + w).trim()
  }
  if (cur) lines.push(cur)
  return lines.length > 2 ? [lines[0], lines.slice(1).join(' ').slice(0, max - 1) + '…'] : lines
}

export function Diagram({ b }: { b: B<'diagram'> }) {
  const NW = 150, NH = 48, GX = 70, GY = 26
  const { cols, es } = useMemo(() => layout(b.nodes, b.edges), [b])
  const pos = new Map<string, { x: number; y: number }>()
  const maxRows = Math.max(...[...cols.values()].map((c) => c.length))
  const H = maxRows * NH + (maxRows - 1) * GY + 20
  ;[...cols.entries()].forEach(([l, list]) => {
    const colH = list.length * NH + (list.length - 1) * GY
    list.forEach((id, i) => pos.set(id, { x: 10 + l * (NW + GX), y: (H - colH) / 2 + i * (NH + GY) }))
  })
  const W = 20 + cols.size * NW + (cols.size - 1) * GX
  const label = new Map(b.nodes.map((n) => [n.id, n.label]))
  const edgeLabel = new Map(b.edges.map((e) => [`${e.from}>${e.to}`, e.label]))
  return (
    <div className="diagram">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: W }} role="img" aria-label="Diagram">
        <defs><marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--muted)" /></marker></defs>
        {es.map((e, i) => {
          const a = pos.get(e.from)!, c = pos.get(e.to)!
          const forward = c.x > a.x
          const x1 = forward ? a.x + NW : a.x + NW / 2, y1 = forward ? a.y + NH / 2 : a.y + NH
          const x2 = forward ? c.x : c.x + NW / 2, y2 = forward ? c.y + NH / 2 : c.y
          const mx = (x1 + x2) / 2
          const d = forward ? `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2 - 2} ${y2}` : `M ${x1} ${y1} C ${x1} ${y1 + 30}, ${x2} ${y2 - 30}, ${x2} ${y2 - 2}`
          const lab = edgeLabel.get(`${e.from}>${e.to}`)
          return (
            <g key={i}>
              <path d={d} fill="none" stroke="var(--muted)" strokeWidth="1.3" markerEnd="url(#dg-arrow)" />
              {lab && <text x={mx} y={(y1 + y2) / 2 - 6} textAnchor="middle" className="elab">{lab}</text>}
            </g>
          )
        })}
        {[...pos.entries()].map(([id, p]) => {
          const lines = wrap(label.get(id) ?? id)
          return (
            <g key={id}>
              <rect x={p.x} y={p.y} width={NW} height={NH} rx="9" fill="var(--surface)" stroke="var(--line)" />
              {lines.map((ln, i) => <text key={i} x={p.x + NW / 2} y={p.y + NH / 2 + (i - (lines.length - 1) / 2) * 15 + 4.5} textAnchor="middle" className="nlab">{ln}</text>)}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
