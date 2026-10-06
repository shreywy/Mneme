import { useEffect, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import '../../styles/site.css'
import { Icon, Wordmark } from '../../ui/Icons'

export const GITHUB = 'https://github.com/shreywy/Mneme'

/** Fades things in as they scroll into view (instantly with Reduce motion). */
export function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.reveal:not(.in)')
    if (!('IntersectionObserver' in window) || document.documentElement.dataset.motion === 'reduced') { els.forEach((e) => e.classList.add('in')); return }
    const io = new IntersectionObserver((list) => {
      for (const it of list) if (it.isIntersecting) { it.target.classList.add('in'); io.unobserve(it.target) }
    }, { rootMargin: '0px 0px -8% 0px' })
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  })
}

/** The public pages (introduction and docs): their own header and footer, no app sidebar. */
export function SiteLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  useEffect(() => { window.scrollTo(0, 0) }, [])
  return (
    <div className="site">
      <header className="site-head">
        <div className={`site-bar ${wide ? 'wide' : ''}`}>
          <Link to="/about" className="site-logo" aria-label="Mneme, introduction"><Wordmark /></Link>
          <nav className="site-nav" aria-label="Site">
            <NavLink to="/about" end>Introduction</NavLink>
            <NavLink to="/docs">Docs</NavLink>
            <a href={GITHUB} target="_blank" rel="noreferrer">GitHub<Icon name="external" size={13} /></a>
          </nav>
          <Link to="/" className="btn primary sm site-open">Open Mneme</Link>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="site-foot">
        <div className={`site-bar ${wide ? 'wide' : ''}`}>
          <span><Wordmark /> <span className="muted">by Shrey</span></span>
          <nav aria-label="Footer">
            <Link to="/docs">Docs</Link>
            <Link to="/docs/privacy">Privacy and security</Link>
            <a href={GITHUB} target="_blank" rel="noreferrer">Source on GitHub</a>
            <Link to="/">Open Mneme</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
