// Smart paste: what a paste into a page should become. Plain writing returns null and pastes as usual.

export type PasteTarget = { kind: 'deck' | 'note' | 'sheet'; id: string }
export type PasteResult =
  | { kind: 'table'; rows: string[][] }
  | { kind: 'latex'; tex: string }
  | { kind: 'code'; code: string; lang?: string }
  | { kind: 'link'; target: PasteTarget }
  | null

const ROUTES: Record<string, PasteTarget['kind']> = { deck: 'deck', notes: 'note', write: 'sheet' }
const LATEX = /\\(frac|sqrt|int|sum|prod|lim|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|omega|Delta|infty|cdot|times|leq|geq|neq|approx|partial|vec|hat|mathbf|left|right|begin)\b|[\^_]\{/

export function classifyPaste({ text, origin, editorLanguage }: { text: string; origin: string; editorLanguage?: string }): PasteResult {
  const t = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  const one = t.trim()

  // A link to something in this app.
  if (/^\S+$/.test(one)) {
    try {
      const u = new URL(one)
      const [, route, id] = u.pathname.split('/')
      if (u.origin === origin && ROUTES[route] && id) return { kind: 'link', target: { kind: ROUTES[route], id: decodeURIComponent(id) } }
    } catch { /* not a URL */ }
  }

  // Cells from a spreadsheet: every line has the same number of tabs.
  const lines = t.split('\n')
  const tabs = lines.map((l) => l.split('\t').length - 1)
  if (tabs[0] > 0 && tabs.every((n) => n === tabs[0])) return { kind: 'table', rows: lines.map((l) => l.split('\t').map((c) => c.trim())) }

  // An editor tells us it's code (VS Code puts the language on the clipboard).
  if (editorLanguage && editorLanguage !== 'plaintext' && editorLanguage !== 'markdown') return { kind: 'code', code: t, lang: editorLanguage }

  // LaTeX, with or without display delimiters.
  const fenced = one.match(/^\$\$([\s\S]+)\$\$$/) ?? one.match(/^\\\[([\s\S]+)\\\]$/)
  if (fenced) return { kind: 'latex', tex: fenced[1].trim() }
  const words = one.split(/\s+/).filter((w) => /^[a-zA-Z]{4,}$/.test(w)).length
  if (LATEX.test(one) && words <= 2) return { kind: 'latex', tex: one }

  // Code without an editor's help: several lines that mostly look like code.
  if (lines.length >= 2) {
    const codey = lines.filter((l) => /^\s{2,}\S|[;{}]\s*$|^\s*(def|class|function|const|let|var|import|return|if|for|while|#include|public|private)\b/.test(l)).length
    if (codey / lines.length >= 0.5) return { kind: 'code', code: t }
  }
  return null
}
