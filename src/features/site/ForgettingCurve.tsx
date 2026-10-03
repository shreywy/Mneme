import { useMemo, useState } from 'react'

// FSRS's forgetting curve: R(t) = (1 + F·t/S)^-0.5, with F = 19/81 so that R(S) = 90%.
const DECAY = -0.5
const FACTOR = 19 / 81
export const recall = (t: number, s: number) => (1 + (FACTOR * t) / s) ** DECAY
/** Days until recall falls to `target` for a card with stability `s`. */
export const interval = (s: number, target: number) => (s / FACTOR) * (target ** (1 / DECAY) - 1)

const W = 640, H = 220, PAD = { l: 40, r: 12, t: 14, b: 30 }
const DAYS = 90

/**
 * One card reviewed on time, again and again. Each successful review makes the curve flatter (stability
 * grows), so the gaps between reviews get longer. Drag the target to see how much that costs.
 */
export function ForgettingCurve() {
  const [target, setTarget] = useState(0.9)
  const reviews = useMemo(() => {
    const out: { at: number; s: number }[] = []
    let at = 0, s = 1.2
    while (at < DAYS && out.length < 12) {
      out.push({ at, s })
      at += Math.max(1, interval(s, target))
      s *= 2.4 + (1 - target) * 4 // remembering after a longer gap strengthens it more
    }
    return out
  }, [target])
  const x = (d: number) => PAD.l + (d / DAYS) * (W - PAD.l - PAD.r)
  const y = (r: number) => PAD.t + (1 - r) * (H - PAD.t - PAD.b) / 0.4 // 60% at the bottom
  const path = reviews.map((rv, i) => {
    const end = Math.min(DAYS, reviews[i + 1]?.at ?? DAYS)
    const pts: string[] = []
    for (let d = rv.at; d <= end + 0.001; d += 0.5) pts.push(`${x(d).toFixed(1)},${y(Math.max(0.6, recall(d - rv.at, rv.s))).toFixed(1)}`)
    return `M${pts.join('L')}${i < reviews.length - 1 && reviews[i + 1].at <= DAYS ? `L${x(reviews[i + 1].at).toFixed(1)},${y(1).toFixed(1)}` : ''}`
  }).join('')
  const gaps = reviews.slice(1).filter((r) => r.at <= DAYS).map((r, i) => Math.round(r.at - reviews[i].at))
  return (
    <figure className="fcurve">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Chance of remembering one card over ${DAYS} days, reviewed when it drops to ${Math.round(target * 100)}%. Gaps between reviews: ${gaps.join(', ')} days.`}>
        {[1, 0.9, 0.8, 0.7, 0.6].map((r) => (
          <g key={r}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(r)} y2={y(r)} className={r === target ? 'tline' : 'grid'} />
            <text x={PAD.l - 6} y={y(r) + 4} textAnchor="end">{Math.round(r * 100)}%</text>
          </g>
        ))}
        {[0, 15, 30, 45, 60, 75, 90].map((d) => <text key={d} x={x(d)} y={H - 8} textAnchor="middle">{d === 0 ? 'day 0' : d}</text>)}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(target)} y2={y(target)} className="tline" />
        <path d={path} className="curve" />
        {reviews.filter((r) => r.at <= DAYS).map((r) => <circle key={r.at} cx={x(r.at)} cy={y(1)} r={4} className="dot" />)}
      </svg>
      <figcaption>
        <label>
          <span>Review when the chance of remembering drops to <b>{Math.round(target * 100)}%</b></span>
          <input type="range" min={0.8} max={0.97} step={0.01} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
        </label>
        <span className="muted">Gaps between reviews: {gaps.join(' → ')} days. A higher target means more reviews.</span>
      </figcaption>
    </figure>
  )
}
