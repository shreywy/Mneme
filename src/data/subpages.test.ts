import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import * as sheets from './sheets'
import * as sub from './subpages'
import { placePage } from './arrange'

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

const row = (id: string) => db.sheets.get(id)

describe('sub-pages', () => {
  it('ensureBox makes a "Pages" box below everything once, then reuses the last box', async () => {
    const cps = await sheets.createSheet({ folderId: 'fall' })
    const a = await sub.ensureBox(cps)
    const box = (await sheets.blocksFor(cps)).find((b) => b.id === a)!
    expect(box).toMatchObject({ kind: 'box', data: { label: 'Pages' } })
    expect(box.y).toBeGreaterThan(2) // under the main column
    expect(await sub.ensureBox(cps)).toBe(a)
  })

  it('a new sub-page sits in the box, after the ones already there, with no folder of its own', async () => {
    const cps = await sheets.createSheet({ folderId: 'fall' })
    const box = (await sub.addBox(cps, 'Week 1')).id
    const ch1 = await sub.createSubPage(cps, box)
    const ch2 = await sub.createSubPage(cps, box)
    expect(await row(ch2)).toMatchObject({ parentId: cps, box, folderId: null })
    expect((await row(ch2))!.rank!).toBeGreaterThan((await row(ch1))!.rank!)
    expect((await sub.kidsOf(cps)).map((s) => s.id)).toEqual([ch1, ch2])
  })

  it('moving into a box takes the order given, and clears a unit', async () => {
    const cps = await sheets.createSheet()
    const box = (await sub.addBox(cps, 'Week 1')).id
    const a = await sub.createSubPage(cps, box)
    const loose = await sheets.createSheet({ unit: 'Old unit' })
    expect(await sub.moveIntoBox(loose, cps, box, [loose, a])).toBe(true)
    expect(await row(loose)).toMatchObject({ parentId: cps, box, rank: 0, folderId: null })
    expect((await row(loose))!.unit).toBeUndefined()
    expect((await row(a))!.rank).toBe(1)
  })

  it('refuses a move under its own sub-page', async () => {
    const cps = await sheets.createSheet()
    const ch3 = await sub.createSubPage(cps, await sub.ensureBox(cps))
    expect(await sub.moveIntoBox(cps, ch3, await sub.ensureBox(ch3))).toBe(false)
    expect((await row(cps))!.parentId).toBeUndefined()
  })

  it("moving out a level goes into the parent's place; from the top it lands in the top page's folder", async () => {
    const cps = await sheets.createSheet({ folderId: 'fall' })
    const ch3 = await sub.createSubPage(cps, await sub.ensureBox(cps))
    const ps3 = await sub.createSubPage(ch3, await sub.ensureBox(ch3))
    await sub.moveOutALevel(ps3)
    expect(await row(ps3)).toMatchObject({ parentId: cps, box: (await row(ch3))!.box })
    await sub.moveOutALevel(ps3)
    const top = (await row(ps3))!
    expect(top.parentId).toBeUndefined()
    expect(top.box).toBeUndefined()
    expect(top.folderId).toBe('fall')
  })

  it("liftChildren moves sub-pages into their parent's place", async () => {
    const cps = await sheets.createSheet({ folderId: 'fall', unit: 'Y2' })
    const kid = await sub.createSubPage(cps, await sub.ensureBox(cps))
    await sub.liftChildren(cps)
    expect(await row(kid)).toMatchObject({ folderId: 'fall', unit: 'Y2' })
    expect((await row(kid))!.parentId).toBeUndefined()
  })

  it('deleting a box and keeping its pages moves them to another box, or a new one', async () => {
    const cps = await sheets.createSheet()
    const w1 = (await sub.addBox(cps, 'Week 1')).id
    const kid = await sub.createSubPage(cps, w1)
    await sub.deleteBox(w1, false)
    const now = (await row(kid))!
    expect(now.parentId).toBe(cps)
    expect(now.box).not.toBe(w1)
    expect((await sheets.blocksFor(cps)).some((b) => b.id === now.box && b.kind === 'box')).toBe(true)
  })

  it('deleting a box with its pages sends them to Recently deleted', async () => {
    const cps = await sheets.createSheet()
    const w1 = (await sub.addBox(cps, 'Week 1')).id
    const kid = await sub.createSubPage(cps, w1)
    await sub.deleteBox(w1, true)
    expect((await row(kid))!.deletedAt).toBeTypeOf('number')
    expect((await sheets.blocksFor(cps)).some((b) => b.id === w1)).toBe(false)
  })

  it('adoptOrphans moves sub-pages whose box is gone into a box, but only after a minute', async () => {
    const cps = await sheets.createSheet()
    const kid = await sub.createSubPage(cps, 'gone-box')
    expect(await sub.adoptOrphans(cps)).toBe(0) // fresh: the box may still be on its way
    expect(await sub.adoptOrphans(cps, Date.now() + 61_000)).toBe(1)
    const box = (await row(kid))!.box!
    expect((await sheets.blocksFor(cps)).some((b) => b.id === box && b.kind === 'box')).toBe(true)
  })

  it('placing a sub-page in a folder makes it top level', async () => {
    const cps = await sheets.createSheet()
    const kid = await sub.createSubPage(cps, await sub.ensureBox(cps))
    await placePage({ kind: 'sheet', id: kid }, { folderId: 'fall', unit: null }, [{ kind: 'sheet', id: kid }])
    const s = (await db.sheets.get(kid))!
    expect(s.parentId).toBeUndefined()
    expect(s.box).toBeUndefined()
    expect(s.folderId).toBe('fall')
  })
})
