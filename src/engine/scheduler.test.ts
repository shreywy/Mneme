import { describe, expect, it } from 'vitest'
import { LearnSession, type PoolEntry } from './scheduler'
import { mulberry32 } from './rng'

const pool = (n: number, mastery: PoolEntry['mastery'] = 'new'): PoolEntry[] =>
  Array.from({ length: n }, (_, i) => ({ key: `k${i}`, mastery, retrievability: 1, order: i }))

describe('LearnSession', () => {
  it('never shows the same item twice in a row, and keeps a gap of 2 when it can', () => {
    for (let run = 0; run < 400; run++) {
      const rng = mulberry32(run)
      const n = 1 + Math.floor(rng() * 40)
      const s = new LearnSession(pool(n), { rng })
      const shown: string[] = []
      for (let t = 0; t < 150; t++) {
        const p = s.next()
        expect(p, `run ${run} turn ${t}`).toBeTruthy()
        shown.push(p.key)
        s.record(p.key, rng() < 0.6)
      }
      for (let i = 1; i < shown.length; i++) {
        if (n >= 2) expect(shown[i], `run ${run} n=${n} i=${i}`).not.toBe(shown[i - 1])
        if (n >= 3 && i >= 2) expect(shown[i], `run ${run} n=${n} i=${i}`).not.toBe(shown[i - 2])
      }
    }
  })

  it('works with a single item', () => {
    const s = new LearnSession(pool(1), { rng: mulberry32(1) })
    for (let i = 0; i < 5; i++) { const p = s.next(); expect(p.key).toBe('k0'); s.record(p.key, i % 2 === 0) }
  })

  it('brings a missed item back after 3 or 4 other cards', () => {
    const s = new LearnSession(pool(12), { rng: mulberry32(7) })
    const first = s.next()
    s.record(first.key, false)
    let gap = 0
    for (;;) {
      const p = s.next()
      if (p.key === first.key) break
      s.record(p.key, true)
      gap++
      expect(gap).toBeLessThan(10)
    }
    expect(gap === 3 || gap === 4).toBe(true)
  })

  it('graduates an item out of the working set after 2 correct answers in a row', () => {
    const s = new LearnSession(pool(20), { rng: mulberry32(3) })
    const target = s.next().key
    s.record(target, true)
    expect(s.workingKeys()).toContain(target)
    for (let i = 0; i < 30; i++) {
      const p = s.next()
      s.record(p.key, true)
      if (p.key === target) break
    }
    expect(s.workingKeys()).not.toContain(target)
  })

  it('pulls learning items before new ones', () => {
    const entries: PoolEntry[] = [...pool(10, 'new'), { key: 'L', mastery: 'learning', retrievability: 0.5, order: 99 }]
    const s = new LearnSession(entries, { rng: mulberry32(2), workingSize: 3 })
    expect(s.workingKeys()[0]).toBe('L')
  })

  it('asks for typed recall once an item has been answered right in this session', () => {
    const s = new LearnSession(pool(3), { rng: mulberry32(4) })
    const a = s.next()
    expect(a.format).toBe('recall')
    s.record(a.key, true)
    let again = s.next()
    while (again.key !== a.key) { s.record(again.key, false); again = s.next() }
    expect(again.format).toBe('typed')
  })
})
