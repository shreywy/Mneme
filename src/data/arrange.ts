import { db } from './db'

type Ref = { kind: 'deck' | 'note'; id: string }

/**
 * Drop a page somewhere in the sidebar: it moves to the target folder and unit (`unit: null` = no unit),
 * and `order` (the group's pages, top to bottom, including it) becomes the group's hand-made order.
 */
export async function placePage(page: Ref, to: { folderId: string | null; unit: string | null }, order: Ref[]) {
  await db.transaction('rw', db.decks, db.notes, async () => {
    for (const [rank, r] of order.entries()) {
      const isPage = r.kind === page.kind && r.id === page.id
      if (r.kind === 'deck') {
        const d = await db.decks.get(r.id)
        if (!d) continue
        const { unit: _u, ...rest } = d
        await db.decks.put(isPage ? { ...rest, folderId: to.folderId, ...(to.unit ? { unit: to.unit } : {}), rank } : { ...d, rank })
      } else {
        const n = await db.notes.get(r.id)
        if (!n) continue
        const { unit: _u, ...rest } = n
        await db.notes.put(isPage ? { ...rest, folderId: to.folderId, ...(to.unit ? { unit: to.unit } : {}), rank } : { ...n, rank })
      }
    }
  })
}
