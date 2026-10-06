import { defineConfig } from '@playwright/test'

// Browser tests run against the production build, served with the real security headers from
// public/_headers, so they check what Cloudflare Pages serves rather than the dev server.
const PORT = 4199
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://127.0.0.1:${PORT}`, channel: 'chromium', viewport: { width: 1200, height: 760 } },
  webServer: {
    command: `${process.platform === 'win32' ? 'python' : 'python3'} scripts/serve_dist.py ${PORT}`,
    url: `http://127.0.0.1:${PORT}/about`,
    reuseExistingServer: !process.env.CI,
  },
})
