// Pages layout: the main column laid out on A4 or Letter sheets. Everything is counted in lines (grid
// units), so text stays on the paper's lines across sheets. Sizes are CSS px at 96 per inch.

export type PageSize = 'a4' | 'letter'
export const PAGE_PX: Record<PageSize, { w: number; h: number; label: string }> = {
  a4: { w: 794, h: 1123, label: 'A4' },
  letter: { w: 816, h: 1056, label: 'Letter' },
}
/** Lines of margin above and below the writing on each sheet. */
export const MARGIN = 2
/** Lines of desk between two sheets on the canvas. */
export const GAP = 1
/** Lines from the last line of one sheet's writing to the first line of the next. */
export const BETWEEN = MARGIN * 2 + GAP

/** Whole lines of writing that fit on one sheet. */
export const pageLines = (size: PageSize, unit: number) => Math.floor(PAGE_PX[size].h / unit) - MARGIN * 2

/**
 * Where the sheets break, given the height of each top-level piece of the column (whole lines). A piece
 * that would cross a break moves whole to the next sheet: `before[i]` is how many lines of space go in
 * front of piece i. One taller than a sheet starts a fresh sheet and runs on. Works the same in px
 * (pass the gap between sheets in px too), which keeps sheets lined up when a piece isn't whole lines.
 */
export function paginate(heights: number[], perPage: number, between = BETWEEN): { before: Record<number, number>; pages: number } {
  const before: Record<number, number> = {}
  let used = 0, pages = 1
  heights.forEach((h, i) => {
    if (used > 0 && used + h > perPage) {
      before[i] = perPage - used + between
      used = 0
      pages++
    }
    used += h
    if (used > perPage) {
      pages += Math.ceil(used / perPage) - 1
      used %= perPage
    }
  })
  return { before, pages }
}

/** Sheets needed for a column `lines` tall (with its page-break space). */
export const pageCount = (lines: number, perPage: number) => Math.max(1, Math.ceil((lines + BETWEEN) / (perPage + BETWEEN)))

/** Where the sheets sit on the canvas (px): centred on the main column, the first margin above its top. */
export function sheetFrame(main: { x: number; y: number; w: number }, size: PageSize, unit: number) {
  const perPage = pageLines(size, unit)
  const width = PAGE_PX[size].w
  return {
    left: main.x * unit + (main.w * unit) / 2 - width / 2,
    top: (main.y - MARGIN) * unit,
    width,
    height: (perPage + MARGIN * 2) * unit,
    pitch: (perPage + BETWEEN) * unit,
    perPage,
  }
}
