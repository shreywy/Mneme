import type { Editor } from '@tiptap/react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { InsertId } from '../../sheets/insert'

export type Tool = 'text' | 'select' | 'pan' | 'pen' | 'highlighter' | 'eraser' | 'lasso'
export const INK_TOOLS: Tool[] = ['pen', 'highlighter', 'eraser', 'lasso']
export const isInkTool = (t: Tool) => INK_TOOLS.includes(t)

/** What the canvas lets the toolbar, dock and Insert panel do. Set by the canvas while it's mounted. */
export type CanvasApi = {
  /** A new text block holding `content`, at a grid cell (default: the middle of the view). Returns its id. */
  newBlock: (content: object[], at?: { x: number; y: number }) => Promise<string>
  /** Drop a My block group at a grid cell (default: the middle of the view). */
  placeGroup: (group: string, at?: { x: number; y: number }) => Promise<void>
  /** A named bookmark at a grid cell (default: the middle of the view). */
  addBookmark: (at?: { x: number; y: number }) => Promise<void>
  /** A box of sub-pages at a grid cell (default: a free spot in the middle of the view). */
  addBox: (at?: { x: number; y: number }) => Promise<void>
  jumpTo: (b: { x: number; y: number }) => void
  undo: () => void
  redo: () => void
  removeBlock: (id: string) => Promise<void>
  /** The grid cell under a screen point, or null when it isn't over the paper. */
  cellAtClient: (clientX: number, clientY: number) => { x: number; y: number } | null
}

type State = {
  /** The text block being edited, and the last one (Insert puts things at its cursor). */
  editor: Editor | null
  blockId: string | null
  lastEditor: Editor | null
  /** Bumped on every selection or content change in the active editor, so the toolbar re-renders. */
  tick: number
  tool: Tool
  insertOpen: boolean
  /** The page that's open (pictures are kept per page). */
  sheetId: string | null
  canvas: CanvasApi | null
  set: (p: Partial<State>) => void
}

export const useSheetUI = create<State>((set) => ({
  editor: null, blockId: null, lastEditor: null, tick: 0, tool: 'text', insertOpen: false, canvas: null, sheetId: null,
  set: (p) => set(p),
}))

/** The last four things inserted, newest first (numbers 1–4 in the Insert panel). Kept per browser. */
export const useRecents = create<{ recents: string[]; push: (id: InsertId | `my:${string}`) => void }>()(persist((set) => ({
  recents: [],
  push: (id) => set((s) => ({ recents: [id, ...s.recents.filter((x) => x !== id)].slice(0, 4) })),
}), { name: 'mneme.sheet.recents' }))
