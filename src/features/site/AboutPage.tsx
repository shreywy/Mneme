import { Link } from 'react-router'
import { Icon } from '../../ui/Icons'
import { ForgettingCurve } from './ForgettingCurve'
import { GITHUB, SiteLayout, useReveal } from './SiteLayout'

const shot = (name: string) => `/site/${name}.webp`

function Shot({ name, alt, className = '' }: { name: string; alt: string; className?: string }) {
  return (
    <div className={`shot ${className}`}>
      <div className="shot-bar" aria-hidden="true"><i /><i /><i /></div>
      <img src={shot(name)} alt={alt} loading="lazy" decoding="async" />
    </div>
  )
}

function Feature({ id, title, children, image, alt, flip, phone }: { id: string; title: string; children: React.ReactNode; image: string; alt: string; flip?: boolean; phone?: boolean }) {
  return (
    <section id={id} className={`feat reveal ${flip ? 'flip' : ''}`}>
      <div className="feat-text">
        <h2>{title}</h2>
        {children}
      </div>
      <Shot name={image} alt={alt} className={phone ? 'phone' : ''} />
    </section>
  )
}

const SMALL: [string, string][] = [
  ['Themes', 'Light and dark palettes, six accents, or a background colour of your own.'],
  ['Right-click everything', 'Folders, pages, cards, blocks and the paper all have their own menu.'],
  ['Focus mode', 'Press F and everything but the question goes away.'],
  ['Cheat sheets', 'Mix notes and decks into a 2, 3 or 4-column sheet and print it.'],
  ['Recently deleted', 'Five days to change your mind, and Undo straight away.'],
  ['Backups', 'Export a deck, or the whole library, as one file.'],
  ['Reduce motion', 'One switch turns every animation into an instant change.'],
  ['Keyboard first', 'Answers on 1–9, tools on single letters, Ctrl+Z on the paper.'],
]

const SECURITY = [
  ['Row-level security on every table', 'Postgres checks ownership on every read and write, and a SQL test suite tries to read, change and forge another user’s rows.'],
  ['Nothing a deck contains can run', 'Markdown without HTML, KaTeX with trust off, SVG rebuilt from an allowlist, formulas read by a parser instead of eval.'],
  ['Sandboxed demos', 'Interactive card demos run in an opaque-origin frame with no network, storage or access to the app.'],
  ['Unguessable share links', '144-bit ids, readable only through a function that takes the id; the table can’t be listed.'],
  ['Server-checked account deletion', 'Deleting an account needs an emailed code from the last ten minutes, enforced in the database.'],
  ['Schema-checked shared pages', 'zod validation on open: hex-only colours, bounded sizes, and pictures only from Mneme’s own signed links.'],
  ['A storage cap per account', '20 MB counted by triggers; writes past it are refused, deletions always go through.'],
  ['Two-step sign-in', 'An authenticator app on top of the email code, enforced by the database: a session without it reads nothing.'],
  ['Devices and activity', 'See every browser signed in, sign any of them out, and read a log of sign-ins and share links that only the server writes.'],
  ['Tested like an attacker', 'XSS payloads and fuzzing against every parser, and a browser test in CI where a hostile demo tries to escape its sandbox.'],
  ['Rate limits', 'Share links are capped per hour in the database, and the log behind it can’t be read or cleared.'],
  ['Private pictures', 'A private bucket under the same per-user rules, with its own allowance. Shares carry signed links that expire. No trackers anywhere.'],
]

const STACK = [
  ['App', 'React 19, TypeScript (strict), Vite, React Router, Zustand'],
  ['Data', 'Dexie on IndexedDB, zod, Supabase: Postgres, Auth, Realtime'],
  ['Editor', 'TipTap 3 on ProseMirror, KaTeX, MathLive, perfect-freehand'],
  ['Learning', 'ts-fsrs'],
  ['Hosting', 'Cloudflare Pages, GitHub Actions'],
  ['Testing and security', 'Vitest, fast-check, Playwright, SQL policy tests, CodeQL, OpenSSF Scorecard, gitleaks'],
]

