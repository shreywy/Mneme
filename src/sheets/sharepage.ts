import { z } from 'zod'
import { isSafePictureUrl, publicDoc } from './image'
import { readingOrder } from './order'
import type { Paper, SheetBlock, SheetRow, SheetStroke } from './types'

// A page as a share link carries it: no ids, no picture paths or delete codes, and the drawing only if the owner
// asked. Opening one treats it as someone else's data: everything is checked before it's shown.

const colour = z.string().regex(/^#[0-9a-f]{3,8}$/i)
const PaperSchema = z.object({
  lines: z.enum(['none', 'ruled', 'dots', 'squares']),
  spacing: z.union([z.literal(24), z.literal(28), z.literal(32)]),
  strength: z.number().min(0).max(1),
  // Colours end up in CSS, so only plain hex gets through (no url(), no gradients).
  color: colour.nullable(),
  margin: z.boolean(),
  paperColor: colour.nullable(),
  theme: z.enum(['app', 'light', 'dark']).optional(),
  font: z.string().max(40).optional(),
  layout: z.enum(['pageless', 'pages']).optional(),
  size: z.enum(['a4', 'letter']).optional(),
  pageNumbers: z.boolean().optional(),
})
const cell = z.number().int().min(-100_000).max(100_000)
const BlockSchema = z.object({
  x: cell, y: cell, w: z.number().int().min(1).max(400), h: z.number().int().min(1).max(20_000),
  kind: z.enum(['text', 'bookmark']),
  role: z.literal('main').optional(),
  data: z.object({ doc: z.unknown(), label: z.string().max(200).optional(), color: colour.optional().catch(undefined) }),
})
const StrokeSchema = z.object({
  block: z.number().int().min(0).nullable(),
  tool: z.enum(['pen', 'highlighter']),
  color: z.union([z.literal('ink'), colour]),
  size: z.number().min(0.25).max(80),
  pts: z.array(z.number().int()).max(60_000),
  shape: z.boolean().optional(),
  sim: z.boolean().optional(),
})
const PayloadSchema = z.object({
  format: z.literal('mneme.page'),
  version: z.literal(1),
  title: z.string().min(1).max(200),
  paper: PaperSchema,
  blocks: z.array(BlockSchema).max(2000),
  ink: z.array(StrokeSchema).max(5000),
})
export type PagePayload = z.infer<typeof PayloadSchema>

/** The shareable copy of a page. `signed` maps each stored picture's path to its signed link. */
export function pagePayload(sheet: SheetRow, blocks: SheetBlock[], strokes: SheetStroke[], withInk: boolean, signed: Record<string, string> = {}): PagePayload {
  const list = [...readingOrder(blocks.filter((b) => b.kind === 'text')), ...blocks.filter((b) => b.kind === 'bookmark')] // boxes arrive as text (boxesAsText)
  const index = new Map(list.map((b, i) => [b.id, i]))
  return {
    format: 'mneme.page', version: 1, title: sheet.title, paper: sheet.paper,
    blocks: list.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h, kind: b.kind as 'text' | 'bookmark', ...(b.role ? { role: b.role } : {}), data: { doc: publicDoc(b.data.doc, signed), ...(b.data.label ? { label: b.data.label } : {}), ...(b.data.color ? { color: b.data.color } : {}) } })),
    ink: withInk
      ? strokes.filter((s) => !s.blockId || index.has(s.blockId)).map((s) => ({
        block: s.blockId ? index.get(s.blockId)! : null, tool: s.tool, color: s.color, size: s.size, pts: s.pts,
        ...(s.shape ? { shape: true } : {}), ...(s.sim ? { sim: true } : {}),
      }))
      : [],
  }
}

type Node = { type?: string; attrs?: Record<string, unknown>; content?: Node[] }
const SUPABASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
/** Pictures in someone else's page only load from Imgur or Mneme's own signed links, so a shared page can't make your browser call anywhere else. */
function safeDoc(doc: unknown): unknown {
  const walk = (n: Node): Node => {
    if (n.type === 'image') {
      const src = isSafePictureUrl(n.attrs?.src, SUPABASE) ? n.attrs.src : null
      return { ...n, attrs: { ...n.attrs, src, local: null, hash: null, stored: null } }
    }
    return Array.isArray(n.content) ? { ...n, content: n.content.map(walk) } : n
  }
  return doc && typeof doc === 'object' ? walk(doc as Node) : null
}

/** A shared page, checked; null if it isn't one. */
export function parsePagePayload(x: unknown): PagePayload | null {
  const r = PayloadSchema.safeParse(x)
  if (!r.success) return null
  return { ...r.data, paper: r.data.paper as Paper, blocks: r.data.blocks.map((b) => ({ ...b, data: { ...b.data, doc: safeDoc(b.data.doc) } })) }
}
