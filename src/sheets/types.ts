import type { PageSize } from './pages'

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
  /** Pageless (the default) or laid out on sheets of paper. */
  layout?: 'pageless' | 'pages'
  size?: PageSize
  pageNumbers?: boolean
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
  /** The page this one sits under (sub-pages). Unset: a top-level page in `folderId`. */
  parentId?: string
  /** The box block on the parent page that shows this page. */
  box?: string
}

/**
 * A block on the canvas. x, y, w, h are grid units (h is whole lines). Text blocks hold everything you
 * write or insert (maths, tables, code, plots are nodes in their document); a bookmark is a named spot;
 * a box holds sub-page cards (its pages are the sheets whose `box` is its id; `data.label` is its title).
 */
export type SheetBlock = {
  id: string
  sheetId: string
  x: number
  y: number
  w: number
  h: number
  kind: 'text' | 'bookmark' | 'box'
  /** The page's main column: never removed when emptied. */
  role?: 'main'
  /** `label` and `color` (hex) name and mark a bookmark; `group` and `name` tie a saved block to its group in My blocks. */
  data: { doc: unknown; label?: string; color?: string; group?: string; name?: string }
  z: number
  createdAt: number
  updatedAt: number
}

export const MAIN_BLOCK = { x: 3, y: 2, w: 24, h: 1 } as const

/**
 * One pen or highlighter stroke. On the paper its points are world px; anchored to a block (`blockId`)
 * they're px from that block's top-left, so the stroke moves with the block.
 */
export type SheetStroke = {
  id: string
  sheetId: string
  blockId?: string
  tool: 'pen' | 'highlighter'
  /** A colour, or 'ink' for the theme's text colour (dark on light paper, light on dark). */
  color: string
  size: number
  /** Encoded points: see encodePoints in sheets/ink. */
  pts: number[]
  /** A shape or a straightened highlight: drawn as a clean line through its points. */
  shape?: boolean
  /** Drawn with a mouse: pressure is made up from the speed. */
  sim?: boolean
  createdAt: number
  updatedAt: number
}
