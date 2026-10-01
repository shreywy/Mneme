import { describe, expect, it } from 'vitest'
import { describeSpan, locate } from './anchor'

const text = 'Demand falls as price rises. When price rises, demand falls, unless the good is a status symbol.'

describe('text anchors', () => {
  it('finds the quote again from its description', () => {
    const start = text.indexOf('price rises', 30)
    const a = describeSpan(text, start, start + 'price rises'.length)
    expect(locate(text, a)).toEqual({ start, end: start + 'price rises'.length })
  })
  it('tells repeated phrases apart by the text around them', () => {
    const first = text.indexOf('price rises')
    const second = text.indexOf('price rises', first + 1)
    expect(locate(text, describeSpan(text, first, first + 11))?.start).toBe(first)
    expect(locate(text, describeSpan(text, second, second + 11))?.start).toBe(second)
  })
  it('still finds it after small edits elsewhere', () => {
    const start = text.indexOf('status symbol')
    const a = describeSpan(text, start, start + 13)
    const edited = 'NEW INTRO. ' + text
    expect(locate(edited, a)?.start).toBe(edited.indexOf('status symbol'))
  })
  it('returns null when the quote is gone', () => {
    const a = describeSpan(text, 0, 6)
    expect(locate('Something else entirely.', a)).toBeNull()
  })
})
