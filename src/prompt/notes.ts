import { buildPrompt, type PromptOptions } from './build'

export type NotesPromptOptions = {
  withDeck: boolean
  course?: string
  unit?: string
  title?: string
  focus?: string
  extra?: string
  /** How long the page is. Default standard. */
  length?: 'short' | 'standard' | 'thorough'
  /** How many visuals (diagrams, charts, flows). Default some. */
  visuals?: 'none' | 'some' | 'lots'
  /** How many questions on the page. Default few. */
  questions?: 'none' | 'few' | 'many'
  /** When the material has maths: brief, or worked step by step. Default steps. */
  maths?: 'plain' | 'steps'
  /** Options for the companion deck (difficulty, types, terms, length). */
  deck?: Omit<PromptOptions, 'course' | 'title' | 'focus' | 'extra'>
}

const v = (s?: string) => (s && s.trim() ? s.trim() : '')

const LENGTH = {
  short: 'Short: 3 to 5 sections, about 10 minutes to read. Only the core ideas.',
  standard: 'Standard: 4 to 8 sections, 15 to 25 minutes to work through.',
  thorough: 'Thorough: everything in the material, up to 12 sections, 30 to 45 minutes. Split the reply (output rule 5) if you have to.',
}
const VISUALS = {
  none: 'None: no `flow`, `steps`, `cycle`, `compare`, `decision`, `tree`, `timeline`, `chart`, `diagram` or `demo` blocks. Use paragraphs, lists, tables and callouts.',
  some: 'Some: a visual only where it explains better than words, at most one per section.',
  lots: 'Lots: show ideas visually wherever the material allows, one or two visuals per section.',
}
const QUESTIONS = {
  none: 'None: no `question`, `match`, `reveal` or `worked` blocks.',
  few: 'A few: at most one short check at the end of a section, 4 to 8 on the page. Explanation comes first.',
  many: 'More: one or two checks per section, 10 to 16 on the page, still after the explanation.',
}
const MATHS = {
  plain: 'If the material has maths, give each formula with a one-line example. Keep working short.',
  steps: 'If the material has maths, show the working step by step: `worked` blocks for calculations, and `math` blocks that line up each step of a derivation.',
}

/** The "Choices for these notes" block that goes under the settings. */
export function notesChoices(o: Pick<NotesPromptOptions, 'length' | 'visuals' | 'questions' | 'maths'>): string {
  return [
    '### Choices for these notes',
    '',
    `- **Length.** ${LENGTH[o.length ?? 'standard']}`,
    `- **Visuals.** ${VISUALS[o.visuals ?? 'some']}`,
    `- **Questions on the page.** ${QUESTIONS[o.questions ?? 'few']}`,
    `- **Maths.** ${MATHS[o.maths ?? 'steps']} If the material has no maths, use none.`,
  ].join('\n')
}

/** Notes prompt, optionally with the deck rules appended so one reply returns notes and a companion deck. */
export function buildNotesPrompt(notesTemplate: string, deckTemplate: string, o: NotesPromptOptions): string {
  let s = notesTemplate.replace(/\r\n/g, '\n')
  s = s.replace(/<!-- companion -->\n([\s\S]*?)<!-- \/companion -->\n?/, (_, body: string) => (o.withDeck ? body : ''))
  s = s.replace(/## 1\. Settings[^\n]*\n\n```\n[\s\S]*?```/, () => [
    '## 1. Settings (already filled in by the user in Mneme; blank means use the default)',
    '',
    '```',
    `COURSE:        ${v(o.course)}`,
    `UNIT LABEL:    ${v(o.unit)}`,
    `TITLE:         ${v(o.title)}`,
    `FOCUS:         ${v(o.focus)}`,
    `EXTRA NOTES:   ${v(o.extra)}`,
    '```',
    '',
    notesChoices(o),
  ].join('\n'))

  if (o.withDeck) {
    s = s.replace('\n---\n\n## 2. Output rules', '\n**This request is for notes and a deck: you MUST include a top-level "deck" field** (see "Companion deck" below).\n\n---\n\n## 2. Output rules')
    const deckPrompt = buildPrompt(deckTemplate, { ...o.deck, course: o.course, title: o.title, focus: o.focus })
    const choices = deckPrompt.match(/### Choices for this deck[\s\S]*?(?=\n---\n)/)?.[0] ?? ''
    const rules = deckPrompt.slice(deckPrompt.indexOf('## 3. File structure'), deckPrompt.indexOf('## 5. Complete example')).replace(/\n---\n*$/, '')
    s += `\n\n---\n\n## Appendix: deck rules\n\nThese rules apply to the \`"deck"\` field only. Its structure is exactly a standalone Mneme deck.\n\n${choices}\n\n${rules.replace(/^## /gm, '### ').replace(/^### (Topics|Terms|Questions|Formatting)/gm, '#### $1')}\n`
  }
  return s.replace(/\n{3,}/g, '\n\n')
}
