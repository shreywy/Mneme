import { useEffect, useMemo } from 'react'
import { Link, NavLink, useParams } from 'react-router'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ForgettingCurve } from './ForgettingCurve'
import { SiteLayout } from './SiteLayout'
import gettingStarted from './docs/getting-started.md?raw'
import decks from './docs/decks.md?raw'
import studying from './docs/studying.md?raw'
import notes from './docs/notes.md?raw'
import pages from './docs/pages.md?raw'
import sync from './docs/sync.md?raw'
import privacy from './docs/privacy.md?raw'
import shortcuts from './docs/shortcuts.md?raw'
import architecture from './docs/architecture.md?raw'

export const TOPICS = [
  { id: 'getting-started', label: 'Getting started', md: gettingStarted },
  { id: 'decks', label: 'Making a deck', md: decks },
  { id: 'studying', label: 'Studying', md: studying },
  { id: 'notes', label: 'Notes pages', md: notes },
  { id: 'pages', label: 'Pages', md: pages },
  { id: 'sync', label: 'Accounts, sync and sharing', md: sync },
  { id: 'privacy', label: 'Privacy and security', md: privacy },
  { id: 'shortcuts', label: 'Keyboard shortcuts', md: shortcuts },
  { id: 'architecture', label: 'How it’s built', md: architecture },
]

const CURVE = '<forgetting-curve></forgetting-curve>'

/** Our own text, so links work (inside the site they stay in the app; outside they open a new tab). */
function Doc({ md }: { md: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
      a: ({ href = '', children }) => (href.startsWith('/')
        ? <Link to={href}>{children}</Link>
        : <a href={href} target="_blank" rel="noreferrer">{children}</a>),
    }}>{md}</ReactMarkdown>
  )
}

/** Docs: one topic at a time, with the list of topics beside it and next/previous at the bottom. */
export function DocsPage() {
  const { topic = 'getting-started' } = useParams()
  const i = Math.max(0, TOPICS.findIndex((t) => t.id === topic))
  const t = TOPICS[i]
  const parts = useMemo(() => t.md.split(CURVE), [t])
  useEffect(() => {
    document.title = `${t.label} · Mneme docs`
    window.scrollTo(0, 0)
    return () => { document.title = 'Mneme' }
  }, [t])
  return (
    <SiteLayout wide>
      <div className="docs">
        <nav className="docs-nav" aria-label="Docs">
          <span className="kicker">Docs</span>
          {TOPICS.map((x) => <NavLink key={x.id} to={`/docs/${x.id}`} className={x.id === t.id ? 'active' : ''}>{x.label}</NavLink>)}
        </nav>
        <article className="docs-body">
          {parts.map((p, k) => <div key={k}>{k > 0 && <ForgettingCurve />}<Doc md={p} /></div>)}
          <div className="docs-pager">
            {i > 0 ? <Link to={`/docs/${TOPICS[i - 1].id}`}><span>Previous</span>{TOPICS[i - 1].label}</Link> : <span />}
            {i < TOPICS.length - 1 && <Link to={`/docs/${TOPICS[i + 1].id}`} className="next"><span>Next</span>{TOPICS[i + 1].label}</Link>}
          </div>
        </article>
      </div>
    </SiteLayout>
  )
}
