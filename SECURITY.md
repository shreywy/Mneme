# Security

## Reporting a problem

Please don't open a public issue. Use [GitHub's private vulnerability reporting](https://github.com/shreywy/Mneme/security/advisories/new) for this repository (also listed in [`/.well-known/security.txt`](https://mnemee.pages.dev/.well-known/security.txt)). You'll get a reply within a few days. Fixes ship to https://mnemee.pages.dev as soon as they're merged.

## Threat model

Mneme is a single-page app on Cloudflare Pages that talks to a Supabase project (Postgres, Auth, Realtime, Storage) with the public publishable key. All protection of user data is in the database; the browser is never trusted.

### What we protect

| Asset | Where it lives |
|---|---|
| A user's decks, notes, pages, drawing, progress, highlights and settings | IndexedDB on their devices; Postgres when signed in |
| Their account (email, linked GitHub/Google identities, authenticators, profile picture) | Supabase Auth, `profiles`, the `avatars` bucket |
| Pictures on pages | IndexedDB, and the private `pictures` bucket when signed in |
| Shared copies | `shares`, readable only by id |
| The account's sessions and activity | Supabase Auth sessions, `account_events` |
| A Gemini API key | IndexedDB, sealed with a non-extractable AES-GCM key; signed in, also the owner-only `user_settings` row `gemini-key`. Sent only to Google |

### Who we defend against

1. **Another signed-in user** trying to read, change, delete or forge someone else's rows or files with the public key and their own session.
2. **Someone who got hold of one sign-in factor**: an emailed code, a GitHub or Google login, or a session on a lost device.
3. **Untrusted content.** Decks, notes and shared pages are written by an AI or by other people, and may contain hostile Markdown, LaTeX, SVG, HTML demos, formulas or URLs.
4. **Someone with a share link** trying to reach more than the one shared copy, find other shares, or publish in bulk from a stolen session.
5. **A malicious or compromised third-party page** trying to frame Mneme or read it through the browser.
6. **The supply chain**: a vulnerable dependency, a compromised GitHub Action, or a secret committed by mistake.

Out of scope: a compromised device or browser profile, a compromised Supabase or Cloudflare account, and denial of service against the free tiers.

### How each is handled

**Other users (1, 4)**
- Row-level security is enabled and forced on every table. Every policy is `user_id = auth.uid()` for both `using` and `with check`, so rows can't be read, changed or created for someone else.
- [`supabase/tests/rls.sql`](supabase/tests/rls.sql) signs in as two users and tries to read, update, delete and forge the other's rows in every table, files in every bucket, sessions and activity. It also checks that the anonymous role can't query tables directly.
- Shares are unreadable to anyone but their owner. Others get one share at a time through `get_share(id)`, a `security definer` function with a fixed `search_path`. Ids are 144 random bits.
- Publishing or updating share links is limited to 30 an hour per account, in a trigger. The log behind the limit can't be read or cleared by the client.
- `delete_my_account()` refuses unless the session was created from an emailed code in the last ten minutes (and passed the authenticator step, if there is one). The check is in SQL, not in the client.
- A per-account storage cap (20 MB) is counted by triggers after each write, and writes past it fail with `storage_full`. Deletions always go through. Pictures have their own 50 MB, checked by the upload policy.
- Server timestamps (`updated_at`) come from the database clock, never from the client.

**One stolen factor (2)**
- **Two-step sign-in** with an authenticator app (TOTP). Once an account has a verified authenticator, a restrictive policy on every table, on the picture and avatar folders and in every account function refuses sessions that haven't passed the second step (`aal2`). The client also stops syncing and asks for the code. Backup authenticators can be added; there are no recovery codes.
- **Devices**: the Account page lists every session (browser, last activity, IP) through `my_sessions()`, and `end_session()` signs one out by deleting its refresh tokens. "Sign out all others" uses Supabase's `others` scope. A signed-out device keeps its current access token until it expires (at most an hour).
- **Activity log**: share links made, updated and stopped, and devices signed out, shown with the sign-in time of each current session. `account_events` is written only by triggers and `security definer` functions; the owner can read it but not insert, change or delete entries. Entries are kept for 180 days.

**Untrusted content (3)**
- Markdown is rendered without raw HTML (`skipHtml`, no `rehype-raw`). Links and images in deck text are unwrapped to plain text.
- KaTeX runs with `trust: false`. If it fails, the LaTeX source is shown HTML-escaped.
- Figures (SVG) are parsed and rebuilt as React elements (never `innerHTML`) from an allowlist of elements and attributes. Scripts, styles, event handlers, links, `<use>`, `<image>`, `foreignObject` and external references never survive. Colours are mapped to theme roles.
- Plot formulas are read by a small expression parser (numbers, `x`, operators, a fixed list of functions). Nothing reaches `eval` or `Function`.
- HTML demos run in `<iframe sandbox="allow-scripts">` without `allow-same-origin` (an opaque origin), loading [`/demo-frame.html`](public/demo-frame.html). That page has its own CSP, `default-src 'none'`, so a demo can run its own code but can't load or send anything, use storage, or touch the app. The demo's document arrives by `postMessage`, and the only message the app accepts back is its height (clamped).
- Shared pages are validated with zod before rendering:
  - colours must be plain hex, because they end up in CSS
  - pictures may only load from `i.imgur.com` or a signed link to this project's own `pictures` bucket, with a strict path and token format
  - sizes and counts are bounded
  - the editor drops `javascript:`, `data:` and other non-web links, and styles smuggled through colour and font values
- Pictures are re-encoded through a canvas, which drops metadata such as EXIF location. The exception is small GIFs, which keep their animation. SVG is refused.

**Testing the content defences**
- [`src/content/xss.test.ts`](src/content/xss.test.ts) throws 35 known XSS payloads at deck and notes Markdown, page maths, figures and plot formulas, and checks the rendered DOM for anything that can run, navigate or load. A second test renders a hostile shared page through the real editor.
- [`src/fuzz.test.ts`](src/fuzz.test.ts) uses property-based testing (fast-check): random text, random JSON, the prompt's example with one value changed or cut short, generated hostile SVG trees and formulas. Importers must never crash, sanitisers must never let a forbidden element, attribute or URL through, and formulas must never reach a global.
- [`e2e/security.spec.ts`](e2e/security.spec.ts) (Playwright, in CI) runs against the production build served with the real headers. A hostile demo imported through the UI tries to read localStorage, IndexedDB, cookies and the parent page, fetch, load an image, navigate the app and open a popup; every attempt must fail. Loosening the sandbox makes it fail.

**The browser (5)**, via [`public/_headers`](public/_headers):
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
- Signed in, pictures go to the private `pictures` bucket at `<user id>/<picture id>.<ext>`. Only the owner can read, add or delete files in that folder; there's no update policy, so a stored picture can't be swapped behind a share link.
- Share links carry signed links that expire after a year. Updating the share makes new ones. Stopping a share doesn't revoke links already copied; deleting the picture does.
- Pictures copied to another page are only deleted once no page uses them. Deleting the account removes them all.
- Imgur is supported for signed-out use if the build has an Imgur client id (currently it doesn't). Uploading there needs a one-time consent, and the Imgur delete code is kept in the user's own data, stripped from share links and never put on the clipboard.

**Secrets and the supply chain (6)**
- The repository and the built site contain only public values: the Supabase URL and publishable key, plus an optional Imgur client id.
- The Supabase service-role key and database password are never used by the app.
- CI fails if a Google API key or a Supabase secret key appears in the build output, and runs gitleaks over the whole git history ([`.gitleaks.toml`](.gitleaks.toml) only allows the publishable key).
- CI fails on any dependency with a known vulnerability (`npm audit`). An npm override forces the patched KaTeX into packages that bundle an older one.
- Every GitHub Action is pinned to a full commit SHA, checkouts don't keep credentials, and workflows get read-only tokens unless a job needs more.
- CodeQL (`security-extended`) runs on every push and weekly; OpenSSF Scorecard runs on every push to `main`. Dependabot keeps dependencies and actions current.

## Known gaps and planned work

- Decks aren't end-to-end encrypted yet. AES-GCM with a passphrase-derived key is designed but not built.
- There are no recovery codes for two-step sign-in, only backup authenticators.
- Picture links in a share include the owner's account id (an opaque UUID that grants nothing on its own).
- `style-src` allows `'unsafe-inline'`, because React and KaTeX set inline style attributes.
- No Trusted Types yet: MathLive and ProseMirror write HTML internally, so `require-trusted-types-for` would need a policy around each first.
