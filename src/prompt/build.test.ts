import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildPrompt, type PromptOptions } from './build'
import { extractPromptExample } from '../deck-format/example'
import { parseDeckText } from '../deck-format/parse'

const TEMPLATE = readFileSync(join(__dirname, '../../deck-format/mneme-deck-prompt.md'), 'utf8')

describe('buildPrompt', () => {
  it('works with no options at all and keeps every type section', () => {
    const p = buildPrompt(TEMPLATE, {})
    for (const t of ['multiple_choice', 'numeric', 'cloze', 'ordering']) expect(p).toContain('**`' + t + '`**')
    expect(p).not.toContain('<!--')
  })

  it('fills the settings block from the options', () => {
    const p = buildPrompt(TEMPLATE, { course: 'ACC100', title: 'Midterm prep', focus: 'ch. 4', extra: 'lots of journal entries' })
    expect(p).toMatch(/COURSE:\s+ACC100/)
    expect(p).toMatch(/DECK TITLE:\s+Midterm prep/)
    expect(p).toMatch(/FOCUS:\s+ch\. 4/)
    expect(p).toMatch(/EXTRA NOTES:\s+lots of journal entries/)
  })

  it('removes sections for question styles that were not picked and says which to use', () => {
    const p = buildPrompt(TEMPLATE, { types: ['multiple_choice', 'true_false'] })
    expect(p).toContain('**`multiple_choice`**')
    expect(p).not.toContain('**`numeric`**')
    expect(p).toMatch(/Only use these question types: `multiple_choice`, `true_false`/)
  })

  it('drops the terms section and asks for an empty terms list when terms are skipped', () => {
    const p = buildPrompt(TEMPLATE, { terms: false })
    expect(p).not.toContain('### Terms')
    expect(p).toMatch(/"terms": \[\]/)
  })

  it('states the difficulty and length choices', () => {
    expect(buildPrompt(TEMPLATE, { difficulty: 'harder' })).toMatch(/Difficulty: harder/i)
    expect(buildPrompt(TEMPLATE, { length: 60 })).toMatch(/about 60 items/)
  })

  it('always contains an example that Mneme can import, for any combination', () => {
    const combos: PromptOptions[] = [{}, { terms: false }, { types: ['numeric'] }, { difficulty: 'easier', length: 'quick', types: ['cloze', 'ordering'], terms: false }]
    for (const o of combos) expect(parseDeckText(extractPromptExample(buildPrompt(TEMPLATE, o))).ok).toBe(true)
  })
})
