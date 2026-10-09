// The README's live usage tiles: GET /stats.svg. Reads the totals from public_stats() with the public
// Supabase key (the same one the app ships) and draws them. Cached for 30 minutes at the edge and by GitHub.
import { tilesSvg, type PublicStats } from '../src/stats/tiles'

type Env = { VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string }

export async function onRequestGet({ env }: { env: Env }): Promise<Response> {
  let stats: PublicStats | null = null
  try {
    const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_PUBLISHABLE_KEY
    if (url && key) {
      const r = await fetch(`${url}/rest/v1/rpc/public_stats`, { headers: { apikey: key }, cf: { cacheTtl: 1800, cacheEverything: true } } as RequestInit)
      if (r.ok) stats = await r.json() as PublicStats
    }
  } catch { /* drawn as offline */ }
  return new Response(tilesSvg(stats), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': stats ? 'public, max-age=1800' : 'public, max-age=300',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    },
  })
}
