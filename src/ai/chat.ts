import { db, type Chat } from '../data/db'
import { ask, type Part, type Turn } from './gemini'

// A chat with pinned context. Once the prompt passes 60% of the budget, everything but the last few
// turns is folded into a running summary that stays pinned too.

export const BUDGET = 32_000
export const KEEP = 4
const MAX_CHATS = 200

export type Img = { mimeType: string; data: string }
export type Pinned = { context: string; images?: Img[] }

export const TUTOR = `You are a patient tutor inside Mneme, a study app. Answer the student's question about the material below.
Be short and specific: a few sentences or a short list, longer only when asked. Use Markdown. Write all maths in LaTeX between double dollar signs, $$like this$$, even inside a sentence. Write money with a backslash, like \\$5.
If the material doesn't settle something, say so rather than guessing.`

export const systemFor = (pinned: Pinned, chat: Pick<Chat, 'summary'>, base = TUTOR) =>
  `${base}\n\n--- What the student is looking at ---\n${pinned.context}` + (chat.summary ? `\n\n--- Earlier in this chat (summary) ---\n${chat.summary}` : '')

/** The turns to send: the chat so far plus the new question, with any pictures on the first question. */
export function contentsFor(chat: Pick<Chat, 'turns'>, pinned: Pinned, question: string): Turn[] {
  const turns: Turn[] = [...chat.turns, { role: 'user' as const, text: question }].map((t) => ({ role: t.role, parts: [{ text: t.text }] as Part[] }))
  const first = turns.find((t) => t.role === 'user')!
  for (const img of pinned.images ?? []) first.parts.push({ inlineData: img })
  return turns
}

export const needsSummary = (c: Pick<Chat, 'tokens' | 'turns'>) => c.tokens > BUDGET * 0.6 && c.turns.length > KEEP

export const emptyChat = (id: string, title: string): Chat => ({ id, title, summary: '', turns: [], tokens: 0, updatedAt: Date.now() })

/** Folds all but the last KEEP turns into the summary. */
export async function summarize(key: string, c: Chat, signal?: AbortSignal): Promise<Chat> {
  const old = c.turns.slice(0, -KEEP)
  const text = (c.summary ? `Summary so far: ${c.summary}\n\n` : '') + old.map((t) => `${t.role === 'user' ? 'Student' : 'Tutor'}: ${t.text}`).join('\n\n')
  const r = await ask(key, {
    system: 'Summarise this tutoring chat in under 150 words for the tutor to carry on from. Keep what the student found hard, what was explained, and any open question.',
    contents: [{ role: 'user', parts: [{ text }] }],
  }, { signal })
  return { ...c, summary: r.text.trim(), turns: c.turns.slice(-KEEP) }
}

export async function saveChat(c: Chat) {
  await db.chats.put({ ...c, updatedAt: Date.now() })
  const n = await db.chats.count()
  if (n > MAX_CHATS) await db.chats.bulkDelete(await db.chats.orderBy('updatedAt').limit(n - MAX_CHATS).primaryKeys())
}
