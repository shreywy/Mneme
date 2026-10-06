# Screenshots for the site and README

These scripts make the pictures in `public/site/`. Run them when the app changes enough that the pictures are out of date (for example when AI lands). They're run through the Playwright MCP browser, whose workspace root is `E:\GitHub`, which is why output paths start with `Mneme/.shots/` (that folder is git-ignored).

1. Start the dev server: `npm run dev -- --port 5178 --strictPort`.
2. In a fresh Playwright browser at `http://localhost:5178/about`, run `seed.js`. It imports the prompts' example deck and notes, builds the "Projectile motion" page, and returns the ids.
3. Open the page, press **Recenter page**, run `ink.js` (it measures the page, so do it at 100% zoom), then put the ids into `shots.js` and run it.
4. Convert to WebP: `python -c "from PIL import Image; ..."` (see HANDOFF), quality 86, into `public/site/`.
5. Hero: open `http://localhost:5178/scripts/screenshots/hero.html` at 3200×1720, take a screenshot, scale it to 2400 wide, and save it as `public/site/hero.jpg` (quality 88).

`../serve_dist.py` serves `dist/` with the headers from `public/_headers`, so a production build can be checked against the real Content Security Policy (`csp_test.js` walks through the main flows and collects violations).
