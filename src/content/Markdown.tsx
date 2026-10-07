import { memo, useContext, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { KeyTermsCtx, rehypeKeyTerms } from './keyterms'

// Deck text is untrusted (it comes from an LLM or another user). Raw HTML is dropped (skipHtml),
// there is no rehype-raw, KaTeX runs with trust off, and links/images are unwrapped to plain text.
const DISALLOWED = ['img', 'a', 'iframe', 'script', 'style', 'object', 'embed', 'form', 'input', 'button']

/** `dollarMath`: single $…$ is maths too. For Gemini's answers, which write maths that way. */
export const Markdown = memo(function Markdown({ children, inline = false, className = '', dollarMath = false }: { children: string; inline?: boolean; className?: string; dollarMath?: boolean }) {
  const Tag = inline ? 'span' : 'div'
  const terms = useContext(KeyTermsCtx)
  // Key terms are marked only where a notes page provides them.
  const rehype = useMemo(() => {
    const base: NonNullable<Parameters<typeof ReactMarkdown>[0]['rehypePlugins']> = [[rehypeKatex, { trust: false, strict: 'ignore', throwOnError: false }]]
    return terms.length ? [...base, rehypeKeyTerms(terms.map((t) => t.term))] : base
  }, [terms])
  return (
    <Tag className={`md ${inline ? 'md-inline' : ''} ${className}`}>
      <ReactMarkdown
        skipHtml
        // Single $ is money ("$2,000 and $500"), never math. Math uses $$…$$, inline or on its own line.
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: dollarMath }]]}
        rehypePlugins={rehype}
        disallowedElements={DISALLOWED}
        unwrapDisallowed
      >
        {children}
      </ReactMarkdown>
    </Tag>
  )
})
