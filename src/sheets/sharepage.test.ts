import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../data/db'
import * as sheets from '../data/sheets'
import * as ink from '../data/ink'
import { pagePayload, parsePagePayload } from './sharepage'

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

const para = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

describe('sharing a page', () => {
  it('copies the page without ids, delete codes or (unless asked) the drawing', async () => {
    const id = await sheets.createSheet()
    const side = await sheets.addBlock({ sheetId: id, x: 30, y: 4, w: 8, h: 2, kind: 'text', data: { doc: { type: 'doc', content: [{ type: 'image', attrs: { local: 'L', src: 'https://i.imgur.com/a.webp', hash: 'DELETE-ME' } }] } }, z: 1 })
    await ink.addStroke({ sheetId: id, blockId: side.id, tool: 'pen', color: 'ink', size: 3, pts: [4, 4, 32] })
    await ink.addStroke({ sheetId: id, tool: 'highlighter', color: '#F2CF3D', size: 18, pts: [400, 40, 32, 80, 0, 0], shape: true })
    const sheet = (await sheets.getSheet(id))!
    const blocks = await sheets.blocksFor(id), strokes = await ink.inkFor(id)

    const plain = pagePayload(sheet, blocks, strokes, false)
    const text = JSON.stringify(plain)
    expect(text).not.toContain('DELETE-ME')
    expect(text).not.toContain(side.id)
    expect(plain.ink).toEqual([])
    expect(plain.blocks).toHaveLength(2)

    const drawn = pagePayload(sheet, blocks, strokes, true)
    expect(drawn.ink).toHaveLength(2)
    const onBlock = drawn.ink.find((s) => s.block !== null)!
    expect(drawn.blocks[onBlock.block!]).toMatchObject({ x: 30, y: 4 })
  })

  it('gives stored pictures their signed link, and never sends the path', async () => {
    const path = '0f8fad5b-d9cb-469f-a165-70867728950e/7c9e6679-7425-40de-944b-e07fc1f90ae7.webp'
    const link = `https://abcdefgh.supabase.co/storage/v1/object/sign/pictures/${path}?token=t`
    const id = await sheets.createSheet()
    await sheets.addBlock({ sheetId: id, x: 30, y: 4, w: 8, h: 2, kind: 'text', data: { doc: { type: 'doc', content: [{ type: 'image', attrs: { local: 'L', stored: path, src: null } }] } }, z: 1 })
    const p = pagePayload((await sheets.getSheet(id))!, await sheets.blocksFor(id), [], false, { [path]: link })
    const text = JSON.stringify(p)
    expect(text).toContain(link)
    expect(text).not.toContain(`"${path}"`)
  })

  it("drops picture links in someone else's page that point anywhere but Imgur or Mneme's own store", () => {
    const pic = (attrs: object) => ({ x: 3, y: 2, w: 24, h: 4, kind: 'text', data: { doc: { type: 'doc', content: [{ type: 'image', attrs }] } } })
    const p = parsePagePayload({ format: 'mneme.page', version: 1, title: 'T', paper: { lines: 'dots', spacing: 24, strength: 0.5, color: null, margin: false, paperColor: null }, ink: [],
      blocks: [pic({ src: 'https://tracker.example/pixel.png', stored: 'someone/else.webp', local: 'x', hash: 'h' }), pic({ src: 'https://i.imgur.com/ok.png' })] })!
    const attrs = (i: number) => (p.blocks[i].data.doc as { content: { attrs: Record<string, unknown> }[] }).content[0].attrs
    expect(attrs(0)).toMatchObject({ src: null, stored: null, local: null, hash: null })
    expect(attrs(1).src).toBe('https://i.imgur.com/ok.png')
  })

  it("keeps a bookmark's colour, but only as plain hex", async () => {
    const id = await sheets.createSheet()
    await sheets.addBlock({ sheetId: id, x: 40, y: 8, w: 1, h: 1, kind: 'bookmark', data: { doc: null, label: 'Exam', color: '#3D6FB6' }, z: 1 })
    const p = pagePayload((await sheets.getSheet(id))!, await sheets.blocksFor(id), [], false)
    expect(p.blocks.find((b) => b.kind === 'bookmark')?.data).toMatchObject({ label: 'Exam', color: '#3D6FB6' })
    const back = parsePagePayload({ ...p, blocks: [...p.blocks, { x: 1, y: 1, w: 1, h: 1, kind: 'bookmark', data: { doc: null, label: 'x', color: 'red;background:url(//x)' } }] })!
    expect(back.blocks.at(-1)?.data.color).toBeUndefined()
    expect(back.blocks.find((b) => b.data.label === 'Exam')?.data.color).toBe('#3D6FB6')
  })

  it('only opens payloads that look like a page', () => {
    expect(parsePagePayload({ format: 'mneme.page', version: 1, title: 'T', paper: {}, blocks: 'nope', ink: [] })).toBeNull()
    expect(parsePagePayload(null)).toBeNull()
    const ok = parsePagePayload({ format: 'mneme.page', version: 1, title: 'T', paper: { lines: 'dots', spacing: 24, strength: 0.5, color: null, margin: false, paperColor: null }, blocks: [{ x: 3, y: 2, w: 24, h: 1, kind: 'text', role: 'main', data: { doc: para('hi') } }], ink: [] })
    expect(ok?.blocks[0].role).toBe('main')
  })

  it('saving a shared page makes a fresh copy in the library, drawing and all', async () => {
    const id = await sheets.createSheet()
    const [main] = await sheets.blocksFor(id)
    await sheets.saveBlockDoc(main.id, para('Shared notes'))
    await ink.addStroke({ sheetId: id, blockId: main.id, tool: 'pen', color: '#2D6CDF', size: 3, pts: [4, 4, 32, 8, 0, 0] })
    const p = pagePayload((await sheets.getSheet(id))!, await sheets.blocksFor(id), await ink.inkFor(id), true)
    const copy = await sheets.importPage(p)
    expect(copy).not.toBe(id)
    const blocks = await sheets.blocksFor(copy)
    expect(blocks[0]).toMatchObject({ role: 'main', data: { doc: para('Shared notes') } })
    const strokes = await ink.inkFor(copy)
    expect(strokes).toHaveLength(1)
    expect(strokes[0].blockId).toBe(blocks[0].id)
    expect((await sheets.getSheet(copy))?.title).toBe('Untitled page')
  })
})

describe('links to pages in a shared page', () => {
  it('become their title as plain text: the other person has none of your pages', async () => {
    const id = await sheets.createSheet()
    const link = { type: 'pageLink', attrs: { id: 'secret-page-id', title: 'Ch 3' } }
    await sheets.addBlock({ sheetId: id, x: 30, y: 4, w: 8, h: 2, kind: 'text', data: { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See ' }, link] }] } }, z: 1 })
    const p = pagePayload((await sheets.getSheet(id))!, await sheets.blocksFor(id), [], false)
    const text = JSON.stringify(p)
    expect(text).not.toContain('secret-page-id')
    expect(text).not.toContain('pageLink')
    expect(text).toContain('{"type":"text","text":"Ch 3"}')
  })
})
