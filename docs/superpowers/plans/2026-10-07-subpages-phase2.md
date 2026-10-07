# Sub-pages phase 2: grow, back corner, path bar, [[ links

**Spec:** `docs/superpowers/specs/2026-10-07-subpages-and-drive-import-design.md` sections 4 and 5.
**Execution:** native, in this session (Shrey's call).

## Notes from reading the code

- The app uses `<BrowserRouter>`, not a data router, so React Router's `viewTransition` option does nothing.
  `src/app/pagenav.ts` calls `document.startViewTransition` itself. Inside it, `flushSync(nav)` runs,
  then it waits (up to 800 ms) for the new page to say it's ready (`[data-open="<id>"]`), because
  SheetPage renders nothing until its Dexie queries come back.
- The `page` name is set by hand with inline `view-transition-name`. It goes on the clicked element
  before the transition, and on `main.main` inside the update callback. It's cleared when the
  transition finishes, so two elements never hold it in the same snapshot.
- Sidebar rows also carry `data-page-id`, so "the card for page X" is `.sbox-card[data-page-id=X]`
  (or a `.page-link` chip), looked up inside `main` only.
- `worker-src 'self' blob:` is already in `public/_headers` (needed in phase 3).

## Tasks

1. **pagenav.** `openPage(nav, url, from?)` and `goBack(nav, toId, childId)`, plus `cardFor(parents, from, to)`,
   the child id on the path from `to` down to `from`. CSS lives in `src/styles/sheet.css`:
   - group 520 ms `cubic-bezier(.3,.7,.2,1)`;
   - old fades out by 40%; new fades in from 20% to 70%;
   - back runs 460 ms (`html.vt-back`);
   - an `:only-child` old image shrinks to the middle and fades;
   - the root dims slightly.

   Reduced motion, or no API: plain `nav`. Test: `cardFor`.
2. **Wire the grow.** Box cards, sidebar sheet rows and Read-view box links call `openPage` on a plain
   left click; modifier clicks fall through.
3. **Folded corner and path bar.** On a sub-page, SheetPage shows a corner button at the top left of `main`:
   - its label is "Back to <parent>";
   - Alt+← does the same;
   - it goes back with `goBack`.

   The crumbs become a path: folder / top › … › this page, each a link. A crumb that's an ancestor
   goes back into the card on the path.
4. **`[[` links.**
   - An inline atom `pageLink {id, title}` in `nodes.tsx`, with a live title. A missing page shows the
     stored title struck through and does nothing.
   - `renderText` gives the title. `renderHTML` is `<a data-page-link data-id data-title>title</a>`, so
     pasting it outside the app gives text.
   - A `[[` suggestion in `slash.tsx` lists sheets by title.
   - Insert gets "Link to page" (hint `[[`). The old item keeps its name and loses the `[[` hint.
   - `pagePayload` turns `pageLink` into plain text.

   Tests:
   - the `[[` search ranks results;
   - the payload drops the links but keeps their titles;
   - the editor round-trips the node through HTML, and `getText` returns the title.
5. **Docs and QC.** Update the docs page, HANDOFF and ROADMAP. QC in the browser, with reduced motion on and off.
