// A small, safe reader for plot formulas such as "24000 + 25x", "100 - 10*x" or "sin(x)/x".
// It turns the text into a function of x without eval: anything that isn't maths is an error.

const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, floor: Math.floor, ceil: Math.ceil, round: Math.round,
}
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E }

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

function lex(src: string): Tok[] {
  const out: Tok[] = []
  const s = src.replace(/\s+/g, ' ').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
  for (let i = 0; i < s.length;) {
    const c = s[i]
    if (c === ' ') { i++; continue }
    const num = /^\d+(\.\d+)?|^\.\d+/.exec(s.slice(i))
    if (num) { out.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue }
    const id = /^[a-z]+/i.exec(s.slice(i))
    if (id) { out.push({ t: 'id', v: id[0].toLowerCase() }); i += id[0].length; continue }
    if ('+-*/^()'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue }
    throw new Error(`Unexpected "${c}"`)
  }
  return out
}

type Fn = (x: number) => number

/** Compile a formula in x. Throws on anything it doesn't understand. */
export function compileExpr(src: string): Fn {
  if (!src.trim() || src.length > 200) throw new Error('Empty or too long')
  const toks = lex(src)
  let i = 0
  const peek = () => toks[i]
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v
  const eat = (v: string) => { if (!isOp(v)) throw new Error(`Expected "${v}"`); i++ }
  // Something that can start a factor: lets "2x" and "3(x+1)" mean multiplication.
  const startsFactor = () => { const p = peek(); return !!p && (p.t === 'num' || p.t === 'id' || (p.t === 'op' && p.v === '(')) }

  function expr(): Fn {
    let f = term()
    while (isOp('+') || isOp('-')) {
      const op = peek()!.v; i++
      const a = f, b = term()
      f = op === '+' ? (x) => a(x) + b(x) : (x) => a(x) - b(x)
    }
    return f
  }
  function term(): Fn {
    let f = unary()
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = peek()!.v; i++
        const a = f, b = unary()
        f = op === '*' ? (x) => a(x) * b(x) : (x) => a(x) / b(x)
      } else if (startsFactor()) {
        const a = f, b = power()
        f = (x) => a(x) * b(x)
      } else return f
    }
  }
  function unary(): Fn {
    if (isOp('-')) { i++; const a = unary(); return (x) => -a(x) }
    if (isOp('+')) { i++; return unary() }
    return power()
  }
  function power(): Fn {
    const base = primary()
    if (isOp('^')) { i++; const e = unary(); return (x) => base(x) ** e(x) } // right-associative, binds tighter than unary minus on its left
    return base
  }
  function primary(): Fn {
    const p = peek()
    if (!p) throw new Error('Unexpected end')
    if (p.t === 'num') { i++; const v = p.v; return () => v }
    if (p.t === 'op' && p.v === '(') { i++; const f = expr(); eat(')'); return f }
    if (p.t === 'id') {
      i++
      if (p.v === 'x') return (x) => x
      if (Object.hasOwn(CONSTS, p.v)) { const v = CONSTS[p.v]; return () => v }
      if (Object.hasOwn(FUNCS, p.v)) { const fn = FUNCS[p.v]; eat('('); const a = expr(); eat(')'); return (x) => fn(a(x)) }
      throw new Error(`Unknown name "${p.v}"`)
    }
    throw new Error(`Unexpected "${p.v}"`)
  }
  const f = expr()
  if (i !== toks.length) throw new Error('Unexpected text at the end')
  return f
}
