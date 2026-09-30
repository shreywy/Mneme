const reduced = () => document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches

/** Restart a CSS animation class on an element. */
export function pulse(el: HTMLElement | null, ...classes: string[]) {
  if (!el) return
  el.classList.remove('bump', 'flick', 'blaze', 'ice')
  void el.offsetWidth
  el.classList.add(...classes)
}

/** Small confetti burst around an element, in accent and flame colours. */
export function burst(el: HTMLElement | null) {
  if (!el || reduced()) return
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2
  const cols = [getComputedStyle(document.documentElement).getPropertyValue('--accent'), '#C8742C', '#D8B062']
  for (let i = 0; i < 16; i++) {
    const p = document.createElement('i')
    p.className = 'p'
    p.style.left = cx + 'px'; p.style.top = cy + 'px'; p.style.background = cols[i % 3]
    document.body.append(p)
    const a = (Math.PI * 2 * i) / 16 + Math.random() * 0.3, d = 38 + Math.random() * 34
    p.animate(
      [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) rotate(${a * 90}deg) scale(.4)`, opacity: 0 }],
      { duration: 620 + Math.random() * 200, easing: 'cubic-bezier(.2,.8,.2,1)' },
    ).onfinish = () => p.remove()
  }
}

/** Three puffs of smoke rising off the streak flame when it goes out. */
export function smoke(el: HTMLElement | null) {
  if (!el || reduced()) return
  const svg = el.querySelector('svg')
  if (!svg) return
  const r = svg.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + 2
  for (let i = 0; i < 3; i++) {
    const p = document.createElement('i')
    p.className = 'smoke'
    p.style.left = x + 'px'; p.style.top = y + 'px'
    document.body.append(p)
    const dx = (i - 1) * 5 + (Math.random() * 4 - 2)
    p.animate(
      [{ transform: 'translate(-50%,0) scale(.6)', opacity: 0 }, { opacity: 0.55, offset: 0.2 }, { transform: `translate(calc(-50% + ${dx}px), -22px) scale(1.6)`, opacity: 0 }],
      { duration: 750, delay: 250 + i * 90, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
    ).onfinish = () => p.remove()
  }
}

export const MILESTONES = [5, 10, 25, 50, 100, 200]
