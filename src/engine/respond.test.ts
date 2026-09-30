import { describe, expect, it } from 'vitest'
import type { Item } from '../deck-format/types'
import { buildExercise } from './exercises'
import { gradeResponse } from './respond'
import { mulberry32 } from './rng'

const q = (over: Partial<Item> & Record<string, unknown>): Item => ({ kind: 'question', key: 'k', topic: 't', prompt: 'P', explanation: 'E', difficulty: 1, ...over } as Item)

describe('gradeResponse', () => {
  it('grades a multiple-choice pick by the shuffled option index', () => {
    const ex = buildExercise(q({ qtype: 'multiple_choice', choices: [{ text: 'A', correct: true }, { text: 'B', correct: false }] }), [], 'recall', mulberry32(1))
    if (ex.kind !== 'mc') throw new Error()
    const right = ex.options.findIndex((o) => o.correct)
    expect(gradeResponse(ex, { kind: 'choice', index: right }).correct).toBe(true)
    expect(gradeResponse(ex, { kind: 'choice', index: 1 - right }).correct).toBe(false)
  })
  it('needs the exact set for select-all', () => {
    const ex = buildExercise(q({ qtype: 'multiple_select', choices: [{ text: 'A', correct: true }, { text: 'B', correct: true }, { text: 'C', correct: false }] }), [], 'recall', mulberry32(2))
    if (ex.kind !== 'ms') throw new Error()
    const rights = ex.options.flatMap((o, i) => (o.correct ? [i] : []))
    expect(gradeResponse(ex, { kind: 'multi', indices: rights }).correct).toBe(true)
    expect(gradeResponse(ex, { kind: 'multi', indices: rights.slice(0, 1) }).correct).toBe(false)
  })
  it('grades true/false, numeric, typed, cloze and ordering', () => {
    const tf = buildExercise(q({ qtype: 'true_false', answer: false }), [], 'recall')
    expect(gradeResponse(tf, { kind: 'bool', value: false }).correct).toBe(true)
    const num = buildExercise(q({ qtype: 'numeric', answer: 2000, tolerance: 0 }), [], 'recall')
    expect(gradeResponse(num, { kind: 'text', value: '$2,000' }).correct).toBe(true)
    const sa = buildExercise(q({ qtype: 'short_answer', answer: 'Matching principle', accept: ['matching'] }), [], 'recall')
    expect(gradeResponse(sa, { kind: 'text', value: 'matchng principle' })).toEqual({ correct: true, close: 'Matching principle' })
    const cl = buildExercise(q({ qtype: 'cloze', prompt: 'A = {{L}} + {{E}}' }), [], 'recall')
    const g = gradeResponse(cl, { kind: 'blanks', values: ['l', 'x'] })
    expect(g.correct).toBe(false)
    expect(g.blanks).toEqual([true, false])
    const ord = buildExercise(q({ qtype: 'ordering', items: ['1', '2', '3'] }), [], 'recall')
    expect(gradeResponse(ord, { kind: 'order', order: ['1', '2', '3'] }).correct).toBe(true)
    expect(gradeResponse(ord, { kind: 'order', order: ['2', '1', '3'] }).correct).toBe(false)
  })
  it('treats a missing response as wrong', () => {
    const tf = buildExercise(q({ qtype: 'true_false', answer: true }), [], 'recall')
    expect(gradeResponse(tf, undefined).correct).toBe(false)
  })
})
