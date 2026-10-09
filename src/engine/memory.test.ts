import { describe, expect, it } from 'vitest'
import { Rating } from 'ts-fsrs'
import { applyAnswer, masteryOf, rateAnswer, retrievability } from './memory'

const day = 86_400_000

describe('rateAnswer', () => {
  it('maps wrong to Again', () => expect(rateAnswer({ correct: false, ms: 1000, medianMs: 3000, mastery: 'new' })).toBe(Rating.Again))
  it('caps a right answer after a hint at Hard', () => expect(rateAnswer({ correct: true, ms: 500, medianMs: 3000, mastery: 'mastered', hinted: true })).toBe(Rating.Hard))
  it('maps a slow correct answer to Hard', () => expect(rateAnswer({ correct: true, ms: 9000, medianMs: 3000, mastery: 'learning' })).toBe(Rating.Hard))
  it('maps a fast correct answer on a familiar card to Easy', () => expect(rateAnswer({ correct: true, ms: 1000, medianMs: 3000, mastery: 'familiar' })).toBe(Rating.Easy))
  it('keeps a fast correct answer on a new card at Good', () => expect(rateAnswer({ correct: true, ms: 1000, medianMs: 3000, mastery: 'new' })).toBe(Rating.Good))
  it('uses Good when there is no timing history', () => expect(rateAnswer({ correct: true, ms: 1000, medianMs: 0, mastery: 'familiar' })).toBe(Rating.Good))
})

describe('applyAnswer and masteryOf', () => {
  const t0 = new Date('2026-10-01T10:00:00Z')
  it('starts new, moves to learning after one right answer, familiar after two', () => {
    expect(masteryOf(undefined)).toBe('new')
    const a = applyAnswer(undefined, { deckId: 'd', key: 'k', correct: true, rating: Rating.Good, now: t0 })
    expect(a.seen).toBe(1)
    expect(masteryOf(a)).toBe('learning')
    const b = applyAnswer(a, { deckId: 'd', key: 'k', correct: true, rating: Rating.Good, now: new Date(+t0 + 60_000) })
    expect(masteryOf(b)).toBe('familiar')
  })
  it('drops back to learning after a wrong answer and counts the lapse', () => {
    let s = applyAnswer(undefined, { deckId: 'd', key: 'k', correct: true, rating: Rating.Good, now: t0 })
    s = applyAnswer(s, { deckId: 'd', key: 'k', correct: true, rating: Rating.Good, now: new Date(+t0 + 60_000) })
    s = applyAnswer(s, { deckId: 'd', key: 'k', correct: false, rating: Rating.Again, now: new Date(+t0 + 120_000) })
    expect(masteryOf(s)).toBe('learning')
    expect(s.lapses).toBe(1)
    expect(s.streak).toBe(0)
  })
  it('calls a card mastered after 3+ right answers across 2 different days', () => {
    let s = applyAnswer(undefined, { deckId: 'd', key: 'k', correct: true, rating: Rating.Good, now: t0 })
    s = applyAnswer(s, { deckId: 'd', key: 'k', correct: true, rating: Rating.Good, now: new Date(+t0 + 60_000) })
    s = applyAnswer(s, { deckId: 'd', key: 'k', correct: true, rating: Rating.Good, now: new Date(+t0 + 2 * day) })
    expect(masteryOf(s)).toBe('mastered')
  })
  it('schedules the next review in the future and reports retrievability in 0..1', () => {
    const s = applyAnswer(undefined, { deckId: 'd', key: 'k', correct: true, rating: Rating.Good, now: t0 })
    expect(+new Date(s.card.due)).toBeGreaterThan(+t0)
    const r = retrievability(s, new Date(+t0 + 3 * day))
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThanOrEqual(1)
  })
})
