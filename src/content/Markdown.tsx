import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

// Deck text is untrusted (it comes from an LLM or another user). Raw HTML is dropped (skipHtml),
// there is no rehype-raw, KaTeX runs with trust off, and links/images are unwrapped to plain text.
const DISALLOWED = ['img', 'a', 'iframe', 'script', 'style', 'object', 'embed', 'form', 'input', 'button']

export const Markdown = memo(function Markdown({ children, inline = false, className = '' }: { children: string; inline?: boolean; className?: string }) {
  const Tag = inline ? 'span' : 'div'
  return (
    <Tag className={`md ${inline ? 'md-inline' : ''} ${className}`}>
      <ReactMarkdown
        skipHtml
        // Single $ is money ("$2,000 and $500"), never math. Math uses $$…$$, inline or on its own line.
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
        rehypePlugins={[[rehypeKatex, { trust: false, strict: 'ignore', throwOnError: false }]]}
        disallowedElements={DISALLOWED}
        unwrapDisallowed
      >
        {children}
      </ReactMarkdown>
    </Tag>
  )
})
