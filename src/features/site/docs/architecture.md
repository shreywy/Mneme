# How it's built

For developers, or anyone curious. The source is on [GitHub](https://github.com/shreywy/Mneme).

## Stack

| Layer | |
|---|---|
| App | React 19, TypeScript (strict), Vite, React Router |
| State | Zustand (UI and settings), Dexie live queries (data) |
| Storage on the device | IndexedDB through Dexie, versioned schema |
| Server | Supabase: Postgres with row-level security, Auth (email code, GitHub, Google, PKCE), Realtime |
| Hosting | Cloudflare Pages, deployed from `main` |
| Editor | TipTap 3 (ProseMirror) with custom nodes for maths, plots, working, pictures and link cards |
| Maths | KaTeX for display, MathLive for typing |
| Drawing | perfect-freehand outlines as SVG; points stored quantised and delta-encoded |
| Scheduling | ts-fsrs |
| Tests | Vitest (unit and data), fast-check (property-based), Playwright (browser security tests on the production build), SQL tests for RLS against the real database |

## Local-first sync

```
 UI ──reads/writes──▶ IndexedDB (Dexie)
                         │  hooks queue every change (table, id)
                         ▼
                    pending queue ──push──▶ Supabase (Postgres + RLS)
                         ▲                      │
                         └──pull since cursor───┘   Realtime nudges a pull
```

- Every synced table has the same server shape: `(user_id, id, doc jsonb, deleted, updated_at)`, owner-only RLS, and a trigger that stamps `updated_at` on the server's clock.
- Dexie hooks catch every local create, update and delete and queue the row's id. A push sends each queued row (or a tombstone if it's gone), deletions first.
- A pull asks for rows changed since a per-table cursor, with a few seconds of overlap so rows committed out of order aren't missed. A local change that hasn't been pushed yet wins over an incoming one.
- A table the server doesn't have yet (the app shipped before its migration) is skipped and its rows wait, so the rest keeps syncing.

## Storage cap

Every synced row and share counts toward its owner's total, kept by triggers that run after each write. A write that would take an account past its cap is refused with `storage_full`; deletions and tombstones always go through, and the client sends them first so a full account can always free space.

## Pages

- A page is one row; every block and every stroke is its own row, so edits from two devices to different parts of a page never collide.
- Blocks sit on a grid measured in lines. Text inside uses the line spacing as its line height, so blocks side by side share baselines.
- Dragging draws from local positions and saves once on drop, so moving a large selection is smooth.
- Undo is one history for blocks and ink. Removing something copies its latest state into the change first, so undoing a delete brings back what was there, including text typed after the delete was recorded.
- Pages layout inserts the space before a page break as editor decorations, never as content, so it's never saved or synced.

## Testing

- Pure logic (scheduling, the deck parser and repair pass, sanitisers, grid and ink maths, pagination, sync engine) is unit-tested with Vitest, with the database faked by fake-indexeddb and an in-memory server.
- The prompt's example deck and notes are imported by the tests on every run, so the prompt can't drift from the parser.
- RLS tests run as SQL against the database: two users try to read, change, delete and forge each other's rows, get around two-step sign-in and the rate limits, and reach each other's pictures, devices and activity.
- Property-based tests (fast-check) feed the importers, the shared-page check, the formula parser and the SVG sanitiser random and mutated input.
- Browser tests (Playwright) run in CI against the production build served with the real `_headers`: the security headers, no policy violations, and a hostile demo that must fail to escape its sandbox.

## Security in CI

- Typecheck, unit tests, build, and a scan of the bundle for keys that must never ship.
- `npm audit` (no known vulnerabilities), gitleaks over the whole git history, CodeQL, OpenSSF Scorecard.
- Every GitHub Action is pinned to a commit, and Dependabot keeps them and the dependencies current.
