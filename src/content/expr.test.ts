import { describe, expect, it } from 'vitest'
import { compileExpr } from './expr'

describe('compileExpr', () => {
  const at = (src: string, x: number) => compileExpr(src)(x)
  it('does arithmetic with the usual precedence', () => {
    expect(at('12*x', 2)).toBe(24)
    expect(at('24000 + 25x', 100)).toBe(26500)
    expect(at('2x+3', 1)).toBe(5)
    expect(at('3(x+1)', 2)).toBe(9)
    expect(at('x^2', 3)).toBe(9)
    expect(at('-x^2', 3)).toBe(-9)
    expect(at('2^3^2', 0)).toBe(512)
    expect(at('100 - 10*x', 4)).toBe(60)
    expect(at('x/4', 2)).toBe(0.5)
  })
  it('knows common functions and constants', () => {
    expect(at('sin(pi/2)', 0)).toBeCloseTo(1)
    expect(at('sqrt(x)', 16)).toBe(4)
    expect(at('ln(e)', 0)).toBeCloseTo(1)
    expect(at('abs(-x)', 3)).toBe(3)
    expect(at('2 pi', 0)).toBeCloseTo(2 * Math.PI)
  })
  it('rejects anything that is not maths', () => {
    for (const bad of ['alert(1)', 'x; fetch()', 'constructor', '(', 'x +', '1 2 ++', 'window', '']) expect(() => compileExpr(bad)).toThrow()
  })
})
