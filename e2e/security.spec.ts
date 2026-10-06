import { expect, test, type Page } from '@playwright/test'

// Security checks in a real browser, against the production build and its real headers.

/** Collects Content-Security-Policy violations and script errors on the page and in its frames. */
function watch(page: Page) {
  const problems: string[] = []
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => problems.push(`error: ${String(e).slice(0, 300)}`))
  return problems
}

test('every response carries the security headers', async ({ request }) => {
  const res = await request.get('/')
  const h = res.headers()
  const csp = h['content-security-policy'] ?? ''
  expect(csp).toContain("script-src 'self';")
  expect(csp).toContain("frame-ancestors 'none'")
  expect(csp).toContain("object-src 'none'")
  expect(csp).toContain("base-uri 'none'")
  expect(csp).not.toMatch(/script-src[^;]*('unsafe-inline'|'unsafe-eval'|\*)/)
  expect(h['x-frame-options']).toBe('DENY')
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(h['permissions-policy']).toContain('camera=()')
  expect(h['cross-origin-opener-policy']).toBe('same-origin')

  const frame = (await request.get('/demo-frame.html')).headers()
  expect(frame['content-security-policy']).toMatch(/^default-src 'none'/)
  expect(frame['content-security-policy']).not.toContain('connect-src')
  expect(frame['x-frame-options']).toBeUndefined() // Mneme itself frames it; frame-ancestors 'self' guards it instead
})

test('the site and the app load without a single policy violation', async ({ page }) => {
  const problems = watch(page)
  for (const path of ['/about', '/docs/studying', '/']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
  }
  await page.getByRole('button', { name: 'New page' }).first().click()
  await page.locator('.ProseMirror').first().waitFor()
  await page.keyboard.type('Hello from the browser test')
  await page.waitForTimeout(500)
  expect(problems).toEqual([])
})

// A demo that tries everything a hostile deck might: read Mneme's storage and cookies, reach the page
// around it, phone home, navigate the app, open a popup. It reports what happened through the console.
const PROBE = `<p id=out>demo ran</p><script>
(async () => {
  const r = {}
  const t = async (k, f) => { try { const v = await f(); r[k] = 'allowed: ' + String(v).slice(0, 40) } catch (e) { r[k] = 'blocked' } }
  await t('localStorage', () => localStorage.getItem('x') ?? 'readable')
  await t('indexedDB', () => new Promise((ok, no) => { const q = indexedDB.open('mneme'); q.onsuccess = () => ok('opened'); q.onerror = () => no(q.error) }))
  await t('cookie', () => document.cookie)
  await t('parentDocument', () => parent.document.title)
  await t('fetchSameSite', () => fetch('/').then((x) => x.status))
  await t('fetchElsewhere', () => fetch('https://example.com/').then((x) => x.status))
  await t('image', () => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok('loaded'); i.onerror = () => no(new Error('x')); i.src = 'https://example.com/favicon.ico'; setTimeout(() => no(new Error('timeout')), 3000) }))
  await t('topNavigation', () => { top.location.href = 'https://example.com/'; return 'navigated' })
  await t('popup', () => { const w = open('https://example.com/'); if (!w) throw new Error('no window'); return 'opened' })
  console.log('PROBE ' + JSON.stringify(r))
})()
</` + `script>`

test('a hostile demo runs, but is cut off from the app, its data and the network', async ({ page }) => {
  const results = new Promise<Record<string, string>>((resolve) => {
    page.on('console', (m) => { if (m.text().startsWith('PROBE ')) resolve(JSON.parse(m.text().slice(6))) })
  })
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('x', 'secret'))
  const notes = { format: 'mneme.notes', version: 1, notes: { title: 'Probe', unit: 'Week 1', blocks: [{ type: 'heading', text: 'Probe' }, { type: 'demo', title: 'Probe', height: 120, html: PROBE }] } }
  await page.getByRole('button', { name: 'Import' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Import' })
  await dialog.getByRole('button', { name: 'Paste text instead' }).click()
  await dialog.locator('textarea').fill(JSON.stringify(notes))
  await dialog.getByRole('button', { name: 'Check' }).click()
  await dialog.getByRole('button', { name: /^Import/ }).last().click()

  const frame = page.frameLocator('iframe[title="Probe"]')
  await expect(frame.locator('#out')).toHaveText('demo ran', { timeout: 15_000 })
  const r = await results
  for (const k of ['localStorage', 'indexedDB', 'cookie', 'parentDocument', 'fetchSameSite', 'fetchElsewhere', 'image', 'topNavigation', 'popup']) {
    expect.soft(r[k], k).toBe('blocked')
  }
  expect(page.url()).toContain('127.0.0.1') // the app wasn't navigated away
  expect(await page.locator('iframe[title="Probe"]').getAttribute('sandbox')).toBe('allow-scripts')
})
