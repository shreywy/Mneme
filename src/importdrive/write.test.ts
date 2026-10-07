// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../data/db'
import { blocksFor } from '../data/sheets'
import { kidsOf } from '../data/subpages'
import * as sheets from '../data/sheets'
import { buildTree } from './tree'
import { importDrive } from './write'

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

const enc = new TextEncoder()
const file = (path: string, text: string) => ({ path, size: text.length, read: async () => enc.encode(text) })
const broken = (path: string) => ({ path, size: 10, read: async (): Promise<Uint8Array> => { throw new Error('Damaged') } })
const titles = async (id: string) => (await kidsOf(id)).map((s) => s.title)

describe('writing a Drive folder as pages', () => {
  it('folders become pages with a box of their contents, in order; files become pages', async () => {
    const t = buildTree([file('CPS721/Week 2/b.txt', 'two'), file('CPS721/Week 1/Ch 1.md', '# Logic\n\nFacts.'), file('CPS721/Week 1/Ch 2.txt', 'Rules'), file('CPS721/Syllabus.txt', 'Read me')], 'x')
    const steps: string[] = []
    const r = await importDrive(t, { folderId: 'fall' }, { onStep: (s) => steps.push(`${s.done}/${s.total}`) })
    expect(r).toMatchObject({ pages: 7, failed: [] })
    const top = (await db.sheets.get(r.top!))!
    expect(top).toMatchObject({ title: 'CPS721', folderId: 'fall' })
    expect(await titles(top.id)).toEqual(['Week 1', 'Week 2', 'Syllabus'])
    const w1 = (await kidsOf(top.id))[0]
    expect(await titles(w1.id)).toEqual(['Ch 1', 'Ch 2'])
    expect((await blocksFor(top.id)).filter((b) => b.kind === 'box').map((b) => b.data.label)).toEqual([''])
    const ch1 = (await kidsOf(w1.id))[0]
    const main = (await blocksFor(ch1.id)).find((b) => b.role === 'main')!
    expect(JSON.stringify(main.data.doc)).toContain('"text":"Logic"')
    expect(steps.at(-1)).toBe('7/7')
  })

  it('a file that fails is listed and the rest still come in; unticked and skipped ones are left out', async () => {
    const t = buildTree([broken('C/bad.pdf'), file('C/good.txt', 'ok'), file('C/pic.png', ''), file('C/W/x.txt', 'x')], 'x')
    const r = await importDrive(t, { folderId: null }, { off: new Set(['/C/W']) })
    expect(r.failed).toEqual([{ name: 'bad', why: 'Damaged' }])
    expect(await titles(r.top!)).toEqual(['good'])
  })

  it('into a page: a new "Imported" box on it holds the folder', async () => {
    const host = await sheets.createSheet()
    const r = await importDrive(buildTree([file('C/a.txt', 'a')], 'x'), { pageId: host })
    expect((await db.sheets.get(r.top!))!.parentId).toBe(host)
    expect((await blocksFor(host)).find((b) => b.kind === 'box')!.data.label).toBe('Imported')
  })

  it('a long document continues in text blocks under the main column', async () => {
    const long = Array.from({ length: 400 }, (_, i) => `Paragraph ${i} ${'words '.repeat(100)}`).join('\n\n')
    const r = await importDrive(buildTree([file('C/long.txt', long)], 'x'), { folderId: null })
    const page = (await kidsOf(r.top!))[0]
    const texts = (await blocksFor(page.id)).filter((b) => b.kind === 'text').sort((a, b) => a.y - b.y)
    expect(texts.length).toBeGreaterThan(1)
    for (const b of texts) expect(JSON.stringify(b.data.doc).length).toBeLessThan(200_000)
    for (let i = 1; i < texts.length; i++) expect(texts[i].y).toBeGreaterThan(texts[i - 1].y + (texts[i - 1].role === 'main' ? 0 : texts[i - 1].h))
  })
})
