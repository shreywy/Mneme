// Everything you can put on a page beyond plain typing. The Insert panel shows the ones with a letter as
// tiles; the slash menu and search use the whole list.

export type InsertId =
  | 'equation' | 'plot' | 'table' | 'working' | 'code' | 'checklist' | 'axes' | 'link' | 'quote'
  | 'heading1' | 'heading2' | 'heading3' | 'bullet' | 'numbered' | 'divider' | 'inlineMath' | 'image' | 'box'

export type InsertItem = { id: InsertId; label: string; letter?: string; group: 'Text' | 'Maths' | 'Pictures' | 'Other'; hint?: string; words: string[] }

export const INSERTS: InsertItem[] = [
  { id: 'heading1', label: 'Heading 1', group: 'Text', hint: '#', words: ['h1', 'title', 'heading'] },
  { id: 'heading2', label: 'Heading 2', group: 'Text', hint: '##', words: ['h2', 'heading', 'subheading'] },
  { id: 'heading3', label: 'Heading 3', group: 'Text', hint: '###', words: ['h3', 'heading'] },
  { id: 'bullet', label: 'Bulleted list', group: 'Text', hint: '-', words: ['list', 'bullets', 'ul'] },
  { id: 'numbered', label: 'Numbered list', group: 'Text', hint: '1.', words: ['list', 'ordered', 'ol', 'numbers'] },
  { id: 'checklist', label: 'Checklist', letter: 'K', group: 'Text', hint: '[]', words: ['list', 'todo', 'tasks', 'checkbox'] },
  { id: 'quote', label: 'Quote', letter: 'Q', group: 'Text', hint: '>', words: ['blockquote', 'citation'] },
  { id: 'divider', label: 'Divider', group: 'Text', hint: '---', words: ['rule', 'line', 'separator', 'hr'] },
  { id: 'equation', label: 'Equation', letter: 'E', group: 'Maths', hint: '$$', words: ['maths', 'math', 'latex', 'formula'] },
  { id: 'inlineMath', label: 'Maths in a sentence', group: 'Maths', hint: '$…$', words: ['inline', 'maths', 'math', 'latex'] },
  { id: 'working', label: 'Step-by-step working', letter: 'W', group: 'Maths', words: ['derivation', 'steps', 'solve', 'proof'] },
  { id: 'plot', label: 'Plot a formula', letter: 'P', group: 'Pictures', hint: 'y = …', words: ['graph', 'chart', 'function'] },
  { id: 'image', label: 'Picture', letter: 'M', group: 'Pictures', words: ['image', 'photo', 'screenshot', 'upload', 'img'] },
  { id: 'axes', label: 'Axes', letter: 'A', group: 'Pictures', words: ['graph', 'blank', 'sketch', 'free-body'] },
  { id: 'table', label: 'Table', letter: 'T', group: 'Other', hint: '|a|b|', words: ['grid', 'rows', 'columns', 'spreadsheet'] },
  { id: 'code', label: 'Code', letter: 'C', group: 'Other', hint: '```', words: ['snippet', 'program', 'syntax'] },
  { id: 'box', label: 'Box of pages', letter: 'B', group: 'Other', words: ['sub-pages', 'subpage', 'pages', 'section', 'week', 'container', 'folder'] },
  { id: 'link', label: 'Link a deck or page', letter: 'L', group: 'Other', hint: '[[', words: ['card', 'deck', 'notes', 'page'] },
]

export const byLetter = (key: string) => INSERTS.find((i) => i.letter === key.toUpperCase())
export const insertById = (id: InsertId) => INSERTS.find((i) => i.id === id)!

/** Best matches first: the label starts with it, then a word starts with it, then it appears anywhere. */
export function searchInserts(query: string): InsertItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return INSERTS
  const score = (i: InsertItem) => {
    const label = i.label.toLowerCase()
    if (label.startsWith(q)) return 0
    if (i.words.some((w) => w.startsWith(q))) return 1
    if (label.split(/\s+/).some((w) => w.startsWith(q))) return 2
    if (label.includes(q) || i.words.some((w) => w.includes(q))) return 3
    return -1
  }
  return INSERTS.map((i) => ({ i, s: score(i) })).filter((x) => x.s >= 0).sort((a, b) => a.s - b.s).map((x) => x.i)
}
