import type { Item } from '../deck-format/types'
import { masteryOf, type CardState, type Mastery } from '../engine/memory'
import { db } from './db'

export type MasteryCounts = Record<Mastery, number>

export function countMastery(items: { key: string }[], states: Map<string, CardState>): MasteryCounts {
  const c: MasteryCounts = { new: 0, learning: 0, familiar: 0, mastered: 0 }
  for (const it of items) c[masteryOf(states.get(it.key))]++
  return c
}

/** Mastery counts for every deck, for library cards. */
export async function allDeckMastery(): Promise<Map<string, MasteryCounts>> {
  const [items, cards] = await Promise.all([db.items.toArray(), db.cards.toArray()])
  const states = new Map(cards.map((c) => [`${c.deckId}\u0000${c.key}`, c]))
  const out = new Map<string, MasteryCounts>()
  for (const it of items) {
    const c = out.get(it.deckId) ?? { new: 0, learning: 0, familiar: 0, mastered: 0 }
    c[masteryOf(states.get(`${it.deckId}\u0000${it.key}`))]++
    out.set(it.deckId, c)
  }
  return out
}

export type Filter = 'all' | 'questions' | 'terms'
export function filterItems(items: Item[], f: Filter, topic?: string | null): Item[] {
  return items.filter((i) => (f === 'all' || (f === 'terms' ? i.kind === 'term' : i.kind === 'question')) && (!topic || i.topic === topic))
}

export function relTime(ms: number | undefined): string {
  if (!ms) return 'never'
  const s = (Date.now() - ms) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  const d = Math.floor(s / 86400)
  return d === 1 ? 'yesterday' : `${d} days ago`
}
