import { create } from 'zustand'

type Dialog = null | 'import' | 'prompt' | 'settings'
type UI = {
  dialog: Dialog
  focus: boolean
  peek: boolean
  open: (d: Dialog) => void
  close: () => void
  setFocus: (v: boolean) => void
  setPeek: (v: boolean) => void
}

export const useUI = create<UI>((set) => ({
  dialog: null,
  focus: false,
  peek: false,
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
  setFocus: (focus) => set({ focus }),
  setPeek: (peek) => set({ peek }),
}))

/** True when a key event came from a text field, so global shortcuts should ignore it. */
export const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}
