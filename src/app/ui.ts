import { create } from 'zustand'

type Dialog = null | 'import' | 'prompt' | 'drive'
type UI = {
  dialog: Dialog
  /** The page a Drive import goes into, when it was started from that page's menu. */
  drivePage: string | null
  focus: boolean
  peek: boolean
  drawer: boolean
  setDrawer: (v: boolean) => void
  open: (d: Dialog) => void
  close: () => void
  setFocus: (v: boolean) => void
  setPeek: (v: boolean) => void
  /** The last page visited outside Settings and Account, for their Back button. */
  lastPage: string
}

export const useUI = create<UI>((set) => ({
  dialog: null,
  drivePage: null,
  focus: false,
  peek: false,
  drawer: false,
  setDrawer: (drawer) => set({ drawer }),
  open: (dialog) => set({ dialog, drivePage: null }),
  close: () => set({ dialog: null }),
  setFocus: (focus) => set({ focus }),
  setPeek: (peek) => set({ peek }),
  lastPage: '/',
}))

/** True when a key event came from a text field, so global shortcuts should ignore it. */
export const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

/**
 * Where a study screen goes back to: the notes page it was opened from (`?from=/notes/<id>`), else the deck.
 * Only notes-page paths are accepted, so a crafted link can't send people somewhere else.
 */
export function studyBack(sp: URLSearchParams, deckId: string): string {
  const from = sp.get('from')
  if (from && /^\/notes\/[A-Za-z0-9-]+$/.test(from)) return from
  const rest = new URLSearchParams(sp); rest.delete('from')
  const qs = rest.toString()
  return `/deck/${deckId}${qs ? '?' + qs : ''}`
}