/** The introduction: what Mneme is, every feature with a screenshot, and how it's built. */
export function AboutPage() {
  useReveal()
  return (
    <SiteLayout>
      <section className="hero">
        <div className="hero-text reveal">
          <h1>Your course material, turned into decks, notes and pages.</h1>
          <p className="hero-lede">Bring your slides to any AI chat with Mneme’s prompt and import what comes back. Learn schedules every card for just before you’d forget it, and notes and your own writing sit in the same folders.</p>
          <div className="hero-cta">
            <Link to="/" className="btn primary">Open Mneme<Icon name="chev" size={15} /></Link>
            <Link to="/docs" className="btn">Read the docs</Link>
          </div>
          <p className="hero-note">Free, no account needed, works offline.</p>
        </div>
        <div className="hero-art reveal" aria-hidden="true">
          <Shot name="page" alt="" className="hero-main" />
          <Shot name="learn" alt="" className="hero-float" />
        </div>
      </section>


      <Feature id="decks" title="From your slides, with the AI chat you already use" image="prompt" alt="The prompt builder: what to make, course, length and difficulty">
        <p>Mneme writes the prompt. Paste it into ChatGPT, Claude or Gemini with your course files, and import the reply. No API key, nothing to pay for.</p>
        <ul>
          <li>Eight question types, including numeric answers with a tolerance and scenarios with several questions.</li>
          <li>An explanation for every question and a reason for every wrong choice.</li>
          <li>A forgiving importer that repairs the usual slips, then checks the file strictly against a schema.</li>
        </ul>
      </Feature>

      <Feature id="learn" title="An endless queue that knows what you’re about to forget" image="learn" alt="A multiple-choice question in Learn, with the progress panel" flip>
        <p>Every card is scheduled with FSRS, the model Anki uses. Misses come back within a few cards; right answers come back later and harder, a choice becoming a typed answer.</p>
        <ul>
          <li>Match rounds between questions, plus Flashcards and timed practice Tests.</li>
          <li>Streaks, sounds and a progress panel, all of which you can turn off.</li>
        </ul>
      </Feature>

      <section className="curve-block reveal">
        <div>
          <h3>Each review makes the memory last longer</h3>
          <p className="muted">One card, reviewed when its chance of being remembered drops to the target. Drag the slider.</p>
        </div>
        <ForgettingCurve />
      </section>

      <Feature id="notes" title="Notes you can read, mark up and turn into a cheat sheet" image="notes" alt="A notes page with its contents, a plot and highlights">
        <p>The same prompt can write readable notes: contents, chapters, key terms that explain themselves on hover, and questions to check yourself as you read.</p>
        <ul>
          <li>Derivations lined up on the equals sign, plots, and figures drawn in Mneme’s own style.</li>
          <li>Highlights in four colours, annotations and bookmarks, synced and private.</li>
          <li>A cheat sheet builder that packs notes and decks into 2, 3 or 4 columns.</li>
        </ul>
      </Feature>

      <Feature id="pages" title="An endless sheet of paper for your own writing" image="page" alt="A page with maths, a plot, a table, code and handwriting" flip>
        <p>Click anywhere and type. Everything sits on one grid, so blocks side by side share their lines.</p>
        <ul>
          <li>Equations typed with a maths keyboard, step-by-step working, plots of any formula, tables, highlighted code.</li>
          <li>A pen with pressure, a highlighter that tucks behind the text, an eraser that rubs out part of a stroke, a lasso, and shapes that snap to the grid.</li>
          <li>Pictures, an A4 or Letter layout, and one-click PDF.</li>
        </ul>
      </Feature>

      <section className="duo reveal">
        <Shot name="page-dark" alt="A page in dark mode with drawing over it" />
        <Shot name="insert" alt="The Insert panel with a letter for every block" />
      </section>

      <Feature id="sync" title="Works offline, syncs when it can" image="phone" alt="A page in Read view on a phone" phone>
        <p>Mneme reads and writes your browser’s own database, so it’s instant and works on a plane. Sign in and changes reach your other devices within seconds.</p>
        <ul>
          <li>Pages sync one block and one stroke at a time, so two devices don’t overwrite each other.</li>
          <li>Share any deck, notes page or page as a read-only link.</li>
          <li>Phones get a reading view that’s still easy to edit.</li>
        </ul>
      </Feature>

      <section className="small-grid reveal" aria-label="More">
        {SMALL.map(([t, d]) => (
          <div key={t} className="small"><b>{t}</b><span>{d}</span></div>
        ))}
      </section>

      <section id="security" className="under reveal">
        <h2>Built like the data matters</h2>
        <p className="under-lede">Local-first sync over Postgres with row-level security, a strict line between your data and everyone else’s, and nothing from an AI or another person allowed to run.</p>
        <div className="sec-grid">
          {SECURITY.map(([t, d]) => <div key={t} className="secure"><b>{t}</b><span>{d}</span></div>)}
        </div>
        <dl className="stack">{STACK.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        <div className="under-links">
          <Link to="/docs/architecture" className="btn">How it’s built</Link>
          <Link to="/docs/privacy" className="btn ghost">Privacy and security</Link>
          <a href={GITHUB} className="btn ghost" target="_blank" rel="noreferrer">Source on GitHub<Icon name="external" size={13} /></a>
        </div>
      </section>

      <section id="next" className="next reveal">
        <h2>AI with your own key, and a desktop app</h2>
        <div className="next-grid">
          <div><b>Gemini, your key</b><span>A tutor on any card, “why is this wrong?”, grading of typed answers, and lasso part of a page to ask about it. The key is stored encrypted in your browser and sent only to Google.</span></div>
          <div><b>Handwriting to text</b><span>Turn pen writing and drawn maths into text and LaTeX.</span></div>
          <div><b>Desktop app</b><span>Fully offline, no limits, with your own files next to your notes.</span></div>
        </div>
      </section>

      <section className="cta reveal">
        <h2>Try it with this week’s lecture</h2>
        <div className="hero-cta"><Link to="/" className="btn primary">Open Mneme<Icon name="chev" size={15} /></Link><Link to="/docs/getting-started" className="btn">Getting started</Link></div>
      </section>
    </SiteLayout>
  )
}
