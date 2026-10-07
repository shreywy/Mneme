import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import { Highlight } from '@tiptap/extension-highlight'
import { TableKit } from '@tiptap/extension-table'
import { Code, Equation, EnterShortcuts, InlineMath, LinkCard, PageLink, PlotNode, Working } from './nodes'
import { PageLinkSuggest, SlashCommand } from './slash'
import { PageBreaks, type BreakConfig } from './pagebreaks'
import { ImageNode } from './image'
import '@fontsource/lora/400.css'
import '@fontsource/lora/600.css'
import '@fontsource/nunito/400.css'
import '@fontsource/nunito/700.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import '@fontsource/patrick-hand/400.css'
import '@fontsource/caveat/400.css'
import '@fontsource/caveat/700.css'
import '@fontsource/jetbrains-mono/400.css'

/** Everything a text block on a page understands. The main block's first line is its title. */
export function textExtensions(main: boolean, pages?: () => BreakConfig) {
  return [
    ...(main && pages ? [PageBreaks.configure({ get: pages })] : []),
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } }),
    TaskList, TaskItem.configure({ nested: true }),
    TextStyle, FontFamily, FontSize, Color, Highlight.configure({ multicolor: true }),
    TableKit.configure({ table: { resizable: false } }),
    Code, Equation, InlineMath, Working, PlotNode, LinkCard, PageLink, ImageNode, EnterShortcuts, SlashCommand, PageLinkSuggest,
    Placeholder.configure({
      includeChildren: false,
      placeholder: ({ node, pos }) => (node.type.name === 'heading' ? (main && pos === 0 ? 'Title' : 'Heading') : main ? 'Start writing, or press / to insert' : 'Type, or press / to insert'),
    }),
  ]
}
