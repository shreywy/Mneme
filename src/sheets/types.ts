/** How a page's paper looks. Lines are drawn every `spacing` px, which is also the text line height. */
export type Paper = {
  lines: 'none' | 'ruled' | 'dots' | 'squares'
  spacing: 24 | 28 | 32
  /** 0 (faint) to 1 (strong). */
  strength: number
  /** null: the theme's ink colour. */
  color: string | null
  /** A red margin line left of the main column, like notebook paper. */
  margin: boolean
  /** null: follow the theme. */
  paperColor: string | null
  /** Light or dark for this page only; 'app' (or unset) follows the app. */
  theme?: 'app' | 'light' | 'dark'
  /** The page's text font (a key from sheets/fonts); unset is the app's sans. */
  font?: string
}
export const DEFAULT_PAPER: Paper = { lines: 'ruled', spacing: 28, strength: 0.4, color: null, margin: false, paperColor: null }

export type SheetRow = {
  id: string
  folderId: string | null
  title: string
  /** True until the user names the page: the title follows the first heading. */
  titleAuto: boolean
  unit?: string
  rank?: number
  paper: Paper
  createdAt: number
  updatedAt: number
  lastOpenedAt?: number
  archived?: boolean
  archivedAt?: number
  /** Set when deleted: it waits in Recently deleted, then goes for good. */
  deletedAt?: number
  /** Not shown anywhere in the library (the page that holds My blocks). */
  hidden?: boolean
}

/**
 * A block on the canvas. x, y, w, h are grid units (h is whole lines). Text blocks hold everything you
 * write or insert (maths, tables, code, plots are nodes in their document); a bookmark is a named spot.
 */
export type SheetBlock = {
  id: string
  sheetId: string
  x: number
  y: number
  w: number
  h: number
  kind: 'text' | 'bookmark'
  /** The page's main column: never removed when emptied. */
  role?: 'main'
  /** `label` names a bookmark; `group` and `name` tie a saved block to its group in My blocks. */
  data: { doc: unknown; label?: string; group?: string; name?: string }
  z: number
  createdAt: number
  updatedAt: number
}

export const MAIN_BLOCK = { x: 3, y: 2, w: 24, h: 1 } as const
