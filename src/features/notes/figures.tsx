import { useId, useMemo, useRef, useState } from 'react'
import { Markdown } from '../../content/Markdown'
import { compileExpr } from '../../content/expr'
import { sanitizeSvg, svgToReact } from '../../content/svgSafe'
import type { Block, PlotAxis } from '../../notes-format/types'

// Derivations, plots and figures. Each takes plain data, so the notes page renders them from a file today
// and an editor can produce the same data later.

type B<T extends Block['type']> = Extract<Block, { type: T }>
const PALETTE = ['var(--accent)', '#C8742C', '#6B7F95', 'color-mix(in oklab, var(--accent) 55%, var(--ink))', '#A9553A', '#8A6BB0']
const TONE: Record<string, string> = { good: 'var(--good)', bad: 'var(--bad)', accent: 'var(--accent)' }

// ---------- derivation ----------

export function Derivation({ b }: { b: B<'derivation'> }) {
  return (
    <figure className="deriv">
      {b.title && <figcaption className="vis-title">{b.title}</figcaption>}
      <div className="deriv-grid">
        {b.lines.map((l, i) => (
          <div key={i} className="deriv-row">
            <span className="lhs">{l.lhs ? <Markdown inline>{`$$${l.lhs}$$`}</Markdown> : null}</span>
            <span className="rel"><Markdown inline>{`$$${l.rel ?? '='}$$`}</Markdown></span>
            <span className="rhs"><Markdown inline>{`$$${l.rhs}$$`}</Markdown></span>
            {l.why && <span className="why-step">{l.why}</span>}
          </div>
        ))}
      </div>
    </figure>
  )
}

// ---------- plot ----------

/** About `n` round tick values between min and max (1, 2 or 5 times a power of ten apart). */
export function niceTicks(min: number, max: number, n = 6): number[] {
  const raw = (max - min) / n
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.round(v / step) * step)
  return out
}
const fmt = (v: number, unit?: string) => {
  const s = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : (+v.toFixed(2)).toLocaleString()
  return unit === '$' ? `$${s}` : unit ? `${s} ${unit}` : s
}

