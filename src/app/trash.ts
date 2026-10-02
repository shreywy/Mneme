import { restorePage, trashPage, TRASH_DAYS, type TrashKind } from '../data/trash'
import { toastAction } from '../ui/toasts'

const NOUN: Record<TrashKind, string> = { deck: 'Deck', note: 'Notes', sheet: 'Page' }

/** Deletes a deck, notes page or page into Recently deleted, with Undo on the toast. */
export async function deleteWithUndo(kind: TrashKind, id: string) {
  await trashPage(kind, id)
  toastAction(`${NOUN[kind]} deleted`, { label: 'Undo', run: () => { void restorePage(kind, id) } }, 'trash')
}

export const TRASH_NOTE = `Deleted things wait in Archive → Recently deleted for ${TRASH_DAYS} days.`
