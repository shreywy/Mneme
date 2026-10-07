import type { JSONContent } from '@tiptap/core'
import { askJson } from './gemini'
import type { Img } from './chat'

// Handwriting to text, maths to LaTeX: Gemini reads a picture of the ink, Mneme writes it as a text
// block (paragraphs, with maths as equations or inline maths).

export type Line = { math?: boolean; text: string }

/** One paragraph, with $…$ inside it as inline maths. */
function paragraph(text: string): JSONContent {
  const content: JSONContent[] = []
  text.split(/(\$[^$\n]+\$)/).forEach((bit) => {
    if (!bit) return
    const tex = /^\$([^$\n]+)\$$/.exec(bit)
    content.push(tex ? { type: 'inlineMath', attrs: { latex: tex[1].trim() } } : { type: 'text', text: bit })
  })
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
}

export function linesToDoc(lines: Line[]): JSONContent {
  const content = lines
    .filter((l) => typeof l?.text === 'string' && l.text.trim())
    .map((l) => (l.math ? { type: 'equation', attrs: { latex: l.text.trim().replace(/^\$+|\$+$/g, '') } } : paragraph(l.text.trim())))
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

export async function transcribe(key: string, img: Img): Promise<Line[]> {
  const r = await askJson<{ lines?: Line[] }>(key, {
    system: 'You read handwriting. Transcribe the picture exactly, line by line, keeping the writer’s words; don’t solve or add anything. A line that is mostly maths is {"math": true, "text": "<LaTeX without $>"}; a line of words is {"text": "..."} with any maths inside it written as $LaTeX$. Ignore crossed-out bits. Reply as JSON: {"lines": [...]}. If nothing is legible, {"lines": []}.',
    contents: [{ role: 'user', parts: [{ text: 'Transcribe this.' }, { inlineData: img }] }],
  })
  return Array.isArray(r.lines) ? r.lines.slice(0, 200) : []
}
