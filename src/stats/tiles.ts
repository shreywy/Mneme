/** What public_stats() returns. */
export type PublicStats = {
  accounts: number; accounts_7d: number
  studied_today: number; studied_7d: number
  answers: number; answers_7d: number
  decks: number; cards: number; pages: number
}

/** 1234 → "1.2k", 2500000 → "2.5M". */
export function compact(n: number): string {
  if (n < 1000) return String(n)
  const [d, u] = n < 1e6 ? [1e3, 'k'] : [1e6, 'M']
  const v = n / d
  return `${v < 10 ? Math.floor(v * 10) / 10 : Math.floor(v)}${u}`
}

const W = 200, H = 104, GAP = 10

/** The README tiles as an SVG, in the app's paper colours, light or dark to match GitHub. */
export function tilesSvg(s: PublicStats | null): string {
  const tiles: [string, string, string][] = s
    ? [
        [compact(s.accounts), 'accounts', `+${compact(s.accounts_7d)} this week`],
        [compact(s.studied_7d), 'studied this week', `${compact(s.studied_today)} today`],
        [compact(s.answers_7d), 'answers this week', `${compact(s.answers)} all time`],
        [compact(s.cards), 'cards', `${compact(s.decks)} decks · ${compact(s.pages)} pages`],
      ]
    : [['–', 'accounts', ''], ['–', 'studied this week', ''], ['–', 'answers this week', ''], ['–', 'cards', 'stats are offline']]
  const width = tiles.length * W + (tiles.length - 1) * GAP
  const body = tiles.map(([num, label, sub], i) => {
    const x = i * (W + GAP)
    return `<g transform="translate(${x} 0)">
    <rect class="t" x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="10"/>
    <circle class="a" cx="21" cy="25" r="3"/>
    <text class="l" x="31" y="29">${label.toUpperCase()}</text>
    <text class="n" x="17" y="68">${num}</text>
    <text class="s" x="18" y="89">${sub}</text>
  </g>`
  }).join('\n  ')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" role="img" aria-label="Mneme usage">
  <style>
    .t { fill: #FBFAF6; stroke: #DCD6C8 }
    .a { fill: #4F6B3A }
    .n { fill: #1C1B18; font: 500 34px 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif; font-variant-numeric: lining-nums; letter-spacing: -.5px }
    .l { fill: #6B675D; font: 600 10px -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .08em }
    .s { fill: #6B675D; font: 400 11px -apple-system, 'Segoe UI', system-ui, sans-serif }
    @media (prefers-color-scheme: dark) {
      .t { fill: #1F1E1A; stroke: #34322B }
      .a { fill: #9CC58A }
      .n { fill: #ECE7DC }
      .l, .s { fill: #9C968A }
    }
  </style>
  ${body}
</svg>`
}
