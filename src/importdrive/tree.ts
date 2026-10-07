// A Drive folder as a tree of would-be pages. Folders become pages that hold their contents; Word, PDF,
// text and Markdown files become pages; everything else is listed with why it's skipped.

export type FileType = 'docx' | 'pdf' | 'txt' | 'md'

/** One file from a zip or a picked folder. */
export type Item = { path: string; size: number; read: () => Promise<Uint8Array> }

export type DriveNode = {
  key: string
  name: string
  folder: boolean
  type?: FileType
  skip?: string
  size: number
  item?: Item
  children: DriveNode[]
}

const TYPES: Record<string, FileType> = { docx: 'docx', pdf: 'pdf', txt: 'txt', md: 'md', markdown: 'md' }
const WHY: [RegExp, string][] = [
  [/^doc$/, 'Old Word format. Open it in Word or Google Docs and save it as .docx'],
  [/^(xlsx?|csv|ods|gsheet)$/, 'Spreadsheets aren’t imported'],
  [/^(pptx?|odp|gslides)$/, 'Slides aren’t imported'],
  [/^(png|jpe?g|gif|webp|heic|svg|bmp|tiff?)$/, 'Pictures on their own aren’t imported'],
  [/^gdoc$/, 'A Google Docs shortcut, not the document. Download the folder again from drive.google.com'],
]

/** A file or folder name as a title: no control characters, trimmed, at most 200 characters. */
export const cleanName = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200)

const ext = (name: string) => (/\.([^.]+)$/.exec(name)?.[1] ?? '').toLowerCase()
const byName = (a: DriveNode, b: DriveNode) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name, undefined, { numeric: true })

/** The name Drive gives a download ("CPS721-20261007T151213Z-001.zip") without the date, part and extension. */
export const zipTitle = (file: string) => cleanName(file.replace(/\.zip$/i, '').replace(/-\d{8}T\d{6}Z(-\d+)?$/, '')) || 'Imported'

/**
 * The tree for some files. Several zips of one Drive folder merge by path. If everything sits in one top
 * folder, that's the root; otherwise the root is a folder called `name`.
 */
export function buildTree(items: Item[], name: string, maxFile = 50 * 2 ** 20): DriveNode {
  const root: DriveNode = { key: '', name, folder: true, size: 0, children: [] }
  for (const it of items) {
    const parts = it.path.split(/[\\/]/).filter((p) => p && p !== '.' && p !== '..')
    // Mac zips carry __MACOSX/ shadows; dotfiles (.DS_Store and the like) are never notes.
    if (!parts.length || parts.some((p) => p === '__MACOSX' || p.startsWith('.'))) continue
    let at = root
    for (const [i, raw] of parts.entries()) {
      const label = cleanName(raw) || 'Untitled'
      const key = `${at.key}/${label}`
      const last = i === parts.length - 1
      let next = at.children.find((c) => c.key === key)
      if (next && last) break // the same file in two zips: keep the first
      if (!next) {
        next = { key, name: label, folder: !last, size: 0, children: [] }
        if (last) {
          const e = ext(label)
          next.name = cleanName(label.replace(/\.[^.]+$/, '')) || label
          next.size = it.size
          next.item = it
          next.type = TYPES[e]
          if (!next.type) next.skip = WHY.find(([re]) => re.test(e))?.[1] ?? 'Mneme can’t read this kind of file'
          else if (it.size > maxFile) next.skip = 'Too big (over 50 MB)'
        }
        at.children.push(next)
      }
      at = next
    }
  }
  const sort = (n: DriveNode) => { n.children.sort(byName); n.children.forEach(sort) }
  sort(root)
  const only = root.children[0]
  return root.children.length === 1 && only.folder ? only : root
}

/** What importing would make: pages from folders, pages from files, and files skipped. */
export function countTree(n: DriveNode, off: Set<string> = new Set()): { folders: number; files: number; skipped: number; bytes: number } {
  const c = { folders: 0, files: 0, skipped: 0, bytes: 0 }
  const walk = (x: DriveNode) => {
    if (off.has(x.key)) return
    if (x.folder) { c.folders++; x.children.forEach(walk) } else if (x.skip) c.skipped++
    else { c.files++; c.bytes += estimate(x) }
  }
  walk(n)
  return c
}

// ponytail: rough guess at what a file adds to your space, from its size alone. Word files are mostly their
// pictures; a PDF's text is a small part of the file. Good enough to warn before an import that won't fit.
const estimate = (x: DriveNode) => (x.type === 'pdf' ? x.size / 5 : x.type === 'docx' ? x.size : x.size * 1.5) + 2000
