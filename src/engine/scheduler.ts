import type { Mastery } from './memory'
import type { Rng } from './rng'

export type PoolEntry = { key: string; mastery: Mastery; retrievability: number; order: number }
export type Pick = { key: string; format: 'recall' | 'typed' }

type Slot = { key: string; availableAt: number; consecutive: number; retry: boolean; startMastery: Mastery }

const GRADUATE_AFTER = 2

/**
 * Order for introducing new items: topic by topic (in the deck's topic order), and inside a topic
 * terms and questions are interleaved in proportion, so "All" doesn't show 70 terms before any question.
 */
export function studyOrder(items: { key: string; kind: string; topic: string }[], topicOrder: string[]): string[] {
  const rank = new Map(topicOrder.map((t, i) => [t, i]))
  const topics = [...new Set(items.map((i) => i.topic))].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9))
  const out: string[] = []
  for (const t of topics) {
    const terms = items.filter((i) => i.topic === t && i.kind === 'term')
    const qs = items.filter((i) => i.topic === t && i.kind !== 'term')
    let a = 0, b = 0
    while (a < terms.length || b < qs.length) {
      // Pick whichever list is further behind its share.
      const takeTerm = b >= qs.length || (a < terms.length && a / terms.length <= b / qs.length)
      out.push(takeTerm ? terms[a++].key : qs[b++].key)
    }
  }
  return out
}

/**
 * The endless Learn queue. Keeps a small working set, brings misses back 3–4 cards later,
 * pushes correct answers further out, and graduates an item after 2 right answers in a row.
 * Graduated items go to the back of the pool, so the session never runs out.
 */
export class LearnSession {
  private queue: Slot[]
  private working: Slot[] = []
  private history: string[] = []
  private t = 0
  private readonly size: number
  private readonly rng: Rng
  private readonly total: number

  constructor(entries: PoolEntry[], opts: { workingSize?: number; rng?: Rng } = {}) {
    this.size = opts.workingSize ?? 7
    this.rng = opts.rng ?? Math.random
    this.total = entries.length
    const rank = (e: PoolEntry) =>
      e.mastery === 'learning' ? 0
        : e.mastery !== 'new' && e.retrievability < 0.85 ? 1
          : e.mastery === 'new' ? 2 : 3
    const sorted = [...entries].sort((a, b) =>
      rank(a) - rank(b) || (rank(a) === 2 ? a.order - b.order : a.retrievability - b.retrievability) || a.order - b.order)
    this.queue = sorted.map((e) => ({ key: e.key, availableAt: 0, consecutive: 0, retry: false, startMastery: e.mastery }))
    this.refill()
  }

  get turn() { return this.t }
  workingKeys() { return this.working.map((w) => w.key) }

  private refill() {
    while (this.working.length < this.size && this.queue.length) {
      const s = this.queue.shift()!
      this.working.push({ ...s, availableAt: this.t, consecutive: 0, retry: false })
    }
  }

  next(): Pick {
    this.refill()
    if (this.working.length === 0) throw new Error('empty pool')
    const blocked = this.total >= 3 ? this.history.slice(-2) : this.total === 2 ? this.history.slice(-1) : []
    let candidates = this.working.filter((w) => !blocked.includes(w.key))
    if (candidates.length === 0) candidates = this.working.filter((w) => w.key !== this.history.at(-1))
    if (candidates.length === 0) candidates = this.working
    const due = candidates.filter((w) => w.availableAt <= this.t)
    const pool = due.length ? (due.some((w) => w.retry) ? due.filter((w) => w.retry) : due) : candidates
    const min = Math.min(...pool.map((w) => w.availableAt))
    const ties = pool.filter((w) => w.availableAt === min)
    const pick = ties[Math.floor(this.rng() * ties.length)]
    this.history.push(pick.key)
    if (this.history.length > 8) this.history.shift()
    this.t++
    const format = pick.consecutive >= 1 || pick.startMastery === 'familiar' || pick.startMastery === 'mastered' ? 'typed' : 'recall'
    return { key: pick.key, format: pick.retry ? 'recall' : format }
  }

  record(key: string, correct: boolean) {
    const i = this.working.findIndex((w) => w.key === key)
    if (i === -1) return
    const w = this.working[i]
    if (correct) {
      w.consecutive++
      w.retry = false
      if (w.consecutive >= GRADUATE_AFTER) {
        this.working.splice(i, 1)
        this.queue.push({ ...w, startMastery: 'familiar' })
      } else {
        w.availableAt = this.t + 6 + Math.floor(this.rng() * 5)
      }
    } else {
      w.consecutive = 0
      w.retry = true
      w.availableAt = this.t + 3 + Math.floor(this.rng() * 2)
    }
  }
}
