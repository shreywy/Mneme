import type { Exercise } from './exercises'
import { gradeCloze, gradeNumeric, gradeSelection, gradeTyped } from './grading'

export type Response =
  | { kind: 'choice'; index: number }
  | { kind: 'multi'; indices: number[] }
  | { kind: 'bool'; value: boolean }
  | { kind: 'text'; value: string }
  | { kind: 'blanks'; values: string[] }
  | { kind: 'order'; order: string[] }
  | { kind: 'parts'; responses: (Response | undefined)[] }

export type Grade = { correct: boolean; close?: string; blanks?: boolean[]; parts?: Grade[] }

export function gradeResponse(ex: Exercise, r: Response | undefined): Grade {
  if (!r) return { correct: false }
  switch (ex.kind) {
    case 'mc': return { correct: r.kind === 'choice' && !!ex.options[r.index]?.correct }
    case 'ms': return { correct: r.kind === 'multi' && gradeSelection(r.indices, ex.options.flatMap((o, i) => (o.correct ? [i] : []))) }
    case 'tf': return { correct: r.kind === 'bool' && r.value === ex.answer }
    case 'typed': return r.kind === 'text' ? gradeTyped(r.value, ex.answers) : { correct: false }
    case 'numeric': return { correct: r.kind === 'text' && gradeNumeric(r.value, ex.answer, ex.tolerance) }
    case 'cloze': {
      if (r.kind !== 'blanks') return { correct: false }
      const blanks = gradeCloze(r.values, ex.cloze)
      return { correct: blanks.every(Boolean), blanks }
    }
    case 'order': return { correct: r.kind === 'order' && r.order.length === ex.items.length && r.order.every((s, i) => s === ex.items[i]) }
    case 'scenario': {
      const parts = ex.parts.map((p, i) => gradeResponse(p, r.kind === 'parts' ? r.responses[i] : undefined))
      return { correct: parts.every((g) => g.correct), parts }
    }
  }
}