export function Plot({ b }: { b: B<'plot'> }) {
  const W = 600, H = 340
  // Room on the left for the longest y tick label, plus the axis title when there is one.
  const yt = niceTicks(b.y.min, b.y.max, 5)
  const widest = Math.max(...yt.map((v) => fmt(v, b.y.unit).length))
  const pad = { l: Math.round(widest * 7 + 16 + (b.y.label ? 22 : 0)), r: 18, t: 14, b: 48 }
  const clip = useId().replace(/:/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const sx = (x: number) => pad.l + ((x - b.x.min) / (b.x.max - b.x.min)) * (W - pad.l - pad.r)
  const sy = (y: number) => pad.t + (1 - (y - b.y.min) / (b.y.max - b.y.min)) * (H - pad.t - pad.b)
  const fns = useMemo(() => b.lines.map((l) => { try { return l.fn ? compileExpr(l.fn) : null } catch { return null } }), [b.lines])
  /** y of line i at x: the formula, or straight-line interpolation between its points. */
  const yAt = (i: number, x: number): number | null => {
    const f = fns[i]
    if (f) { const y = f(x); return Number.isFinite(y) ? y : null }
    const pts = b.lines[i].points ?? []
    for (let k = 1; k < pts.length; k++) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k]
      if ((x >= x0 && x <= x1) || (x >= x1 && x <= x0)) return x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
    }
    return null
  }
  const N = 240
  const xs = Array.from({ length: N + 1 }, (_, k) => b.x.min + ((b.x.max - b.x.min) * k) / N)
  const pathFor = (i: number) => {
    const pts = fns[i] ? xs.map((x) => [x, yAt(i, x)] as const) : (b.lines[i].points ?? []).map(([x, y]) => [x, y] as const)
    let d = '', pen = false
    const span = b.y.max - b.y.min
    for (const [x, y] of pts) {
      if (y === null || y < b.y.min - span * 2 || y > b.y.max + span * 2) { pen = false; continue }
      d += `${pen ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`
      pen = true
    }
    return d
  }
  const areaPath = (a: NonNullable<B<'plot'>['areas']>[number]) => {
    const from = Math.max(b.x.min, a.from ?? b.x.min), to = Math.min(b.x.max, a.to ?? b.x.max)
    const sample = xs.filter((x) => x >= from && x <= to)
    const top = sample.map((x) => [x, yAt(a.between[0], x)] as const).filter((p): p is readonly [number, number] => p[1] !== null)
    const bottom = sample.map((x) => [x, a.between.length > 1 ? yAt(a.between[1], x) : 0] as const).filter((p): p is readonly [number, number] => p[1] !== null).reverse()
    if (top.length < 2 || bottom.length < 2) return ''
    return `M${[...top, ...bottom].map(([x, y]) => `${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`).join('L')}Z`
  }
  const xt = niceTicks(b.x.min, b.x.max)
  const onMove = (e: React.PointerEvent) => {
    const svg = svgRef.current
    if (!svg) return
    const r = svg.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    if (px < pad.l || px > W - pad.r) { setHoverX(null); return }
    setHoverX(b.x.min + ((px - pad.l) / (W - pad.l - pad.r)) * (b.x.max - b.x.min))
  }
  const hover = hoverX === null ? null : b.lines.map((l, i) => ({ label: l.label ?? `Line ${i + 1}`, y: yAt(i, hoverX), color: PALETTE[i % PALETTE.length] })).filter((h) => h.y !== null && h.y >= b.y.min && h.y <= b.y.max)
  const tipLeft = hoverX === null ? 0 : (sx(hoverX) / W) * 100

  return (
    <figure className="plot">
      {b.title && <figcaption className="vis-title">{b.title}</figcaption>}
      <div className="plot-box">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={b.title ?? b.caption ?? 'Graph'} onPointerMove={onMove} onPointerLeave={() => setHoverX(null)}>
          <defs><clipPath id={clip}><rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={H - pad.t - pad.b} /></clipPath></defs>
          {yt.map((v) => <g key={`y${v}`}><line x1={pad.l} x2={W - pad.r} y1={sy(v)} y2={sy(v)} className={v === 0 ? 'zero' : 'grid'} /><text x={pad.l - 8} y={sy(v) + 4} textAnchor="end" className="axis">{fmt(v, b.y.unit)}</text></g>)}
          {xt.map((v) => <g key={`x${v}`}><line x1={sx(v)} x2={sx(v)} y1={pad.t} y2={H - pad.b} className={v === 0 ? 'zero' : 'grid'} /><text x={sx(v)} y={H - pad.b + 18} textAnchor="middle" className="axis">{fmt(v, b.x.unit)}</text></g>)}
          <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className="frame" />
          <line x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} className="frame" />
          {b.x.label && <text x={(pad.l + W - pad.r) / 2} y={H - 8} textAnchor="middle" className="axis-label">{b.x.label}</text>}
          {b.y.label && <text x={14} y={(pad.t + H - pad.b) / 2} textAnchor="middle" className="axis-label" transform={`rotate(-90 14 ${(pad.t + H - pad.b) / 2})`}>{b.y.label}</text>}
          <g clipPath={`url(#${clip})`}>
            {(b.areas ?? []).map((a, i) => <path key={`a${i}`} d={areaPath(a)} fill={TONE[a.tone ?? ''] ?? PALETTE[a.between[0] % PALETTE.length]} fillOpacity={0.14} />)}
            {b.lines.map((l, i) => <path key={`l${i}`} d={pathFor(i)} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={l.dashed ? '7 6' : undefined} />)}
          </g>
          {(b.areas ?? []).filter((a) => a.label).map((a, i) => {
            const mid = ((a.from ?? b.x.min) + (a.to ?? b.x.max)) / 2, top = yAt(a.between[0], mid), bot = a.between.length > 1 ? yAt(a.between[1], mid) : 0
            return top !== null && bot !== null ? <text key={`al${i}`} x={sx(mid)} y={sy((top + bot) / 2) + 4} textAnchor="middle" className="area-label">{a.label}</text> : null
          })}
          {(b.points ?? []).map((p, i) => (
            <g key={`p${i}`}>
              <circle cx={sx(p.x)} cy={sy(p.y)} r={5.5} className="pt" />
              {p.label && <text x={sx(p.x) + 10} y={sy(p.y) - 10} className="pt-label">{p.label}</text>}
            </g>
          ))}
          {hover && hoverX !== null && <line x1={sx(hoverX)} x2={sx(hoverX)} y1={pad.t} y2={H - pad.b} className="guide" />}
          {hover?.map((h, i) => <circle key={`h${i}`} cx={sx(hoverX!)} cy={sy(h.y!)} r={4.5} fill="var(--surface)" stroke={h.color} strokeWidth={2.2} />)}
        </svg>
        {hover && hover.length > 0 && (
          <div className="plot-tip" style={{ left: `${tipLeft}%` }}>
            <b>{b.x.label ?? 'x'}: {fmt(hoverX!, b.x.unit)}</b>
            {hover.map((h) => <span key={h.label}><i style={{ background: h.color }} />{h.label}: {fmt(h.y!, b.y.unit)}</span>)}
          </div>
        )}
      </div>
      {b.lines.some((l) => l.label) && (
        <ul className="legend-list row">
          {b.lines.map((l, i) => l.label && <li key={i}><span className="dot" style={{ background: PALETTE[i % PALETTE.length] }} />{l.label}{l.fn && <code className="fn">{l.fn}</code>}</li>)}
        </ul>
      )}
      {b.caption && <div className="hint">{b.caption}</div>}
    </figure>
  )
}

export type { PlotAxis }

// ---------- figure ----------

export function Figure({ b }: { b: B<'figure'> }) {
  const id = useId().replace(/:/g, '')
  const tree = useMemo(() => sanitizeSvg(b.svg, `fig${id}`), [b.svg, id])
  if (!tree) return <figure className="figure"><div className="hint">This figure couldn't be drawn.</div></figure>
  tree.attrs.role = 'img'
  tree.attrs['aria-label'] = b.alt
  return (
    <figure className="figure">
      <div className="figure-box">{svgToReact(tree)}</div>
      {b.caption && <figcaption>{b.caption}</figcaption>}
    </figure>
  )
}
