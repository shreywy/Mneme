import { useMemo, useState } from 'react'

// FSRS's forgetting curve: R(t) = (1 + F·t/S)^-0.5, with F = 19/81 so that R(S) = 90%.
const DECAY = -0.5
const FACTOR = 19 / 81
export const recall = (t: number, s: number) => (1 + (FACTOR * t) / s) ** DECAY
/** Days until recall falls to `target` for a card with stability `s`. */
export const interval = (s: number, target: number) => (s / FACTOR) * (target ** (1 / DECAY) - 1)

const W = 640, H = 260, PAD = { l: 40, r: 108, t: 14, b: 30 }
const DAYS = 90
const FIRST = 1.2 // stability of a card just learned

/**
 * One card reviewed on time, again and again, next to the same card never reviewed. Each successful review
 * makes the curve flatter (stability grows), so the gaps between reviews get longer.
 */
export function ForgettingCurve() {
  const [target, setTarget] = useState(0.9)
  const reviews = useMemo(() => {
    const out: { at: number; s: number }[] = []
    let at = 0, s = FIRST
    while (at < DAYS && out.length < 12) {
      out.push({ at, s })
      at += Math.max(1, interval(s, target))
      s *= 2.4 + (1 - target) * 4 // remembering after a longer gap strengthens it more
    }
    return out
  }, [target])
  const x = (d: number) => PAD.l + (d / DAYS) * (W - PAD.l - PAD.r)
  const y = (r: number) => PAD.t + (1 - r) * (H - PAD.t - PAD.b)
  const at = (d: number) => { // recall on day d with reviews
    let rv = reviews[0]
    for (const r of reviews) if (r.at <= d) rv = r
    return recall(d - rv.at, rv.s)
  }
  const pts: string[] = []
  for (let i = 0; i < reviews.length && reviews[i].at <= DAYS; i++) {
    const end = Math.min(DAYS, reviews[i + 1]?.at ?? DAYS)
    for (let d = reviews[i].at; d < end; d += 0.5) pts.push(`${x(d).toFixed(1)},${y(recall(d - reviews[i].at, reviews[i].s)).toFixed(1)}`)
    pts.push(`${x(end).toFixed(1)},${y(recall(end - reviews[i].at, reviews[i].s)).toFixed(1)}`)
  }
  const curve = `M${pts.join('L')}`
  const forget: string[] = []
  for (let d = 0; d <= DAYS; d += 1) forget.push(`${x(d).toFixed(1)},${y(recall(d, FIRST)).toFixed(1)}`)
  const gaps = reviews.slice(1).filter((r) => r.at <= DAYS).map((r, i) => Math.round(r.at - reviews[i].at))
  const endR = at(DAYS), endF = recall(DAYS, FIRST)
  const pct = (r: number) => `${Math.round(r * 100)}%`
  return (
    <figure className="fcurve">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Chance of remembering one card over ${DAYS} days. Reviewed whenever it drops to ${pct(target)}, it ends at ${pct(endR)} after ${gaps.length + 1} reviews. Never reviewed, it ends at ${pct(endF)}.`}>
        {[1, 0.75, 0.5, 0.25, 0].map((r) => (
          <g key={r}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(r)} y2={y(r)} className="grid" />
            <text x={PAD.l - 6} y={y(r) + 4} textAnchor="end">{pct(r)}</text>
          </g>
        ))}
        {[0, 15, 30, 45, 60, 75, 90].map((d) => <text key={d} x={x(d)} y={H - 8} textAnchor="middle">{d === 0 ? 'day 0' : d}</text>)}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(target)} y2={y(target)} className="tline" />
        <path d={`M${forget.join('L')}`} className="forget" />
        <path d={curve} className="curve" />
        {reviews.filter((r) => r.at <= DAYS).map((r) => <circle key={r.at} cx={x(r.at)} cy={y(1)} r={3.5} className="dot" />)}
        <text x={W - PAD.r + 10} y={y(endR) + 4} className="lbl">Reviewed {pct(endR)}</text>
        <text x={W - PAD.r + 10} y={y(endF) + 4} className="lbl m">Never {pct(endF)}</text>
      </svg>
      <figcaption>
        <label>
          <span>Review when the chance of remembering drops to <b>{pct(target)}</b></span>
          <input type="range" min={0.7} max={0.97} step={0.01} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
        </label>
        <span className="muted">{gaps.length + 1} reviews in {DAYS} days, {gaps.join(' → ')} days apart. A higher target means more reviews.</span>
      </figcaption>
    </figure>
  )
}
