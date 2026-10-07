// A small zip reader for Google Drive downloads: the central directory (zip64 too), stored and deflated
// entries, inflated by the browser's own DecompressionStream. A zip is someone's file, possibly a bomb, so
// sizes are capped up front and again while inflating, and anything malformed is a ZipError.

export class ZipError extends Error {}

export const LIMITS = { entries: 2000, file: 50 * 2 ** 20, total: 300 * 2 ** 20 }

export type ZipEntry = {
  path: string
  /** Uncompressed size as the zip states it (checked again while reading). */
  size: number
  csize: number
  method: number
  offset: number
  encrypted: boolean
}

const MAX_32 = 0xffffffff

async function bytes(blob: Blob, from: number, to: number): Promise<DataView> {
  if (from < 0 || to > blob.size || from > to) throw new ZipError('This zip file is cut short')
  return new DataView(await blob.slice(from, to).arrayBuffer())
}

const u64 = (v: DataView, at: number) => Number(v.getBigUint64(at, true))

/** Every file in the zip (folders left out). Throws ZipError for a file that isn't a zip, or one over the limits. */
export async function listZip(blob: Blob, limits = LIMITS): Promise<ZipEntry[]> {
  try {
    // The end record sits in the last 22 bytes plus up to 64 KB of comment.
    const tailFrom = Math.max(0, blob.size - 22 - 0xffff)
    const tail = await bytes(blob, tailFrom, blob.size)
    let end = -1
    for (let i = tail.byteLength - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { end = i; break }
    if (end < 0) throw new ZipError('This isn’t a zip file')
    let count = tail.getUint16(end + 10, true)
    let cdSize = tail.getUint32(end + 12, true)
    let cdAt = tail.getUint32(end + 16, true)
    if (count === 0xffff || cdSize === MAX_32 || cdAt === MAX_32) {
      const locAt = tailFrom + end - 20
      const loc = await bytes(blob, locAt, locAt + 20)
      if (loc.getUint32(0, true) !== 0x07064b50) throw new ZipError('This zip file is damaged')
      const recAt = u64(loc, 8)
      const rec = await bytes(blob, recAt, recAt + 56)
      if (rec.getUint32(0, true) !== 0x06064b50) throw new ZipError('This zip file is damaged')
      count = u64(rec, 32); cdSize = u64(rec, 40); cdAt = u64(rec, 48)
    }
    if (count > limits.entries) throw new ZipError(`This zip has more than ${limits.entries.toLocaleString()} files. Import a smaller folder.`)
    const cd = await bytes(blob, cdAt, cdAt + cdSize)
    const utf8 = new TextDecoder()
    const out: ZipEntry[] = []
    let p = 0
    for (let n = 0; n < count; n++) {
      if (p + 46 > cd.byteLength || cd.getUint32(p, true) !== 0x02014b50) throw new ZipError('This zip file is damaged')
      const flags = cd.getUint16(p + 8, true)
      const method = cd.getUint16(p + 10, true)
      let csize = cd.getUint32(p + 20, true)
      let size = cd.getUint32(p + 24, true)
      const nameLen = cd.getUint16(p + 28, true), extraLen = cd.getUint16(p + 30, true), commentLen = cd.getUint16(p + 32, true)
      let offset = cd.getUint32(p + 42, true)
      const nameAt = p + 46
      if (nameAt + nameLen + extraLen > cd.byteLength) throw new ZipError('This zip file is damaged')
      const path = utf8.decode(new Uint8Array(cd.buffer, cd.byteOffset + nameAt, nameLen))
      // Zip64 extra field: the 64-bit sizes and offset, for whichever of them didn't fit.
      for (let x = nameAt + nameLen; x + 4 <= nameAt + nameLen + extraLen;) {
        const id = cd.getUint16(x, true), len = cd.getUint16(x + 2, true)
        if (id === 0x0001) {
          let f = x + 4
          if (size === MAX_32) { size = u64(cd, f); f += 8 }
          if (csize === MAX_32) { csize = u64(cd, f); f += 8 }
          if (offset === MAX_32) { offset = u64(cd, f) }
        }
        x += 4 + len
      }
      p = nameAt + nameLen + extraLen + commentLen
      if (!path.endsWith('/')) out.push({ path, size, csize, method, offset, encrypted: !!(flags & 1) })
    }
    const total = out.reduce((s, e) => s + Math.min(e.size, limits.file), 0)
    if (total > limits.total) throw new ZipError(`This zip unpacks to more than ${Math.round(limits.total / 2 ** 20)} MB. Import a smaller folder.`)
    return out
  } catch (e) {
    throw e instanceof ZipError ? e : new ZipError('This zip file is damaged')
  }
}

/** One file's bytes. Stops, with a ZipError, as soon as it inflates past its stated size or the per-file limit. */
export async function readEntry(blob: Blob, e: ZipEntry, max = LIMITS.file): Promise<Uint8Array> {
  if (e.encrypted) throw new ZipError('It’s password-protected')
  if (e.size > max) throw new ZipError('It’s too big (over 50 MB)')
  try {
    const head = await bytes(blob, e.offset, e.offset + 30)
    if (head.getUint32(0, true) !== 0x04034b50) throw new ZipError('This zip file is damaged')
    const start = e.offset + 30 + head.getUint16(26, true) + head.getUint16(28, true)
    const raw = blob.slice(start, start + e.csize)
    if (start + e.csize > blob.size) throw new ZipError('This zip file is cut short')
    if (e.method === 0) {
      if (e.csize !== e.size) throw new ZipError('This zip file is damaged')
      return new Uint8Array(await raw.arrayBuffer())
    }
    if (e.method !== 8) throw new ZipError('It’s packed in a way Mneme can’t open')
    const packed = new Uint8Array(await raw.arrayBuffer())
    const source = new ReadableStream<BufferSource>({ start(c) { c.enqueue(packed); c.close() } })
    const reader = source.pipeThrough(new DecompressionStream('deflate-raw')).getReader()
    const parts: Uint8Array[] = []
    let got = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      got += value.byteLength
      // A zip bomb says it's small and keeps going: stop at the size it claimed.
      if (got > e.size) { void reader.cancel(); throw new ZipError('It unpacks to more than the zip says') }
      parts.push(value)
    }
    const out = new Uint8Array(got)
    let at = 0
    for (const part of parts) { out.set(part, at); at += part.byteLength }
    return out
  } catch (err) {
    throw err instanceof ZipError ? err : new ZipError('This zip file is damaged')
  }
}
