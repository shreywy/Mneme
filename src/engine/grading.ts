/** Lowercase, strip accents, punctuation and a leading article, collapse spaces. */
export function normalizeAnswer(s: string): string {
  let t = s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  const m = t.match(/^(the|an|a) (.+)$/)
  if (m && m[2].length >= 3) t = m[2]
  return t
}

/** Optimal string alignment distance (Levenshtein plus adjacent swaps). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[a.length][b.length]
}

export type TypedGrade = { correct: boolean; close?: string }

/** Correct if it matches any accepted answer exactly (after normalizing) or within a small typo budget. */
export function gradeTyped(input: string, answers: string[]): TypedGrade {
  const x = normalizeAnswer(input)
  if (!x) return { correct: false }
  let best: { ans: string; dist: number } | null = null
  for (const ans of answers) {
    const y = normalizeAnswer(ans)
    if (!y) continue
    if (x === y) return { correct: true }
    const dist = editDistance(x, y)
    if (!best || dist < best.dist) best = { ans, dist }
  }
  if (best) {
    const len = normalizeAnswer(best.ans).length
    const budget = len <= 4 ? 0 : Math.max(1, Math.floor(len * 0.15))
    if (best.dist <= budget) return { correct: true, close: best.ans }
  }
  return { correct: false }
}

/** Parse "$2,000", "2k", "(450)", "−12", "15%". Returns null when it isn't a number. */
export function parseNumber(input: string): number | null {
  let s = input.trim().replace(/[−–]/g, '-').replace(/[$€£¥,\s]/g, '').replace(/%$/, '')
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  let mult = 1
  const suffix = s.match(/^(-?[\d.]+)([km])$/i)
  if (suffix) { s = suffix[1]; mult = suffix[2].toLowerCase() === 'k' ? 1e3 : 1e6 }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null
  const n = Number(s) * mult
  return neg ? -n : n
}

export function gradeNumeric(input: string, answer: number, tolerance = 0): boolean {
  const n = parseNumber(input)
  return n !== null && Math.abs(n - answer) <= tolerance + 1e-9
}

export type ParsedCloze = { parts: (string | number)[]; blanks: string[][] }

/** "A = {{L}} + {{E|Equity}}" → parts ['A = ', 0, ' + ', 1], blanks [['L'], ['E','Equity']] */
export function parseCloze(prompt: string): ParsedCloze {
  const parts: (string | number)[] = []
  const blanks: string[][] = []
  let last = 0
  for (const m of prompt.matchAll(/\{\{([^{}]+)\}\}/g)) {
    if (m.index! > last) parts.push(prompt.slice(last, m.index))
    parts.push(blanks.length)
    blanks.push(m[1].split('|').map((s) => s.trim()).filter(Boolean))
    last = m.index! + m[0].length
  }
  if (last < prompt.length) parts.push(prompt.slice(last))
  return { parts, blanks }
}

export function gradeCloze(inputs: string[], c: ParsedCloze): boolean[] {
  return c.blanks.map((answers, i) => gradeTyped(inputs[i] ?? '', answers).correct)
}

export function gradeSelection(selected: number[], correct: number[]): boolean {
  if (selected.length !== correct.length) return false
  const s = new Set(selected)
  return correct.every((i) => s.has(i))
}
