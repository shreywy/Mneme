import { describe, expect, it } from 'vitest'
import { createHistory } from './history'
import type { SheetBlock } from './types'

const b = (x: number): SheetBlock => ({ id: 'a', sheetId: 's', x, y: 0, w: 4, h: 1, kind: 'text', data: { doc: null }, z: 0, createdAt: 0, updatedAt: 0 })

describe('history', () => {
  it('undo returns the inverse, redo the original, newest first', () => {
    const h = createHistory()
    h.record({ kind: 'add', block: b(1) })
    h.record({ kind: 'update', before: b(1), after: b(5) })
    expect(h.undo()).toEqual({ kind: 'update', before: b(5), after: b(1) })
    expect(h.undo()).toEqual({ kind: 'remove', block: b(1) })
    expect(h.undo()).toBeNull()
    expect(h.redo()).toEqual({ kind: 'add', block: b(1) })
    expect(h.canRedo()).toBe(true)
  })

  it('a group change undoes as one, in reverse order', () => {
    const h = createHistory()
    h.record({ kind: 'batch', changes: [{ kind: 'remove', block: b(1) }, { kind: 'update', before: b(2), after: b(3) }] })
    expect(h.undo()).toEqual({ kind: 'batch', changes: [{ kind: 'update', before: b(3), after: b(2) }, { kind: 'add', block: b(1) }] })
  })

  it('a new change clears redo, and old changes fall off past the limit', () => {
    const h = createHistory(2)
    h.record({ kind: 'add', block: b(1) })
    h.undo()
    h.record({ kind: 'add', block: b(2) })
    expect(h.canRedo()).toBe(false)
    h.record({ kind: 'add', block: b(3) })
    h.record({ kind: 'add', block: b(4) })
    h.undo(); h.undo()
    expect(h.canUndo()).toBe(false)
  })
})
