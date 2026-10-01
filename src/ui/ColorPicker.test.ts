import { describe, expect, it } from 'vitest'
import { hexToHsv, hsvToHex } from './ColorPicker'

describe('colour conversion', () => {
  it('round-trips hex through HSV', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#313338', '#a7be8a', '#e58b74']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex)
    }
  })
  it('reads hue, saturation and brightness', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 })
    const blue = hexToHsv('#0000ff')
    expect(blue.h).toBeCloseTo(240)
    expect(hexToHsv('#808080').s).toBe(0)
  })
})
