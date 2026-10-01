import { describe, expect, it } from 'vitest'
import { LearnSession, studyOrder, type PoolEntry } from './scheduler'
import { mulberry32 } from './rng'

const pool = (n: number, mastery: PoolEntry['mastery'] = 'new'): PoolEntry[] =>
  Array.from({ length: n }, (_, i) => ({ key: `k${i}`, mastery, retrievability: 1, order: i }))

describe('studyOrder', () => {
  it('walks topics in order and mixes terms with questions inside each topic', () => {
    const items = [
      { key: 't1', kind: 'term', topic: 'a' }, { key: 't2', kind: 'term', topic: 'a' }, { key: 't3', kind: 'term', topic: 'b' },
      { key: 'q1', kind: 'question', topic: 'a' }, { key: 'q2', kind: 'question', topic: 'a' }, { key: 'q3', kind: 'question', topic: 'b' },
    ] as const
    expect(studyOrder([...items], ['a', 'b'])).toEqual(['t1', 'q1', 't2', 'q2', 't3', 'q3'])
  })
})

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

  it('sends a card answered right on the first try away for 12 to 25 cards', () => {
    for (let seed = 0; seed < 30; seed++) {
      const s = new LearnSession(pool(60), { rng: mulberry32(seed) })
      const target = s.next().key
      s.record(target, true)
      let gap = 0
      for (;;) {
        const p = s.next()
        if (p.key === target) break
        s.record(p.key, true)
        gap++
        expect(gap, `seed ${seed}`).toBeLessThan(40)
      }
      expect(gap, `seed ${seed}`).toBeGreaterThanOrEqual(11)
    }
  })

  it('keeps a recovered miss close until it is right twice in a row, then sends it far away', () => {
    const s = new LearnSession(pool(80), { rng: mulberry32(9) })
    const target = s.next().key
    s.record(target, false) // miss
    const gapTo = (correct: boolean) => {
      let gap = 0
      for (;;) {
        const p = s.next()
        if (p.key === target) { s.record(target, correct); return gap }
        s.record(p.key, true)
        gap++
        if (gap > 200) return gap
      }
    }
    expect(gapTo(true)).toBeLessThanOrEqual(5)   // came back after the miss, now right once
    expect(gapTo(true)).toBeLessThanOrEqual(12)  // stays close until right twice in a row
    expect(gapTo(true)).toBeGreaterThanOrEqual(35) // then it leaves for a long while
  })

  it('introduces new cards in random order when shuffled', () => {
    const s = new LearnSession(pool(40), { rng: mulberry32(5), shuffle: true })
    const first = Array.from({ length: 8 }, () => { const p = s.next(); s.record(p.key, true); return p.key })
    expect(first).not.toEqual(['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7'])
    const inOrder = new LearnSession(pool(40), { rng: mulberry32(5), shuffle: false, workingSize: 1 })
    expect(inOrder.next().key).toBe('k0')
  })

  it('keeps bringing in new cards instead of cycling the first few', () => {
    const s = new LearnSession(pool(100), { rng: mulberry32(11), shuffle: true })
    const seen = new Set<string>()
    for (let i = 0; i < 20; i++) { const p = s.next(); seen.add(p.key); s.record(p.key, i % 5 !== 0) }
    expect(seen.size).toBeGreaterThanOrEqual(13)
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
