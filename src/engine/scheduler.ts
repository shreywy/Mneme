import type { Mastery } from './memory'
import type { Rng } from './rng'

export type PoolEntry = { key: string; mastery: Mastery; retrievability: number; order: number }
export type Pick = { key: string; format: 'recall' | 'typed' }

type Slot = { key: string; availableAt: number; consecutive: number; retry: boolean; missed: boolean; startMastery: Mastery }

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
 * The endless Learn queue.
 * - A small working set holds cards in play.
 * - A miss comes back 3–4 cards later and stays close until it's right twice in a row.
 * - A card right on the first try steps aside and returns 12–25 cards later (typed, if it's a term).
 * - Two right in a row (or one, for a card already known before this session) puts it in `done`.
 * - Done cards only come back once every other card has had its turn, so a big deck keeps moving
 *   forward instead of re-asking what you've just learned. The session never runs out.
 */
export class LearnSession {
  private queue: Slot[]
  private waiting: (Slot & { returnAt: number })[] = []
  private working: Slot[] = []
  private done: Slot[] = []
  private history: string[] = []
  private t = 0
  private readonly size: number
  private readonly rng: Rng
  private readonly total: number

  constructor(entries: PoolEntry[], opts: { workingSize?: number; rng?: Rng; shuffle?: boolean } = {}) {
    this.size = opts.workingSize ?? 6
    this.rng = opts.rng ?? Math.random
    this.total = entries.length
    const rank = (e: PoolEntry) =>
      e.mastery === 'learning' ? 0
        : e.mastery !== 'new' && e.retrievability < 0.85 ? 1
          : e.mastery === 'new' ? 2 : 3
    const jitter = new Map(entries.map((e) => [e.key, this.rng()]))
    const sorted = [...entries].sort((a, b) => rank(a) - rank(b)
      || (rank(a) === 2 ? (opts.shuffle ? jitter.get(a.key)! - jitter.get(b.key)! : a.order - b.order) : a.retrievability - b.retrievability)
      || a.order - b.order)
    this.queue = sorted.map((e) => ({ key: e.key, availableAt: 0, consecutive: 0, retry: false, missed: false, startMastery: e.mastery }))
    this.refill()
  }

  get turn() { return this.t }
  workingKeys() { return this.working.map((w) => w.key) }

  private refill() {
    while (this.working.length < this.size) {
      this.waiting.sort((a, b) => a.returnAt - b.returnAt)
      let s: Slot | undefined
      if (this.waiting.length && this.waiting[0].returnAt <= this.t) s = this.waiting.shift()
      else if (this.queue.length) s = this.queue.shift()
      else if (this.waiting.length) s = this.waiting.shift()
      else if (this.done.length) s = this.done.shift()
      if (!s) break
      const { returnAt: _r, ...slot } = s as Slot & { returnAt?: number }
      this.working.push({ ...slot, availableAt: this.t })
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

  private park(i: number, from: number, spread: number) {
    const [w] = this.working.splice(i, 1)
    this.waiting.push({ ...w, returnAt: this.t + from + Math.floor(this.rng() * spread) })
  }

  private finish(i: number) {
    const [w] = this.working.splice(i, 1)
    this.done.push({ ...w, consecutive: 0, retry: false, missed: false, startMastery: 'familiar' })
  }

  /** "I know this": out of play until everything else has had a turn. */
  drop(key: string) {
    const i = this.working.findIndex((w) => w.key === key)
    if (i !== -1) this.finish(i)
  }

  record(key: string, correct: boolean) {
    const i = this.working.findIndex((w) => w.key === key)
    if (i === -1) return
    const w = this.working[i]
    if (!correct) {
      w.consecutive = 0
      w.retry = true
      w.missed = true
      w.availableAt = this.t + 3 + Math.floor(this.rng() * 2)
      return
    }
    w.consecutive++
    w.retry = false
    const known = !w.missed && (w.startMastery === 'familiar' || w.startMastery === 'mastered')
    if (w.consecutive >= GRADUATE_AFTER || known) this.finish(i)
    else if (!w.missed) this.park(i, 12, 14)
    else w.availableAt = this.t + 5 + Math.floor(this.rng() * 4)
  }
}

/**
 * Fast mode: every card once per pass, in order, no repeats inside a pass. A card right on its first ask
 * is done (and counts as learned). A miss keeps it until it's right twice in a row in later passes.
 * Each pass after the first holds only what's left.
 */
export class FastRun {
  private pass: string[]
  private i = 0
  private need = new Map<string, number>() // right answers in a row still needed
  private asked = new Set<string>()
  passNo = 1

  constructor(keys: string[]) {
    this.pass = [...keys]
    for (const k of keys) this.need.set(k, 1)
  }

  get left() { return this.need.size }

  next(): Pick | null {
    if (!this.need.size) return null
    for (;;) {
      if (this.i >= this.pass.length) {
        this.pass = this.pass.filter((k) => this.need.has(k))
        this.i = 0
        this.passNo++
      }
      const key = this.pass[this.i++]
      if (this.need.has(key)) return { key, format: 'recall' }
    }
  }

  /** True when this answer finishes the card on its first ask. */
  record(key: string, correct: boolean): boolean {
    if (!this.need.has(key)) return false
    const first = !this.asked.has(key)
    this.asked.add(key)
    if (!correct) { this.need.set(key, 2); return false }
    const n = this.need.get(key)! - 1
    if (n > 0) { this.need.set(key, n); return false }
    this.need.delete(key)
    return first
  }

  drop(key: string) { this.need.delete(key) }
}
