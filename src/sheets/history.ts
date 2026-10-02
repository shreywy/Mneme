import { deleteBlock, putBlock } from '../data/sheets'
import type { SheetBlock } from './types'

export type Change =
  | { kind: 'add'; block: SheetBlock }
  | { kind: 'remove'; block: SheetBlock }
  | { kind: 'update'; before: SheetBlock; after: SheetBlock }
  | { kind: 'batch'; changes: Change[] }

const inverse = (c: Change): Change =>
  c.kind === 'add' ? { kind: 'remove', block: c.block }
    : c.kind === 'remove' ? { kind: 'add', block: c.block }
      : c.kind === 'update' ? { kind: 'update', before: c.after, after: c.before }
        : { kind: 'batch', changes: [...c.changes].reverse().map(inverse) }

/** Block-level undo (add, move, resize, delete). Typing has its own undo inside each text block. */
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

export async function applyChange(c: Change): Promise<void> {
  if (c.kind === 'batch') { for (const x of c.changes) await applyChange(x); return }
  if (c.kind === 'remove') await deleteBlock(c.block.id)
  else await putBlock(c.kind === 'add' ? c.block : { ...c.after, updatedAt: Date.now() })
}
