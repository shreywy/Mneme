import type { Item, QuestionItem, SimpleQuestion } from '../deck-format/types'
import type { Exercise } from '../engine/exercises'
import type { Grade, Response } from '../engine/respond'

// Cards as plain text for Gemini: the card, what the student answered, and whether it was right.

export type DeckInfo = { title: string; course?: string; topics: { id: string; name: string }[] }

function answerOf(q: SimpleQuestion): string {
  switch (q.qtype) {
    case 'multiple_choice': case 'multiple_select':
      return q.choices.map((c) => `- ${c.correct ? '[correct] ' : ''}${c.text}${c.why ? ` (${c.why})` : ''}`).join('\n')
    case 'true_false': return `Answer: ${q.answer ? 'True' : 'False'}`
    case 'short_answer': return `Answer: ${q.answer}${q.accept.length ? ` (also accepted: ${q.accept.join(', ')})` : ''}`
    case 'numeric': return `Answer: ${q.answer}${q.unit ? ` ${q.unit}` : ''} (within ${q.tolerance})`
    case 'cloze': return `Blanks are in {{double braces}}: ${q.prompt}`
    case 'ordering': return `Correct order:\n${q.items.map((x, i) => `${i + 1}. ${x}`).join('\n')}`
  }
}

/** The card itself: prompt, answer, explanation. */
export function cardText(item: Item): string {
  if (item.kind === 'term') {
    return [`Term: ${item.term}`, `Definition: ${item.definition}`, item.example && `Example: ${item.example}`, item.explanation && `Explanation: ${item.explanation}`].filter(Boolean).join('\n')
  }
  const q = item as QuestionItem
  const body = q.qtype === 'scenario'
    ? `Case: ${q.prompt}\n\n${q.parts.map((p, i) => `Part ${i + 1}: ${p.prompt}\n${answerOf(p)}`).join('\n\n')}`
    : `Question: ${q.prompt}\n${answerOf(q)}`
  return body + (q.explanation ? `\nExplanation: ${q.explanation}` : '')
}

/** What the student answered, in words. */
export function responseText(ex: Exercise, r: Response | undefined): string {
  if (!r) return '(no answer)'
  switch (r.kind) {
    case 'choice': return ex.kind === 'mc' ? ex.options[r.index]?.text ?? '?' : '?'
    case 'multi': return ex.kind === 'ms' ? r.indices.map((i) => ex.options[i]?.text).join('; ') || '(nothing picked)' : '?'
    case 'bool': return r.value ? 'True' : 'False'
    case 'text': return r.value.trim() || '(left blank)'
    case 'blanks': return r.values.map((v, i) => `blank ${i + 1}: ${v.trim() || '(blank)'}`).join(', ')
    case 'order': return r.order.map((x, i) => `${i + 1}. ${x}`).join(' ')
    case 'parts': return ex.kind === 'scenario' ? ex.parts.map((p, i) => `Part ${i + 1}: ${responseText(p, r.responses[i])}`).join('\n') : '?'
  }
}

/** The pinned context for the tutor: deck, card, and (once answered) the student's answer and the grade. */
export function cardContext(deck: DeckInfo, ex: Exercise, answered?: { response?: Response; grade?: Grade }): string {
  const topic = deck.topics.find((t) => t.id === ex.item.topic)?.name
  const head = `Deck: ${deck.title}${deck.course ? ` (${deck.course})` : ''}${topic ? `\nTopic: ${topic}` : ''}`
  const asked = ex.item.kind === 'term' && ex.kind === 'mc' && ex.promptKind === 'definition' ? '\nShown as: the definition, pick the term' : ''
  const tail = answered?.grade
    ? `\n\nThe student answered: ${responseText(ex, answered.response)}\nMarked: ${answered.grade.correct ? 'right' : 'wrong'}`
    : '\n\nThe student hasn’t answered yet. Don’t give the answer away unless they ask for it; hint first.'
  return `${head}\n\n${cardText(ex.item)}${asked}${tail}`
}
