import { describe, expect, it } from 'vitest'
import { buildTree, cleanName, countTree, zipTitle, type DriveNode } from './tree'

const item = (path: string, size = 10) => ({ path, size, read: async () => new Uint8Array() })
const show = (n: DriveNode): unknown => (n.folder ? { [n.name]: n.children.map(show) } : n.skip ? `${n.name} (skipped)` : `${n.name}:${n.type}`)

describe('a Drive folder as pages', () => {
  it('keeps the tree, folders first then by name, and drops Mac shadows and dotfiles', () => {
    const t = buildTree([
      item('CPS721/Week 10/ch9.pdf'), item('CPS721/Week 2/Ch 3 Prolog.docx'), item('CPS721/Overview.md'),
      item('CPS721/Week 2/marks.xlsx'), item('CPS721/.DS_Store'), item('__MACOSX/CPS721/._Overview.md'), item('CPS721/Week 2/notes.txt'),
    ], 'zip')
    expect(show(t)).toEqual({ CPS721: [{ 'Week 2': ['Ch 3 Prolog:docx', 'marks (skipped)', 'notes:txt'] }, { 'Week 10': ['ch9:pdf'] }, 'Overview:md'] })
  })

  it('merges split zips by path, keeping the first copy of a file', () => {
    const t = buildTree([item('CPS721/a.txt', 1), item('CPS721/W1/b.md'), item('CPS721/a.txt', 2), item('CPS721/W1/c.pdf')], 'x')
    expect(show(t)).toEqual({ CPS721: [{ W1: ['b:md', 'c:pdf'] }, 'a:txt'] })
    expect(t.children.find((c) => c.name === 'a')!.size).toBe(1)
  })

  it('uses the zip name for the root when there is no single top folder', () => {
    expect(show(buildTree([item('a.txt'), item('b.docx')], 'CPS721'))).toEqual({ CPS721: ['a:txt', 'b:docx'] })
  })

  it('says why a file is skipped, and skips ones over 50 MB', () => {
    const t = buildTree([item('F/old.doc'), item('F/huge.pdf', 60 * 2 ** 20), item('F/thing.exe')], 'x')
    expect(t.children.map((c) => c.skip)).toEqual(['Too big (over 50 MB)', expect.stringMatching(/save it as \.docx/),'Mneme can’t read this kind of file'])
  })

  it('cleans names and Drive’s download suffix', () => {
    expect(cleanName(`  Ch\u0000 1\u001b ${'x'.repeat(300)}`)).toHaveLength(200)
    expect(cleanName('a\u0007b')).toBe('ab')
    expect(zipTitle('CPS721-20261007T151213Z-001.zip')).toBe('CPS721')
    expect(zipTitle('My notes.zip')).toBe('My notes')
  })

  it('counts pages from folders and files, leaving out unticked ones', () => {
    const t = buildTree([item('C/W1/a.txt'), item('C/W1/b.png'), item('C/W2/c.md')], 'x')
    expect(countTree(t)).toMatchObject({ folders: 3, files: 2, skipped: 1 })
    expect(countTree(t, new Set(['/C/W2']))).toMatchObject({ folders: 2, files: 1, skipped: 1 })
  })
})
