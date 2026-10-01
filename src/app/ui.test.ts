import { describe, expect, it } from 'vitest'
import { studyBack } from './ui'

describe('studyBack', () => {
  it('returns to the notes page it came from', () => {
    expect(studyBack(new URLSearchParams('from=/notes/abc-123'), 'd1')).toBe('/notes/abc-123')
  })
  it('ignores anything that is not a notes page path', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/notes/../settings', '/deck/x', 'javascript:alert(1)']) {
      expect(studyBack(new URLSearchParams({ from: bad }), 'd1')).toBe('/deck/d1')
    }
  })
  it('keeps the deck filters but drops `from`', () => {
    expect(studyBack(new URLSearchParams('f=terms&from=nope'), 'd1')).toBe('/deck/d1?f=terms')
  })
})
