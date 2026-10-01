export type Topic = { id: string; name: string; summary?: string }

export type Choice = { text: string; correct: boolean; why?: string }

type Base = {
  kind: 'question'
  key: string
  topic: string
  prompt: string
  explanation: string
  difficulty: 1 | 2 | 3
  source?: string
}

export type MultipleChoice = Base & { qtype: 'multiple_choice'; choices: Choice[] }
export type MultipleSelect = Base & { qtype: 'multiple_select'; choices: Choice[] }
export type TrueFalse = Base & { qtype: 'true_false'; answer: boolean }
export type ShortAnswer = Base & { qtype: 'short_answer'; answer: string; accept: string[] }
export type Numeric = Base & { qtype: 'numeric'; answer: number; tolerance: number; unit?: string }
export type Cloze = Base & { qtype: 'cloze' }
export type Ordering = Base & { qtype: 'ordering'; items: string[] }

export type SimpleQuestion = MultipleChoice | MultipleSelect | TrueFalse | ShortAnswer | Numeric | Cloze | Ordering
/** One shared case (text or table) with 2–6 questions about it, shown and graded together. */
export type Scenario = Base & { qtype: 'scenario'; parts: SimpleQuestion[] }

export type QuestionItem = SimpleQuestion | Scenario
export type QuestionType = QuestionItem['qtype']

export type TermItem = {
  kind: 'term'
  key: string
  topic: string
  term: string
  definition: string
  aliases: string[]
  example?: string
  explanation?: string
  source?: string
}

export type Item = TermItem | QuestionItem

export type NormalizedDeck = {
  title: string
  course?: string
  description?: string
  sources: string[]
  part?: { index: number; of: number }
  topics: Topic[]
  items: Item[]
}

export type ParseResult =
  | { ok: true; deck: NormalizedDeck; warnings: string[] }
  | { ok: false; errors: string[] }

export const QUESTION_TYPES: QuestionType[] = ['multiple_choice', 'multiple_select', 'true_false', 'short_answer', 'numeric', 'cloze', 'ordering', 'scenario']
