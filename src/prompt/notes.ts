import { buildPrompt, type PromptOptions } from './build'

export type NotesPromptOptions = {
  withDeck: boolean
  course?: string
  unit?: string
  title?: string
  focus?: string
  extra?: string
  /** Options for the companion deck (difficulty, types, terms, length). */
  deck?: Omit<PromptOptions, 'course' | 'title' | 'focus' | 'extra'>
}

const v = (s?: string) => (s && s.trim() ? s.trim() : '')

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
