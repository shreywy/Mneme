// Pages under pages. A page's `parentId` names the page it sits under. Rows sync one by one, so the
// tree can arrive broken: a parent not here yet, or a loop when two devices moved pages at once.
// Such pages show at the top level until it's sorted out; nothing is hidden.

export type TreeRow = { id: string; parentId?: string }

/** Each page whose parent is in `rows`, mapped to that parent. Pages in a loop are left out (top level). */
export function parentsOf(rows: TreeRow[]): Map<string, string> {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const out = new Map<string, string>()
  for (const r of rows) {
    if (!r.parentId || !byId.has(r.parentId)) continue
    // Walk up. Coming back to this page means it's in a loop.
    const seen = new Set([r.id])
    let p: string | undefined = r.parentId
    while (p && byId.has(p) && !seen.has(p)) { seen.add(p); p = byId.get(p)!.parentId }
    if (p !== r.id) out.set(r.id, r.parentId)
  }
  return out
}

export function rootOf(id: string, parents: Map<string, string>): string {
  let x = id
  while (parents.has(x)) x = parents.get(x)!
  return x
}

/** The pages above `id`, nearest first. */
export function ancestors(id: string, parents: Map<string, string>): string[] {
  const out: string[] = []
  for (let x = parents.get(id); x; x = parents.get(x)) out.push(x)
  return out
}

/** Every page below `id`, by raw parentId (archived and deleted ones too, when they're in `rows`). */
export function subtree(id: string, rows: TreeRow[]): string[] {
  const kids = new Map<string, string[]>()
  for (const r of rows) if (r.parentId) kids.set(r.parentId, [...(kids.get(r.parentId) ?? []), r.id])
  const out: string[] = []
  const seen = new Set([id])
  const stack = [...(kids.get(id) ?? [])]
  while (stack.length) {
    const x = stack.pop()!
    if (seen.has(x)) continue
    seen.add(x)
    out.push(x)
    stack.push(...(kids.get(x) ?? []))
  }
  return out
}

/** True when putting `id` under `newParent` would make a loop. */
export const wouldCycle = (id: string, newParent: string, rows: TreeRow[]) => newParent === id || subtree(id, rows).includes(newParent)

/** Going from `from` up to `to`: the page just below `to` on that path, whose card on `to` to shrink into. */
export function cardFor(from: string, to: string, parents: Map<string, string>): string | null {
  const chain = [from, ...ancestors(from, parents)]
  const i = chain.indexOf(to)
  return i > 0 ? chain[i - 1] : null
}
