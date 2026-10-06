import { describe, expect, it } from 'vitest'
import { fitWithin, imageFiles, isPicturePath, isSafePictureUrl, picturePath, publicDoc, storedIn } from './image'

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

  const U = '0f8fad5b-d9cb-469f-a165-70867728950e', P = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
  const SB = 'https://abcdefgh.supabase.co'
  const signed = `${SB}/storage/v1/object/sign/pictures/${U}/${P}.webp?token=eyJhbGciOi.J9.x-y_z`

  it('stores a picture as <user>/<picture>.<ext>, and only for types the bucket takes', () => {
    expect(picturePath(U, P, 'image/webp')).toBe(`${U}/${P}.webp`)
    expect(picturePath(U, P, 'image/jpeg')).toBe(`${U}/${P}.jpg`)
    expect(picturePath(U, P, 'image/svg+xml')).toBeNull()
    expect(picturePath('../etc', P, 'image/png')).toBeNull()
    expect(isPicturePath(`${U}/${P}.png`)).toBe(true)
    expect(isPicturePath(`${U}/../${P}.png`)).toBe(false)
    expect(isPicturePath(`${U}/sub/${P}.png`)).toBe(false)
  })

  it("lets someone else's page load pictures only from Imgur or this Mneme's own signed links", () => {
    expect(isSafePictureUrl('https://i.imgur.com/abc.webp', SB)).toBe(true)
    expect(isSafePictureUrl(signed, SB)).toBe(true)
    expect(isSafePictureUrl(signed, 'https://other.supabase.co')).toBe(false)
    expect(isSafePictureUrl(signed.replace('/sign/', '/public/'), SB)).toBe(false)
    expect(isSafePictureUrl(signed.replace(`${P}.webp`, `${P}.svg`), SB)).toBe(false)
    expect(isSafePictureUrl(`${signed}&download=1`, SB)).toBe(false)
    expect(isSafePictureUrl(`${signed}?x=1`, SB)).toBe(false)
    expect(isSafePictureUrl('https://evil.example/x.png', SB)).toBe(false)
    expect(isSafePictureUrl('javascript:alert(1)', SB)).toBe(false)
    expect(isSafePictureUrl(signed, '')).toBe(false)
    expect(isSafePictureUrl(signed, 'https://evil.example')).toBe(false)
  })

  it('gives a stored picture its signed link in a shared copy, and leaves its path out', () => {
    const path = `${U}/${P}.webp`
    const doc = { type: 'doc', content: [{ type: 'image', attrs: { local: P, stored: path, src: null, hash: null } }, { type: 'image', attrs: { local: 'x', stored: `${U}/7c9e6679-7425-40de-944b-e07fc1f90ae8.webp`, src: null } }] }
    expect(storedIn(doc)).toEqual([path, `${U}/7c9e6679-7425-40de-944b-e07fc1f90ae8.webp`])
    const out = publicDoc(doc, { [path]: signed }) as typeof doc
    expect(out.content).toHaveLength(1) // the one that couldn't be signed is left out
    expect(out.content[0].attrs).toMatchObject({ src: signed, stored: null, local: null })
    expect(JSON.stringify(out)).not.toContain(`"${path}"`)
  })
})
