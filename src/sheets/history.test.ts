import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { applyChange, createHistory, type Change } from './history'
import * as ink from '../data/ink'
import * as sheets from '../data/sheets'
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

  it('undoing a move keeps text typed after the move', async () => {
    const id = await sheets.createSheet()
    const b = await sheets.addBlock({ sheetId: id, x: 30, y: 2, w: 10, h: 1, kind: 'text', data: { doc: 'old' }, z: 1 })
    const h = createHistory()
    const moved = { ...b, x: 34 }
    await sheets.putBlock(moved)
    h.record({ kind: 'update', before: b, after: moved })
    await sheets.saveBlockDoc(b.id, 'typed later')
    await applyChange(h.undo()!)
    const now = (await sheets.blocksFor(id)).find((x) => x.id === b.id)
    expect(now?.x).toBe(30)
    expect(now?.data.doc).toBe('typed later')
  })

  it('undoes and redoes strokes, and a block deleted with its drawing comes back with it', async () => {
    const id = await sheets.createSheet()
    const blk = await sheets.addBlock({ sheetId: id, x: 30, y: 2, w: 10, h: 1, kind: 'text', data: { doc: 'x' }, z: 1 })
    const s = await ink.addStroke({ sheetId: id, blockId: blk.id, tool: 'pen', color: 'ink', size: 3, pts: [4, 4, 32] })
    const h = createHistory()
    h.record({ kind: 'ink-add', stroke: s })
    await applyChange(h.undo()!)
    expect(await ink.inkFor(id)).toEqual([])
    await applyChange(h.redo()!)
    expect(await ink.inkFor(id)).toHaveLength(1)

    const del: Change = { kind: 'batch', changes: [{ kind: 'remove', block: blk }, { kind: 'ink-remove', stroke: s }] }
    h.record(del)
    await applyChange(del)
    expect(await sheets.blocksFor(id)).toHaveLength(1)
    expect(await ink.inkFor(id)).toEqual([])
    await applyChange(h.undo()!)
    expect((await ink.inkFor(id))[0]?.blockId).toBe(blk.id)

    const recoloured = { ...s, color: '#C0392B' }
    h.record({ kind: 'ink-update', before: s, after: recoloured })
    await applyChange(recoloured && { kind: 'ink-update', before: s, after: recoloured })
    await applyChange(h.undo()!)
    expect((await ink.inkFor(id))[0]?.color).toBe('ink')
  })

  it('undo then redo of a new block brings back the text typed into it', async () => {
    const id = await sheets.createSheet()
    const b = await sheets.addBlock({ sheetId: id, x: 30, y: 2, w: 10, h: 1, kind: 'text', data: { doc: 'empty' }, z: 1 })
    const h = createHistory()
    h.record({ kind: 'add', block: b })
    await sheets.saveBlockDoc(b.id, 'my notes')
    await applyChange(h.undo()!)
    expect((await sheets.blocksFor(id)).some((x) => x.id === b.id)).toBe(false)
    await applyChange(h.redo()!)
    expect((await sheets.blocksFor(id)).find((x) => x.id === b.id)?.data.doc).toBe('my notes')
  })
})
