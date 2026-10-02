import { describe, expect, it } from 'vitest'
import { fitWithin, imageFiles, publicDoc } from './image'

describe('images', () => {
  it('shrinks a big picture to 2000 px on its longest side, keeping its shape', () => {
    expect(fitWithin(4000, 3000)).toEqual({ w: 2000, h: 1500 })
    expect(fitWithin(1200, 5000)).toEqual({ w: 480, h: 2000 })
    expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 })
  })

  it('takes pictures from a paste or drop, but not SVG (which can carry scripts) or other files', () => {
    const f = (type: string) => ({ type, name: 'x' }) as File
    expect(imageFiles([f('image/png'), f('image/svg+xml'), f('application/pdf'), f('image/jpeg')]).map((x) => x.type)).toEqual(['image/png', 'image/jpeg'])
  })

  it('takes the Imgur delete code (and pictures only on this device) out of a page that leaves the account', () => {
    const doc = {
      type: 'doc', content: [
        { type: 'image', attrs: { local: 'a', src: 'https://i.imgur.com/x.webp', hash: 'SECRET', alt: 'graph' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
        { type: 'image', attrs: { local: 'b', src: null, hash: null } },
      ],
    }
    const out = publicDoc(doc) as typeof doc
    expect(JSON.stringify(out)).not.toContain('SECRET')
    expect(out.content[0].attrs).toMatchObject({ src: 'https://i.imgur.com/x.webp', alt: 'graph', hash: null, local: null })
    expect(out.content).toHaveLength(2)
    expect(JSON.stringify(doc)).toContain('SECRET') // the original is left alone
  })
})
