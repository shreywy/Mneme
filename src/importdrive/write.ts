import type { JSONContent } from '@tiptap/core'
import { addBlock, blocksFor, createSheet, saveBlockDoc } from '../data/sheets'
import { addBox, createSubPage } from '../data/subpages'
import { addImage, uploadImage } from '../data/images'
import { MAIN_BLOCK } from '../sheets/types'
import { convert, splitNodes, type Converted } from './convert'
import type { DriveNode } from './tree'

// Writes a Drive tree as pages, one at a time as each file is converted. A folder is a page with an empty
// overview and one box holding what was in it. A file that won't convert is listed and skipped.

export type Dest = { folderId: string | null } | { pageId: string }
export type Step = { done: number; total: number; name: string }
export type Result = { top: string | null; pages: number; failed: { name: string; why: string }[] }
type Opts = { off?: Set<string>; pictures?: boolean; onStep?: (s: Step) => void }

const heading = (t: string): JSONContent => ({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: t }] })

// ponytail: a guess at how many lines some text takes in the main column (about 70 characters a line), for
// stacking a long document's parts. Overshooting leaves a gap; the main column itself is measured on open.
const linesOf = (nodes: JSONContent[]) => Math.ceil(nodes.reduce((n, x) => n + 1 + Math.ceil(JSON.stringify(x).replace(/"[a-zA-Z]+":/g, '').length / 70), 0) * 1.2)

/** Pictures stored on this device (and uploaded in the background); their nodes point at the stored copy. */
async function storePictures(sheetId: string, c: Converted, keep: boolean): Promise<JSONContent[]> {
  const ids = new Map<string, { local: string; ratio: number }>()
  if (keep) for (const p of c.pics) {
    try {
      const img = await addImage(sheetId, new Blob([p.data as BlobPart], { type: p.type }))
      void uploadImage(img.id)
      ids.set(p.key, { local: img.id, ratio: img.h / img.w })
    } catch { /* a format the browser can't draw (Word's .emf, say): left out */ }
  }
  const walk = (n: JSONContent): JSONContent | null => {
    if (n.type === 'image') { const got = ids.get(String(n.attrs?.local)); return got ? { ...n, attrs: { ...n.attrs, ...got } } : null }
    return n.content ? { ...n, content: n.content.map(walk).filter((x): x is JSONContent => !!x) } : n
  }
  return c.content.map(walk).filter((x): x is JSONContent => !!x)
}

/** The page's main column gets the title and the content; a long document continues in text blocks below it. */
async function fill(sheetId: string, title: string, content: JSONContent[]) {
  const [first, ...rest] = splitNodes([heading(title), ...content])
  const main = (await blocksFor(sheetId)).find((b) => b.role === 'main')!
  await saveBlockDoc(main.id, { type: 'doc', content: first })
  let y = MAIN_BLOCK.y + linesOf(first) + 1
  for (const [i, part] of rest.entries()) {
    const h = linesOf(part)
    await addBlock({ sheetId, x: MAIN_BLOCK.x, y, w: MAIN_BLOCK.w, h, kind: 'text', data: { doc: { type: 'doc', content: part } }, z: i + 1 })
    y += h + 1
  }
}

export async function importDrive(root: DriveNode, dest: Dest, { off = new Set(), pictures = true, onStep }: Opts = {}): Promise<Result> {
  const wanted = (n: DriveNode) => !off.has(n.key) && !n.skip
  const count = (n: DriveNode): number => (wanted(n) ? 1 + (n.folder ? n.children.reduce((s, c) => s + count(c), 0) : 0) : 0)
  const total = count(root)
  const res: Result = { top: null, pages: 0, failed: [] }
  let done = 0

  const make = async (under: { id: string; box: string } | null) =>
    under ? createSubPage(under.id, under.box) : createSheet({ folderId: 'folderId' in dest ? dest.folderId : null })

  const walk = async (n: DriveNode, under: { id: string; box: string } | null): Promise<string | null> => {
    if (!wanted(n)) return null
    onStep?.({ done, total, name: n.name })
    let id: string | null = null
    if (n.folder) {
      id = await make(under)
      await fill(id, n.name, [{ type: 'paragraph' }])
      const box = (await addBox(id, '')).id
      done++; res.pages++
      for (const c of n.children) await walk(c, { id, box })
    } else {
      try {
        const c = await convert(n.type!, await n.item!.read())
        id = await make(under)
        await fill(id, n.name, await storePictures(id, c, pictures))
        res.pages++
      } catch (e) {
        res.failed.push({ name: n.name, why: e instanceof Error && e.message ? e.message : 'It couldn’t be read' })
      }
      done++
    }
    return id
  }

  const top = 'pageId' in dest ? { id: dest.pageId, box: (await addBox(dest.pageId, 'Imported')).id } : null
  res.top = await walk(root, top)
  onStep?.({ done, total, name: '' })
  return res
}
