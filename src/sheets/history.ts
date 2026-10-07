import { deleteBlock, getBlock, putBlock, updateBlock } from '../data/sheets'
import { deleteStrokes, getStroke, putStroke } from '../data/ink'
import type { SheetBlock, SheetStroke } from './types'

export type Change =
  | { kind: 'add'; block: SheetBlock }
  | { kind: 'remove'; block: SheetBlock }
  | { kind: 'update'; before: SheetBlock; after: SheetBlock }
  | { kind: 'ink-add'; stroke: SheetStroke }
  | { kind: 'ink-remove'; stroke: SheetStroke }
  | { kind: 'ink-update'; before: SheetStroke; after: SheetStroke }
  | { kind: 'batch'; changes: Change[] }

const inverse = (c: Change): Change =>
  c.kind === 'add' ? { kind: 'remove', block: c.block }
    : c.kind === 'remove' ? { kind: 'add', block: c.block }
      : c.kind === 'update' ? { kind: 'update', before: c.after, after: c.before }
        : c.kind === 'ink-add' ? { kind: 'ink-remove', stroke: c.stroke }
          : c.kind === 'ink-remove' ? { kind: 'ink-add', stroke: c.stroke }
            : c.kind === 'ink-update' ? { kind: 'ink-update', before: c.after, after: c.before }
              : { kind: 'batch', changes: [...c.changes].reverse().map(inverse) }

/** Page-level undo: blocks (add, move, resize, delete) and ink, together. Typing has its own undo inside each text block. */
export function createHistory(limit = 200) {
  const past: Change[] = [], future: Change[] = []
  return {
    record(c: Change) { past.push(c); if (past.length > limit) past.shift(); future.length = 0 },
    /** The change that reverses the last one, or null. */
    undo(): Change | null { const c = past.pop(); if (!c) return null; future.push(c); return inverse(c) },
    /** The last undone change, to apply again, or null. */
    redo(): Change | null { const c = future.pop(); if (!c) return null; past.push(c); return c },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  }
}

/**
 * Applies a change from undo or redo. Moves and resizes only touch position and width, so text typed
 * since is kept. Removing a block first copies what it holds now into the change, which the matching
 * redo or undo shares, so bringing it back restores its latest text.
 */
export async function applyChange(c: Change): Promise<void> {
  if (c.kind === 'batch') { for (const x of c.changes) await applyChange(x); return }
  if (c.kind === 'remove') {
    const now = await getBlock(c.block.id)
    if (now) Object.assign(c.block, now)
    await deleteBlock(c.block.id)
  } else if (c.kind === 'add') await putBlock({ ...c.block, updatedAt: Date.now() })
  // A bookmark's or box's name undoes too (a text block's doc never does: newer typing would be lost).
  else if (c.kind === 'update') await updateBlock(c.after.id, { x: c.after.x, y: c.after.y, w: c.after.w, ...(c.after.kind !== 'text' ? { data: c.after.data } : {}) })
  else if (c.kind === 'ink-remove') {
    const now = await getStroke(c.stroke.id)
    if (now) Object.assign(c.stroke, now)
    await deleteStrokes([c.stroke.id])
  } else await putStroke(c.kind === 'ink-add' ? c.stroke : c.after)
}
