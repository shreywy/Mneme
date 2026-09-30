import { useEffect, useState } from 'react'
import { create } from 'zustand'

type Toast = { id: number; title: string; sub?: string; icon?: string; leaving?: boolean }
type ToastStore = { items: Toast[]; push: (t: Omit<Toast, 'id'>) => void; remove: (id: number) => void; leave: (id: number) => void }

let seq = 0
export const useToasts = create<ToastStore>((set) => ({
  items: [],
  push: (t) => set((s) => ({ items: [...s.items.slice(-3), { ...t, id: ++seq }] })),
  leave: (id) => set((s) => ({ items: s.items.map((x) => (x.id === id ? { ...x, leaving: true } : x)) })),
  remove: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}))

export const toast = (title: string, sub?: string, icon = 'check') => useToasts.getState().push({ title, sub, icon })

function ToastItem({ t }: { t: Toast }) {
  const { leave, remove } = useToasts()
  const [, force] = useState(0)
  useEffect(() => {
    const a = setTimeout(() => { leave(t.id); force(1) }, 3200)
    return () => clearTimeout(a)
  }, [t.id, leave])
  return (
    <div className={`toast ${t.leaving ? 'bye' : ''}`} onAnimationEnd={() => t.leaving && remove(t.id)} role="status">
      <span className="medal"><svg className="i" style={{ width: 20, height: 20 }}><use href={`#i-${t.icon ?? 'check'}`} /></svg></span>
      <div><b>{t.title}</b>{t.sub && <span>{t.sub}</span>}</div>
    </div>
  )
}

export function Toasts() {
  const items = useToasts((s) => s.items)
  return <div className="toasts">{items.map((t) => <ToastItem key={t.id} t={t} />)}</div>
}
