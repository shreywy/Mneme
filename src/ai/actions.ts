import type { Item } from '../deck-format/types'
import { toDeckFile } from '../deck-format/export'
import { parseDeckText } from '../deck-format/parse'
import type { Exercise } from '../engine/exercises'
import type { Response } from '../engine/respond'
import { askJson } from './gemini'
import { cardText, responseText, type DeckInfo } from './study'

// One-shot study actions. The chatty ones (why was I wrong, a mnemonic, the session summary) are first
// questions for the AI panel; grading and new cards come back as data.

export const ASK_WHY_WRONG = 'Why is my answer wrong? Explain the mistake in my thinking, then how to get it right next time.'
export const ASK_MNEMONIC = 'I keep forgetting this card. Give me one short, memorable mnemonic for it (a phrase, acronym, image or story), and one line on how it maps to the answer.'
export const ASK_SUMMARY = 'Summarise this study session for me: what I seem to know, what I keep missing and the idea behind those misses, and what to review next. Keep it short.'

export const LEECH = 3

/** Was a typed answer right after all? Gemini judges meaning, not spelling. */
export async function gradeTyped(key: string, deck: DeckInfo, ex: Exercise, r: Response | undefined): Promise<{ right: boolean; why: string }> {
  const g = await askJson<{ right?: unknown; why?: unknown }>(key, {
    system: 'You grade a student’s typed answer to a flashcard. Count it right if it means the same as the expected answer: synonyms, equivalent forms or values, small spelling slips. Count it wrong if it’s incomplete or a different idea. Reply as JSON: {"right": true or false, "why": "one short sentence to the student"}.',
    contents: [{ role: 'user', parts: [{ text: `Deck: ${deck.title}\n\n${cardText(ex.item)}\n\nStudent’s answer: ${responseText(ex, r)}` }] }],
  })
  return { right: g.right === true, why: typeof g.why === 'string' ? g.why : '' }
}

export const GENERATED = { id: 'generated', name: 'Generated' }

/** 2–3 new cards on the same idea, in the deck format, checked by the same parser as an imported file. */
export async function moreLikeThis(key: string, deck: DeckInfo, item: Item): Promise<Item[]> {
  const file = toDeckFile({ title: deck.title, course: deck.course, sources: [], topics: [GENERATED] }, [{ ...item, topic: GENERATED.id }])
  const items = await askJson(key, {
    system: 'You write flashcards for Mneme. Given one card as a mneme.deck JSON file, write 2 or 3 new cards that test the same idea from different angles (a different example, the reverse direction, a common confusion). Same kind of card as the original. Don’t repeat the original. Reply with the whole mneme.deck JSON file holding only the new cards, topic "generated", each with a new id. Write maths as $$…$$.',
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(file) }] }],
  }, (text) => {
    const parsed = parseDeckText(text)
    if (!parsed.ok || !parsed.deck.items.length) throw new Error('unreadable')
    return parsed.deck.items
  })
  const stamp = Date.now().toString(36)
  return items.slice(0, 3).map((it, i) => {
    const k = `gen-${stamp}-${i}`
    const parts = it.kind === 'question' && it.qtype === 'scenario' ? { parts: it.parts.map((p) => ({ ...p, key: `${k}--${p.key.split('--').pop()}` })) } : {}
    return { ...it, ...parts, key: k, topic: GENERATED.id, source: undefined, demo: undefined } as Item
  })
}

/** The pinned context for the end-of-session summary. */
export function sessionContext(deck: DeckInfo, s: { answered: number; correct: number; best: number; seconds: number }, missed: Item[]): string {
  const head = `Deck: ${deck.title}${deck.course ? ` (${deck.course})` : ''}\nThis session: ${s.answered} answered, ${s.correct} right, best streak ${s.best}, ${Math.round(s.seconds / 60)} min.`
  return missed.length ? `${head}\n\nCards missed this session:\n\n${missed.slice(0, 20).map(cardText).join('\n\n---\n\n')}` : `${head}\n\nNo cards missed.`
}
