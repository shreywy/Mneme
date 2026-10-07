// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { textExtensions } from './extensions'

const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See ' }, { type: 'pageLink', attrs: { id: 'p1', title: 'Ch 3 <b>' } }] }] }

describe('a link to a page', () => {
  it('copies as its title (text) and as a link Mneme reads back (HTML)', () => {
    const ed = new Editor({ extensions: textExtensions(false), content: doc })
    expect(ed.getText()).toBe('See Ch 3 <b>')
    const html = ed.getHTML()
    expect(html).not.toContain('href')
    ed.commands.setContent(html)
    expect(ed.getJSON()).toEqual(doc)
    ed.destroy()
  })
})
