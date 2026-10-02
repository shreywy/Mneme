import katex from 'katex'

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`).replace(/&#38;/g, '&amp;').replace(/&#60;/g, '&lt;').replace(/&#62;/g, '&gt;')

/** KaTeX's HTML for some LaTeX. If KaTeX gives up (it can still throw), the source is shown as plain text. */
export function texHtml(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex || '\\square', { throwOnError: false, displayMode, maxExpand: 200, maxSize: 50 })
  } catch {
    return `<code>${escape(latex)}</code>`
  }
}
