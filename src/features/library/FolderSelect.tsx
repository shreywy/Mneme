import type { Folder } from '../../data/db'

/** Flatten the folder tree into indented options, skipping archived folders and (optionally) a subtree. */
export function folderOptions(folders: Folder[], exclude?: Set<string>): { id: string; label: string; depth: number }[] {
  const out: { id: string; label: string; depth: number }[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const f of folders.filter((x) => x.parentId === parent && !x.archived).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
      if (exclude?.has(f.id)) continue
      out.push({ id: f.id, label: f.name, depth })
      walk(f.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

export function FolderSelect({ folders, value, onChange, exclude, noneLabel = 'Not in a folder' }: {
  folders: Folder[]; value: string | null; onChange: (id: string | null) => void; exclude?: Set<string>; noneLabel?: string
}) {
  return (
    <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{noneLabel}</option>
      {folderOptions(folders, exclude).map((o) => <option key={o.id} value={o.id}>{' '.repeat(o.depth)}{o.depth ? '› ' : ''}{o.label}</option>)}
    </select>
  )
}
