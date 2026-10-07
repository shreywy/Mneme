// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { docxNodes, htmlNodes, markdownNodes, pdfNodes, splitNodes, textNodes, type PdfRun } from './convert'
import { makeZip } from './zip.testutil'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const R = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"'
async function docx(body: string): Promise<Uint8Array> {
  const z = makeZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', data: `<Relationships ${R}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: 'word/_rels/document.xml.rels', data: `<Relationships ${R}><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'word/styles.xml', data: `<w:styles ${W}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>` },
    { name: 'word/document.xml', data: `<w:document ${W}><w:body>${body}</w:body></w:document>` },
  ])
  return new Uint8Array(await z.arrayBuffer())
}
const json = (x: unknown) => JSON.stringify(x)

describe('converting Drive files', () => {
  it('Word keeps headings, bold and underline, and its text stays text', async () => {
    const { content } = await docx('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Logic</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve"> under</w:t></w:r><w:r><w:t xml:space="preserve"> &lt;script&gt;alert(1)&lt;/script&gt;</w:t></w:r></w:p>').then(docxNodes)
    expect(content[0]).toMatchObject({ type: 'heading', attrs: { level: 1 }, content: [{ text: 'Logic' }] })
    expect(json(content[1])).toContain('"marks":[{"type":"bold"}]')
    expect(json(content[1])).toContain('"type":"underline"')
    expect(json(content[1])).toContain('<script>alert(1)</script>') // as text, which is fine
  })

  it('only what a page can hold survives HTML: no script, handlers, odd links or outside pictures', async () => {
    const nodes = await htmlNodes('<p onclick="x()">Hi <a href="javascript:alert(1)">bad</a> <a href="https://ok.example/">ok</a></p><script>alert(1)</script><img src="https://evil.example/x.png" onerror="alert(1)"><iframe src="https://evil.example"></iframe>')
    const s = json(nodes)
    for (const bad of ['onclick', 'onerror', 'javascript:', 'evil.example', 'alert(1)']) expect(s).not.toContain(bad)
    expect(s).toContain('https://ok.example/')
  })

  it('Markdown goes through the same schema, raw HTML in it escaped', async () => {
    const nodes = await markdownNodes('# Week 1\n\n- **one**\n- two\n\n<img src=x onerror=alert(1)>\n\n| a | b |\n|---|---|\n| 1 | 2 |')
    expect(nodes.map((n) => n.type)).toEqual(['heading', 'bulletList', 'paragraph', 'table'])
    expect(json(nodes)).not.toContain('"type":"image"')
  })

  it('plain text: paragraphs at blank lines, single line breaks kept', () => {
    expect(textNodes('a\nb\r\n\r\n\nc  \n')).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'c' }] },
    ])
  })

  it('PDF: lines into paragraphs, bigger type into headings, page numbers and hyphens gone', () => {
    const run = (str: string, y: number, size = 11, x = 72): PdfRun => ({ str, x, y, w: str.length * size * 0.5, size })
    const page1 = [
      run('Prolog basics', 700, 20), run('Facts and rules', 660, 14),
      run('A fact states some-', 630), run('thing is ', 616), run('true.', 616, 11, 120), // same line, two runs
      run('A rule has a head', 580), run('and a body.', 566),
      run('3', 40),
    ]
    const page2 = [run('Queries ask whether a goal follows.', 700)]
    const out = pdfNodes([page1, page2])
    expect(out.map((n) => [n.type, n.attrs?.level ?? null, n.content?.[0]?.text])).toEqual([
      ['heading', 2, 'Prolog basics'],
      ['heading', 3, 'Facts and rules'],
      ['paragraph', null, 'A fact states something is true.'],
      ['paragraph', null, 'A rule has a head and a body.'],
      ['paragraph', null, 'Queries ask whether a goal follows.'],
    ])
  })

  it('splits long documents at top-level nodes, every part under the limit', () => {
    const nodes = Array.from({ length: 50 }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `${i} ${'x'.repeat(1000)}` }] }))
    const parts = splitNodes(nodes, 10_000)
    expect(parts.length).toBeGreaterThan(4)
    expect(parts.flat()).toEqual(nodes)
    for (const p of parts) expect(JSON.stringify(p).length).toBeLessThan(10_000)
  })
})
