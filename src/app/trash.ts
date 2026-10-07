import { restorePage, trashPage, TRASH_DAYS, type TrashKind } from '../data/trash'
import { toast, toastAction } from '../ui/toasts'
import { db } from '../data/db'
import { setSheetArchived } from '../data/sheets'
import { subtree } from '../sheets/tree'
import { chooseAction } from '../ui/confirm'

const NOUN: Record<TrashKind, string> = { deck: 'Deck', note: 'Notes', sheet: 'Page' }

/** How many live pages sit below a page. */
async function under(id: string) {
  return subtree(id, (await db.sheets.toArray()).filter((s) => !s.archived && !s.deletedAt)).length
}
const subPages = (n: number) => `${n} sub-page${n === 1 ? '' : 's'}`

/** Deletes a deck, notes page or page into Recently deleted, with Undo on the toast. A page with sub-pages asks first. Returns false if cancelled. */
export async function deleteWithUndo(kind: TrashKind, id: string): Promise<boolean> {
  let withKids = true
  const n = kind === 'sheet' ? await under(id) : 0
  if (n) {
    const c = await chooseAction({ title: 'Delete its sub-pages too?', body: `This page has ${subPages(n)}. Ones you keep move up to where this page was.`, choices: [{ value: 'keep', label: 'Keep them' }, { value: 'all', label: `Delete all ${n + 1} pages`, danger: true }] })
    if (!c) return false
    withKids = c === 'all'
  }
  await trashPage(kind, id, withKids)
  toastAction(`${NOUN[kind]} deleted`, { label: 'Undo', run: () => { void restorePage(kind, id) } }, 'trash')
  return true
}

/** Archives a page; with sub-pages, asks whether they go too. Returns false if cancelled. */
export async function archiveSheet(id: string): Promise<boolean> {
  let withKids = true
  const n = await under(id)
  if (n) {
    const c = await chooseAction({ title: 'Archive its sub-pages too?', body: `This page has ${subPages(n)}. Ones you keep move up to where this page was.`, choices: [{ value: 'keep', label: 'Keep them' }, { value: 'all', label: `Archive all ${n + 1} pages` }] })
    if (!c) return false
    withKids = c === 'all'
  }
  await setSheetArchived(id, true, withKids)
  toast('Page archived', 'Find it under Archive in the sidebar', 'archive')
  return true
}

export const TRASH_NOTE = `Deleted things wait in Archive → Recently deleted for ${TRASH_DAYS} days.`
