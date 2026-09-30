import type { QuestionType } from '../deck-format/types'
import { QUESTION_TYPES } from '../deck-format/types'

export type PromptOptions = {
  course?: string
  title?: string
  focus?: string
  length?: 'comprehensive' | 'focused' | 'quick' | number
  difficulty?: 'mixed' | 'easier' | 'harder'
  types?: QuestionType[]
  terms?: boolean
  extra?: string
}

export const TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Multiple choice',
  multiple_select: 'Select all that apply',
  true_false: 'True / false',
  short_answer: 'Typed answer',
  numeric: 'Numeric',
  cloze: 'Fill in the blank',
  ordering: 'Put in order',
}

const DIFFICULTY_RULES = {
  mixed: 'Difficulty: mixed. Roughly 20% level 1, 45% level 2 and 35% level 3.',
  easier: 'Difficulty: easier. Mostly level 1 and 2 (recall and understanding). Keep level 3 to about 10%.',
  harder: 'Difficulty: harder. Mostly level 3: realistic scenarios, calculations and "which applies here" questions, with close, tempting distractors. Keep level 1 under 10%.',
}

const fill = (v: string | undefined) => (v && v.trim() ? v.trim() : '')

/** Build the LLM prompt from the markdown template and the user's choices. Blank options fall back to defaults. */
export function buildPrompt(template: string, o: PromptOptions): string {
  let s = template.replace(/\r\n/g, '\n')
  const types = o.types && o.types.length ? QUESTION_TYPES.filter((t) => o.types!.includes(t)) : QUESTION_TYPES
  const allTypes = types.length === QUESTION_TYPES.length
  const withTerms = o.terms !== false

  // Remove type sections that weren't picked, then strip remaining markers.
  s = s.replace(/<!-- type:(\w+) -->\n([\s\S]*?)<!-- \/type -->\n?/g, (_, t: string, body: string) => (types.includes(t as QuestionType) ? body : ''))
  s = s.replace(/<!-- terms -->\n([\s\S]*?)<!-- \/terms -->\n?/g, (_, body: string) => (withTerms ? body : ''))

  const size = typeof o.length === 'number' ? `about ${o.length} items` : o.length ?? 'comprehensive'
  s = s.replace(/## 1\. Settings[^\n]*\n\n```\n[\s\S]*?```/, () => [
    '## 1. Settings (already filled in by the user in Mneme; blank means use the default)',
    '',
    '```',
    `COURSE:        ${fill(o.course)}`,
    `DECK TITLE:    ${fill(o.title)}`,
    `FOCUS:         ${fill(o.focus)}`,
    `SIZE:          ${size}`,
    `EXTRA NOTES:   ${fill(o.extra)}`,
    '```',
  ].join('\n'))

  const choices = [
    '### Choices for this deck (these override anything below)',
    '',
    `- ${DIFFICULTY_RULES[o.difficulty ?? 'mixed']}`,
    typeof o.length === 'number' ? `- Length: about ${o.length} items in total (terms plus questions). Pick the most important material first.` : '',
    allTypes ? '- Question types: use whichever types fit the material best.' : `- Only use these question types: ${types.map((t) => '`' + t + '`').join(', ')}. The example in section 5 shows every type; ignore the ones not listed here.`,
    withTerms ? '' : '- Skip vocabulary: output `"terms": []` and put everything into `questions`.',
    fill(o.course) ? '' : '- If COURSE is blank, use the course code or name from the material.',
    fill(o.title) ? '' : '- If DECK TITLE is blank, write a short title from the material (e.g. "Chapter 3 review").',
  ].filter(Boolean).join('\n')

  s = s.replace(/\n---\n\n## 2\. Output rules/, `\n${choices}\n\n---\n\n## 2. Output rules`)
  return s.replace(/\n{3,}/g, '\n\n')
}
