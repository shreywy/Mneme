import { deflateRawSync } from 'node:zlib'

type F = { name: string; data: string | Uint8Array; store?: boolean; claim?: number }
const enc = new TextEncoder()

/** A zip built by hand. `zip64` writes the end records and sizes the 64-bit way; `claim` lies about a size. */
export function makeZip(files: F[], zip64 = false): Blob {
  const parts: Uint8Array[] = [], cd: Uint8Array[] = []
  let at = 0
  for (const f of files) {
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data
    const body = f.store ? data : new Uint8Array(deflateRawSync(data))
    const name = enc.encode(f.name)
    const size = f.claim ?? data.byteLength
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(8, f.store ? 0 : 8, true)
    local.setUint32(18, body.byteLength, true); local.setUint32(22, size, true); local.setUint16(26, name.byteLength, true)
    const extra = zip64 ? new DataView(new ArrayBuffer(28)) : null
    if (extra) { extra.setUint16(0, 1, true); extra.setUint16(2, 24, true); extra.setBigUint64(4, BigInt(size), true); extra.setBigUint64(12, BigInt(body.byteLength), true); extra.setBigUint64(20, BigInt(at), true) }
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(8, 0x800, true); c.setUint16(10, f.store ? 0 : 8, true)
    c.setUint32(20, zip64 ? 0xffffffff : body.byteLength, true); c.setUint32(24, zip64 ? 0xffffffff : size, true)
    c.setUint16(28, name.byteLength, true); c.setUint16(30, extra ? 28 : 0, true); c.setUint32(42, zip64 ? 0xffffffff : at, true)
    parts.push(new Uint8Array(local.buffer), name, body)
    cd.push(new Uint8Array(c.buffer), name, ...(extra ? [new Uint8Array(extra.buffer)] : []))
    at += 30 + name.byteLength + body.byteLength
  }
  const cdSize = cd.reduce((s, p) => s + p.byteLength, 0)
  const tail: Uint8Array[] = []
  if (zip64) {
    const rec = new DataView(new ArrayBuffer(56))
    rec.setUint32(0, 0x06064b50, true); rec.setBigUint64(32, BigInt(files.length), true); rec.setBigUint64(40, BigInt(cdSize), true); rec.setBigUint64(48, BigInt(at), true)
    const loc = new DataView(new ArrayBuffer(20))
    loc.setUint32(0, 0x07064b50, true); loc.setBigUint64(8, BigInt(at + cdSize), true)
    tail.push(new Uint8Array(rec.buffer), new Uint8Array(loc.buffer))
  }
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(10, zip64 ? 0xffff : files.length, true); end.setUint32(12, zip64 ? 0xffffffff : cdSize, true); end.setUint32(16, zip64 ? 0xffffffff : at, true)
  return new Blob([...parts, ...cd, ...tail, new Uint8Array(end.buffer)] as BlobPart[])
}

