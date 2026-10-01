import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildNotesPrompt } from './notes'
import { parseNotesText } from '../notes-format/parse'

const NOTES = readFileSync(join(__dirname, '../../deck-format/mneme-notes-prompt.md'), 'utf8')
const DECK = readFileSync(join(__dirname, '../../deck-format/mneme-deck-prompt.md'), 'utf8')
const example = (p: string) => p.slice(p.indexOf('## 6. Complete example')).match(/```json\r?\n([\s\S]*?)\r?\n```/)![1]

describe('buildNotesPrompt', () => {
  it('notes only: no companion deck section and no deck appendix', () => {
    const p = buildNotesPrompt(NOTES, DECK, { withDeck: false })
    expect(p).not.toContain('Companion deck')
    expect(p).not.toContain('Appendix')
    expect(p).not.toContain('<!--')
  })

  it('notes and deck: asks for the deck field and appends the deck rules', () => {
    const p = buildNotesPrompt(NOTES, DECK, { withDeck: true, deck: { types: ['multiple_choice', 'numeric'] } })
    expect(p).toContain('Companion deck')
    expect(p).toContain('## Appendix: deck rules')
    expect(p).toContain('**`numeric`**')
    expect(p).not.toContain('**`cloze`**')
    expect(p).toMatch(/you MUST include a top-level "deck"/i)
  })

  it('fills the settings block', () => {
    const p = buildNotesPrompt(NOTES, DECK, { withDeck: false, course: 'ACC100', unit: 'Chapter 2', title: 'The accounting equation' })
    expect(p).toMatch(/COURSE:\s+ACC100/)
    expect(p).toMatch(/UNIT LABEL:\s+Chapter 2/)
    expect(p).toMatch(/TITLE:\s+The accounting equation/)
  })

  it('keeps an importable example', () => {
    expect(parseNotesText(example(buildNotesPrompt(NOTES, DECK, { withDeck: true }))).ok).toBe(true)
  })
})

describe('notes choices', () => {
  it('defaults to standard length, some visuals, a few questions, maths shown step by step', () => {
    const p = buildNotesPrompt(NOTES, DECK, { withDeck: false })
    expect(p).toContain('### Choices for these notes')
    expect(p).toMatch(/\*\*Length\.\*\* Standard/)
    expect(p).toMatch(/\*\*Visuals\.\*\* Some/)
    expect(p).toMatch(/\*\*Questions on the page\.\*\* A few/)
    expect(p).toMatch(/step by step/)
  })
  it('says none when visuals and questions are turned off', () => {
    const p = buildNotesPrompt(NOTES, DECK, { withDeck: false, visuals: 'none', questions: 'none', length: 'short', maths: 'plain' })
    expect(p).toMatch(/\*\*Visuals\.\*\* None: no `flow`/)
    expect(p).toMatch(/\*\*Questions on the page\.\*\* None/)
    expect(p).toMatch(/\*\*Length\.\*\* Short/)
  })
  it('always tells the model to teach in order and skip maths the course does not have', () => {
    const p = buildNotesPrompt(NOTES, DECK, { withDeck: false })
    expect(p).toContain('**Teach, in order.**')
    expect(p).toContain('**Maths only where the course has it.**')
  })
})
