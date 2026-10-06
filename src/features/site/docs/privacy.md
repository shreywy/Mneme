# Privacy and security

Mneme is built so that one person's data can only ever be reached by that person, and so that what other people send you (a deck, a shared page, something an AI wrote) can't do anything to you.

## Your data is yours

- **Row-level security on every table.** The database itself checks that each row belongs to the signed-in user, for reading and for writing. It doesn't rely on the app to ask nicely. An automated test signs in as two users and tries to read, change, delete and forge the other's decks, notes, pages, drawing, highlights and shares; any success fails the build.
- **Shares are reachable only by their link.** The shares table can't be listed by anyone but its owner; others get one share at a time through a function that takes its id.
- **Deleting your account needs an emailed code from the last ten minutes**, checked on the server.
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

## Your AI key (coming)

When AI arrives you'll bring your own Gemini key. It will be stored encrypted in your browser and sent only to Google, never to Mneme's servers.

## Reporting a problem

See [`SECURITY.md`](https://github.com/shreywy/Mneme/blob/main/SECURITY.md).
