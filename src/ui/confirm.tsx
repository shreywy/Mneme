import { create } from 'zustand'
import { Sheet } from './controls'

type Ask = { title: string; body?: string; confirm: string; danger?: boolean; resolve: (ok: boolean) => void }
const useConfirm = create<{ ask: Ask | null; set: (a: Ask | null) => void }>((set) => ({ ask: null, set: (ask) => set({ ask }) }))

/** "Are you sure?" as a promise: `if (await confirmAction({...})) doIt()`. */
export function confirmAction(o: { title: string; body?: string; confirm: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => useConfirm.getState().set({ ...o, resolve }))
}

export function ConfirmHost() {
  const { ask, set } = useConfirm()
  if (!ask) return null
  const done = (ok: boolean) => { set(null); ask.resolve(ok) }
  return (
    <Sheet onClose={() => done(false)} label={ask.title} width={440}>
      <h2 style={{ fontSize: 22, paddingRight: 30 }}>{ask.title}</h2>
      {ask.body && <p className="lede" style={{ fontSize: 14 }}>{ask.body}</p>}
      <div className="actions">
        <button className="btn ghost" onClick={() => done(false)}>Cancel</button>
        <button className={`btn ${ask.danger ? 'danger-solid' : 'primary'}`} autoFocus onClick={() => done(true)}>{ask.confirm}</button>
      </div>
    </Sheet>
  )
}
