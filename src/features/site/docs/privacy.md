# Privacy and security

Mneme is built so that one person's data can only ever be reached by that person, and so that what other people send you (a deck, a shared page, something an AI wrote) can't do anything to you.

## Your data is yours

- **Row-level security on every table.** The database itself checks that each row belongs to the signed-in user, for reading and for writing. It doesn't rely on the app to ask nicely. An automated test signs in as two users and tries to read, change, delete and forge the other's decks, notes, pages, drawing, highlights and shares; any success fails the build.
- **Shares are reachable only by their link.** The shares table can't be listed by anyone but its owner; others get one share at a time through a function that takes its id.
- **Two-step sign-in.** Turn it on in Account and signing in also needs a code from an authenticator app. The database enforces it: once you have an authenticator, a session that hasn't used it can't read or write anything, so an emailed code or a GitHub login on its own isn't enough. Add a second authenticator on another device as a backup; there's no other way back in.
- **See where you're signed in.** Account lists each browser signed in to your account, when it was last active, and lets you sign any of them out, or all but this one.
- **Recent activity.** Account also shows sign-ins and every share link made, updated or turned off. Only the database writes that log; you can read it but not change it.
- **Limits on sharing.** An account can make or update at most 30 share links an hour, so a stolen session can't be used to publish in bulk.
- **Deleting your account needs an emailed code from the last ten minutes**, checked on the server (and the authenticator code too, if you use one).
- **No analytics, no ads, no tracking scripts.** Fonts are self-hosted, so pages don't call font services either.

## Content can't run

Everything that comes from an AI or another person is treated as untrusted:

- Markdown is rendered with raw HTML switched off; links and images in deck text are shown as plain text.
- Maths is rendered by KaTeX with `trust` off, and if it fails, the source is shown escaped.
- **Figures** (SVG) are rebuilt from an allowlist of elements and attributes; scripts, event handlers, links and external references never survive.
- **Plots** read formulas with a small parser that only knows numbers, `x`, operators and a list of maths functions. Nothing is ever passed to `eval`.
- **Demos** on cards run in a sandboxed frame with an opaque origin: no network, no cookies or storage, no access to Mneme.
- **Shared pages** are checked against a schema before they're shown: colours must be plain hex values, pictures can only load from Mneme's own signed links, and anything else is dropped.

## Pictures

Pictures are stored in a private folder that only your account can open; the same per-user rules as the rest of your data apply. They're re-encoded first, which drops hidden details such as where a photo was taken. Your other devices download them with your sign-in.

A share link can't use your folder, so sharing a page puts a signed link to each picture in the shared copy. Signed links work for a year; **Update to the current version** makes new ones. Stopping the share doesn't cancel links someone has already copied, so delete a picture if it must go.

## Your Gemini key

AI in Mneme runs on your own free Gemini key, added in **Settings → AI**.

- Requests go from your browser straight to Google. Mneme has no server in between, and nothing is sent until you press an AI button.
- On your device the key is sealed with a browser key that can't be read out, so a copied browser profile doesn't give it away.
- Signed in, the key is also kept on your account (only you can read it, like your settings) so you paste it once for all your devices. Removing it in Settings removes it everywhere.
- What gets sent: the card, the selection or the snapshot you asked about, and your question. Tutor chats stay on the device.

## How it's tested

- Known XSS payloads (script tags, event handlers, `javascript:` links, SVG tricks, hostile LaTeX) are thrown at every place text becomes markup, and at a hostile shared page.
- Property-based tests generate thousands of random and half-broken files, formulas and SVG drawings to check the importers and sanitisers never crash or let anything through.
- A browser test imports a deck with a demo that tries to read Mneme's storage, reach the page, phone home and open popups; every attempt must fail. It runs on every change against the production build with its real security headers.
- The SQL tests also try to get around two-step sign-in, the rate limits, the picture folders and the activity log.

## Reporting a problem

See [`SECURITY.md`](https://github.com/shreywy/Mneme/blob/main/SECURITY.md).
