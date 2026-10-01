import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseNotesText } from './parse'
import { notesToFile } from './export'

const PROMPT = readFileSync(join(__dirname, '../../deck-format/mneme-notes-prompt.md'), 'utf8')
const example = PROMPT.slice(PROMPT.indexOf('## 6. Complete example')).match(/```json\r?\n([\s\S]*?)\r?\n```/)![1]

describe('notesToFile', () => {
  it('writes a file that imports back to the same page', () => {
    const a = parseNotesText(example)
    if (!a.ok) throw new Error('example should parse')
    const file = notesToFile({ ...a.notes, blocks: [{ type: 'part', title: 'Chapter 3' }, ...a.notes.blocks] })
    const b = parseNotesText(JSON.stringify(file))
    if (!b.ok) throw new Error(b.errors.join('; '))
    expect(b.warnings).toEqual([])
    expect(b.notes.title).toBe(a.notes.title)
    expect(b.notes.blocks).toEqual([{ type: 'part', title: 'Chapter 3' }, ...a.notes.blocks])
  })
})
