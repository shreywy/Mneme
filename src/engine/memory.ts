import { createEmptyCard, fsrs, Rating, type Card, type Grade } from 'ts-fsrs'

export type Mastery = 'new' | 'learning' | 'familiar' | 'mastered'

/** Per-user, per-item memory state. `card` is the FSRS card. */
export type CardState = {
  deckId: string
  key: string
  card: Card
  seen: number
  correct: number
  streak: number        // consecutive correct answers
  lapses: number        // wrong answers after having been right at least once
  lastCorrect: boolean
  lastAnswerAt: number  // epoch ms
  correctDays: string[] // distinct YYYY-MM-DD with a correct answer since the last miss
}

const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: true, enable_short_term: true })

export function rateAnswer(a: { correct: boolean; ms: number; medianMs: number; mastery: Mastery; hinted?: boolean }): Grade {
  if (!a.correct) return Rating.Again
  // Right with a hint is right, but not yet known well enough to wait long before the next showing.
  if (a.hinted) return Rating.Hard
  if (a.medianMs > 0 && a.ms > a.medianMs * 2) return Rating.Hard
  if (a.medianMs > 0 && a.ms < a.medianMs * 0.5 && (a.mastery === 'familiar' || a.mastery === 'mastered')) return Rating.Easy
  return Rating.Good
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10)

export function applyAnswer(
  prev: CardState | undefined,
  a: { deckId: string; key: string; correct: boolean; rating: Grade; now: Date },
): CardState {
  const card = prev ? { ...prev.card, due: new Date(prev.card.due), last_review: prev.card.last_review ? new Date(prev.card.last_review) : undefined } : createEmptyCard(a.now)
  const next = scheduler.next(card, a.now, a.rating).card
  const wasRightBefore = (prev?.correct ?? 0) > 0
  const days = a.correct ? [...new Set([...(prev?.correctDays ?? []), dayKey(a.now)])].slice(-10) : []
  return {
    deckId: a.deckId,
    key: a.key,
    card: next,
    seen: (prev?.seen ?? 0) + 1,
    correct: (prev?.correct ?? 0) + (a.correct ? 1 : 0),
    streak: a.correct ? (prev?.streak ?? 0) + 1 : 0,
    lapses: (prev?.lapses ?? 0) + (!a.correct && wasRightBefore ? 1 : 0),
    lastCorrect: a.correct,
    lastAnswerAt: +a.now,
    correctDays: days,
  }
}

export function masteryOf(s: CardState | undefined): Mastery {
  if (!s || s.seen === 0) return 'new'
  if (!s.lastCorrect || s.streak < 2) return 'learning'
  if (s.card.stability >= 21 || (s.streak >= 3 && s.correctDays.length >= 2)) return 'mastered'
  return 'familiar'
}

export function retrievability(s: CardState | undefined, now = new Date()): number {
  if (!s || s.seen === 0) return 0
  const card = { ...s.card, due: new Date(s.card.due), last_review: s.card.last_review ? new Date(s.card.last_review) : undefined }
  const r = scheduler.get_retrievability(card, now, false)
  return typeof r === 'number' && isFinite(r) ? Math.min(1, Math.max(0, r)) : 0
}
