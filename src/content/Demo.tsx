import { useEffect, useMemo, useRef, useState } from 'react'
import type { Demo as DemoSpec } from '../deck-format/types'
import { useSettings } from '../settings/store'

const VARS = ['bg', 'surface', 'surface2', 'ink', 'muted', 'line', 'accent', 'good', 'bad']

// Demos come from deck files (LLM output, or other people's decks), so they are untrusted.
// They run in <iframe sandbox="allow-scripts"> with no allow-same-origin: an opaque origin that can't
// read Mneme's storage, cookies or DOM, can't navigate the page, open popups or submit forms.
// The CSP below also blocks every network request, so a demo can't load or send anything.
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:"

function buildDoc(html: string, vars: string, dark: boolean): string {
  const base = `<style>:root{${vars};color-scheme:${dark ? 'dark' : 'light'}}`
    + 'html,body{margin:0;background:transparent;color:var(--ink);font:14px/1.5 var(--font)}body{padding:4px 2px}'
    + 'input,button,select,textarea{font:inherit;color:inherit}'
    + 'button{border:1px solid var(--line);background:var(--surface);border-radius:8px;padding:6px 12px;cursor:pointer}'
    + 'button:hover{background:var(--surface2)}input[type=range]{accent-color:var(--accent)}svg{max-width:100%}</style>'
  const report = '<script>(function(){function p(){parent.postMessage({type:"mneme-demo-height",h:Math.ceil(document.documentElement.scrollHeight)},"*")}'
    + 'try{new ResizeObserver(p).observe(document.documentElement)}catch(e){}addEventListener("load",p);setTimeout(p,60);p()})()</' + 'script>'
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">${base}</head><body>${html}${report}</body></html>`
}

/** A deck's HTML demo, sandboxed and sized to its content. The frame's only way to talk back is its height. */
export function Demo({ demo }: { demo: DemoSpec }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [h, setH] = useState(demo.height ?? 300)
  const theme = useSettings((s) => s.theme)
  const accent = useSettings((s) => s.accent)
  const dark = document.documentElement.dataset.theme === 'dark'

  const doc = useMemo(() => {
    const cs = getComputedStyle(document.documentElement)
    const vars = VARS.map((k) => `--${k}:${cs.getPropertyValue(`--${k}`).trim()}`).join(';')
      + ";--font:'Hanken Grotesk',system-ui,sans-serif;--serif:'Newsreader',Georgia,serif"
    return buildDoc(demo.html, vars, dark)
    // theme and accent change the CSS variables, so rebuild when they change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo.html, theme, accent, dark])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || typeof e.data !== 'object' || !e.data) return
      if (e.data.type === 'mneme-demo-height') setH(Math.max(60, Math.min(1400, Number(e.data.h) || 0)))
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  return (
    <figure className="demo">
      {demo.title && <figcaption>{demo.title}</figcaption>}
      <iframe ref={ref} srcDoc={doc} sandbox="allow-scripts" referrerPolicy="no-referrer"
        title={demo.title ?? 'Interactive demo'} style={{ height: h, colorScheme: dark ? 'dark' : 'light' }} />
    </figure>
  )
}
