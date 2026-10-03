# Security

## Reporting a problem

Please don't open a public issue. Use [GitHub's private vulnerability reporting](https://github.com/shreywy/Mneme/security/advisories/new) for this repository. You'll get a reply within a few days. Fixes ship to https://mnemee.pages.dev as soon as they're merged.

## Threat model

Mneme is a single-page app on Cloudflare Pages that talks to a Supabase project (Postgres, Auth, Realtime, Storage) with the public anon/publishable key. All protection of user data is in the database; the browser is never trusted.

### What we protect

| Asset | Where it lives |
|---|---|
| A user's decks, notes, pages, drawing, progress, highlights and settings | IndexedDB on their devices; Postgres when signed in |
| Their account (email, linked GitHub/Google identities, profile picture) | Supabase Auth, `profiles`, the `avatars` bucket |
| Shared copies | `shares`, readable only by id |
| Pictures on pages | Imgur (anonymous uploads); the delete code stays in the user's data |
| A Gemini API key (planned) | The user's browser only |

### Who we defend against

1. **Another signed-in user** trying to read, change, delete or forge someone else's rows with the public key and their own session.
2. **Untrusted content.** Decks, notes and shared pages are written by an AI or by other people, and may contain hostile Markdown, LaTeX, SVG, HTML demos, formulas or URLs.
3. **Someone with a share link** trying to reach more than the one shared copy, or to find other shares.
4. **A malicious or compromised third-party page** trying to frame Mneme or read it through the browser.

Out of scope: a compromised device or browser profile, a compromised Supabase or Cloudflare account, and denial of service against the free tiers.

### How each is handled

**Other users (1, 3)**
- Row-level security is enabled and forced on every table. Every policy is `user_id = auth.uid()` for both `using` and `with check`, so rows can't be read, changed or created for someone else.
- [`supabase/tests/rls.sql`](supabase/tests/rls.sql) signs in as two users and tries to read, update, delete and forge the other's rows in every table (decks, items, notes, marks, pages, blocks, ink, shares, profiles). It also checks that the anonymous role can't query tables directly.
- Shares are unreadable to anyone but their owner. Others get one share at a time through `get_share(id)`, a `security definer` function with a fixed `search_path`. Ids are 144 random bits.
- `delete_my_account()` refuses unless the session was created from an emailed code in the last ten minutes. The check is in SQL, not in the client.
- A per-account storage cap (20 MB) is counted by triggers after each write, and writes past it fail with `storage_full`. Deletions always go through.
- Server timestamps (`updated_at`) come from the database clock, never from the client.

**Untrusted content (2)**
- Markdown is rendered without raw HTML (`skipHtml`, no `rehype-raw`). Links and images in deck text are unwrapped to plain text.
- KaTeX runs with `trust: false`. If it fails, the LaTeX source is shown HTML-escaped.
- Figures (SVG) are parsed and rebuilt as React elements (never `innerHTML`) from an allowlist of elements and attributes. Scripts, styles, event handlers, links, `<use>`, `<image>`, `foreignObject` and external references never survive. Colours are mapped to theme roles.
- Plot formulas are read by a small expression parser (numbers, `x`, operators, a fixed list of functions). Nothing reaches `eval` or `Function`.
- HTML demos run in `<iframe sandbox="allow-scripts">` without `allow-same-origin` (an opaque origin), loading [`/demo-frame.html`](public/demo-frame.html). That page has its own CSP, `default-src 'none'`, so a demo can run its own code but can't load or send anything, use storage, or touch the app. The demo's document arrives by `postMessage`, and the only message the app accepts back is its height (clamped).
- Shared pages are validated with zod before rendering:
  - colours must be plain hex, because they end up in CSS
  - pictures may only load from `i.imgur.com`
  - sizes and counts are bounded
- Pictures added to pages are re-encoded through a canvas, which drops metadata such as EXIF location. The exception is small GIFs, which keep their animation. SVG is refused.

**The browser (4)**, via [`public/_headers`](public/_headers):
- **Content-Security-Policy:**
  - `script-src 'self'`, with no inline scripts and no eval.
  - `connect-src` limited to Supabase, Imgur and Google's Gemini API.
  - `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`.
- **Other headers:**
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - a strict `Referrer-Policy`
  - a `Permissions-Policy` that turns off camera, microphone, location and payment
  - HSTS
  - `Cross-Origin-Opener-Policy: same-origin`
- **Assets:** fonts are self-hosted, and there are no analytics or ad scripts.

**Pictures**
- Uploading needs a one-time consent that says the pictures are hosted on Imgur and readable by anyone with the link.
- The Imgur delete code is kept in the user's own (RLS-protected) data, stripped from share links, and never put on the clipboard.
- Deleting a picture, or purging a page, deletes the picture from Imgur.

**Secrets**
- The repository and the built site contain only public values: the Supabase URL and publishable key, plus an optional Imgur client id.
- The Supabase service-role key and database password are never used by the app.
- CI fails if a Google API key or a Supabase secret key appears in the build output.
- CodeQL (`security-extended`) runs on every push and weekly. Dependabot keeps dependencies and actions current.

## Known gaps and planned work

- Decks aren't end-to-end encrypted yet. AES-GCM with a passphrase-derived key is planned.
- There are no rate limits yet on publishing shares.
- The demo sandbox has a manual probe but no automated browser test yet.
- `style-src` allows `'unsafe-inline'`, because React and KaTeX set inline style attributes.
