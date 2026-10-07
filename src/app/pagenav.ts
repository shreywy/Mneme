import type { MouseEvent } from 'react'
import { flushSync } from 'react-dom'
import type { NavigateFunction } from 'react-router'

// Opening a page grows it out of what was clicked; going back shrinks it into its card on the parent.
// The View Transitions API does the morph: whichever element is named `page` in the old snapshot turns
// into the one named `page` in the new one. Names are set by hand, one element at a time, because the
// app uses <BrowserRouter> (React Router's own viewTransition option needs a data router). Timing is in
// sheet.css.

const calm = () => typeof document.startViewTransition !== 'function' || document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches
const main = () => document.querySelector<HTMLElement>('main.main')
const cardSel = (id: string) => `.sbox-card[data-page-id="${CSS.escape(id)}"], .rbox a[data-page-id="${CSS.escape(id)}"], .page-link[data-id="${CSS.escape(id)}"]`

/** Waits a few frames for something on the new page (pages render once their data is read). */
function waitFor(find: () => HTMLElement | null, ms = 800): Promise<HTMLElement | null> {
  const t0 = performance.now()
  return new Promise((done) => {
    const look = () => {
      const el = find()
      if (el || performance.now() - t0 > ms) done(el)
      else setTimeout(look, 16) // not requestAnimationFrame: frames are on hold during the swap
    }
    look()
  })
}

function morph(nav: NavigateFunction, url: string, before: HTMLElement | null, after: () => Promise<HTMLElement | null>, back: boolean) {
  if (calm() || !before) { nav(url); return }
  const named: HTMLElement[] = []
  const name = (el: HTMLElement | null) => { if (el) { el.style.viewTransitionName = 'page'; named.push(el) } }
  const html = document.documentElement
  html.classList.toggle('vt-back', back)
  name(before)
  // The browser starts the swap on its next frame. A window that isn't drawing frames never gets there, so
  // after a moment go anyway rather than leave the click doing nothing.
  let went = false
  const vt = document.startViewTransition(async () => {
    before.style.viewTransitionName = ''
    if (went) return
    went = true
    flushSync(() => nav(url))
    name(await after())
  })
  setTimeout(() => { if (!went) { went = true; vt.skipTransition(); nav(url) } }, 300)
  void vt.finished.finally(() => { for (const el of named) el.style.viewTransitionName = ''; html.classList.remove('vt-back') })
}

/** Opens a page, growing it out of `from` (a card, a link, a sidebar row). Without one it just goes. */
export function openPage(nav: NavigateFunction, url: string, id: string, from?: HTMLElement | null) {
  morph(nav, url, from ?? null, () => waitFor(() => document.querySelector(`[data-open="${CSS.escape(id)}"]`) ? main() : null), false)
}

/** Goes up to page `to`, shrinking this page into the card for `child` there (or toward the middle). */
export function goBack(nav: NavigateFunction, to: string, child: string | null) {
  morph(nav, `/write/${to}`, main(), async () => {
    await waitFor(() => document.querySelector(`[data-open="${CSS.escape(to)}"]`))
    return child ? waitFor(() => main()?.querySelector<HTMLElement>(cardSel(child)) ?? null, 400) : null
  }, true)
}

/** A plain left click on a page link grows the page out of it; new-tab clicks and the like are left alone. */
export function growClick(e: MouseEvent<HTMLElement>, nav: NavigateFunction, url: string, id: string) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  openPage(nav, url, id, e.currentTarget)
}
