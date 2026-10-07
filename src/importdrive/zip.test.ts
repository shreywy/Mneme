import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { LIMITS, ZipError, listZip, readEntry } from './zip'
import { makeZip } from './zip.testutil'

const text = async (blob: Blob, path: string) => {
  const e = (await listZip(blob)).find((x) => x.path === path)!
  return new TextDecoder().decode(await readEntry(blob, e))
}

describe('reading a zip', () => {
  it('reads stored and deflated files, and leaves folders out', async () => {
    const z = makeZip([{ name: 'CPS721/', data: '', store: true }, { name: 'CPS721/notes.txt', data: 'plain', store: true }, { name: 'CPS721/Week 1/ch1.md', data: '# Logic\n'.repeat(50) }])
    expect((await listZip(z)).map((e) => e.path)).toEqual(['CPS721/notes.txt', 'CPS721/Week 1/ch1.md'])
    expect(await text(z, 'CPS721/notes.txt')).toBe('plain')
    expect(await text(z, 'CPS721/Week 1/ch1.md')).toBe('# Logic\n'.repeat(50))
  })

  it('reads zip64 records', async () => {
    const z = makeZip([{ name: 'a.txt', data: 'one' }, { name: 'b.txt', data: 'two', store: true }], true)
    expect((await listZip(z)).map((e) => [e.path, e.size])).toEqual([['a.txt', 3], ['b.txt', 3]])
    expect(await text(z, 'b.txt')).toBe('two')
  })

  it('stops a file that unpacks to more than it says', async () => {
    const z = makeZip([{ name: 'bomb.txt', data: new Uint8Array(5_000_000), claim: 100 }])
    const [e] = await listZip(z)
    await expect(readEntry(z, e)).rejects.toThrow(ZipError)
  })

  it('refuses too many files, or too much in total, before reading any', async () => {
    const many = makeZip(Array.from({ length: 5 }, (_, i) => ({ name: `${i}.txt`, data: 'x' })))
    await expect(listZip(many, { ...LIMITS, entries: 4 })).rejects.toThrow(/more than 4 files/)
    await expect(listZip(many, { ...LIMITS, total: 3 })).rejects.toThrow(/unpacks to more than/)
  })

  it('refuses a cut-short file and something that isn’t a zip', async () => {
    const z = makeZip([{ name: 'a.txt', data: 'hello there' }])
    await expect(listZip(z.slice(0, z.size - 30))).rejects.toThrow(ZipError)
    await expect(listZip(new Blob(['not a zip at all']))).rejects.toThrow(/isn’t a zip/)
    const [e] = await listZip(z)
    await expect(readEntry(z, { ...e, csize: e.csize + 9999 })).rejects.toThrow(ZipError)
  })

  it('random bytes either list as entries or fail with a ZipError, never anything else', async () => {
    const good = new Uint8Array(await makeZip([{ name: 'a.txt', data: 'hello' }, { name: 'b.txt', data: 'x'.repeat(300) }]).arrayBuffer())
    await fc.assert(fc.asyncProperty(fc.array(fc.tuple(fc.nat(good.length - 1), fc.integer({ min: 0, max: 255 })), { maxLength: 8 }), fc.uint8Array({ maxLength: 64 }), async (flips, junk) => {
      const b = good.slice()
      for (const [i, v] of flips) b[i] = v
      for (const bytes of [b, junk]) {
        const blob = new Blob([bytes as BlobPart])
        try {
          for (const e of await listZip(blob)) await readEntry(blob, e).catch((err) => { if (!(err instanceof ZipError)) throw err })
        } catch (err) { if (!(err instanceof ZipError)) throw err }
      }
    }), { numRuns: 300 })
  })
})
