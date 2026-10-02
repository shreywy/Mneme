import { useState } from 'react'
import { create } from 'zustand'
import { Sheet } from './controls'

type Ask = { title: string; body?: string; confirm: string; danger?: boolean; resolve: (ok: boolean) => void }
const useConfirm = create<{ ask: Ask | null; set: (a: Ask | null) => void }>((set) => ({ ask: null, set: (ask) => set({ ask }) }))
type AskName = { title: string; value: string; confirm: string; resolve: (name: string | null) => void }
const useAskName = create<{ ask: AskName | null }>(() => ({ ask: null }))

/** A one-field "name this" dialog as a promise: resolves to the trimmed name, or null if cancelled or left blank. */
export function askName(o: { title: string; value?: string; confirm?: string }): Promise<string | null> {
  return new Promise((resolve) => useAskName.setState({ ask: { title: o.title, value: o.value ?? '', confirm: o.confirm ?? 'Save', resolve } }))
}

function AskNameHost() {
  const ask = useAskName((s) => s.ask)
  return ask ? <AskNameSheet key={ask.title + ask.value} ask={ask} /> : null
}
function AskNameSheet({ ask }: { ask: AskName }) {
  const [val, setVal] = useState(ask.value)
  const done = (ok: boolean) => { useAskName.setState({ ask: null }); ask.resolve(ok && val.trim() ? val.trim() : null) }
  return (
    <Sheet onClose={() => done(false)} label={ask.title} width={440}>
      <h2 style={{ fontSize: 22, paddingRight: 30 }}>{ask.title}</h2>
      <form onSubmit={(e) => { e.preventDefault(); done(true) }}>
        <input className="input" autoFocus onFocus={(e) => e.target.select()} value={val} onChange={(e) => setVal(e.target.value)} style={{ marginTop: 14 }} />
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => done(false)}>Cancel</button>
          <button className="btn primary" disabled={!val.trim()}>{ask.confirm}</button>
        </div>
      </form>
    </Sheet>
  )
}

/** "Are you sure?" as a promise: `if (await confirmAction({...})) doIt()`. */
export function confirmAction(o: { title: string; body?: string; confirm: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => useConfirm.getState().set({ ...o, resolve }))
}

export function ConfirmHost() {
  const { ask, set } = useConfirm()
  if (!ask) return <AskNameHost />
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
