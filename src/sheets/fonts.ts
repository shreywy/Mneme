// Fonts a page or a selection can use. All are self-hosted (loaded with the page's own code).

export type FontChoice = { key: string; label: string; css: string }

export const FONTS: FontChoice[] = [
  { key: 'sans', label: 'Sans', css: 'var(--sans)' },
  { key: 'serif', label: 'Serif', css: 'var(--serif)' },
  { key: 'book', label: 'Book', css: "'Lora', Georgia, serif" },
  { key: 'rounded', label: 'Rounded', css: "'Nunito', system-ui, sans-serif" },
  { key: 'readable', label: 'Easy to read', css: "'Atkinson Hyperlegible', system-ui, sans-serif" },
  { key: 'neat', label: 'Neat hand', css: "'Patrick Hand', cursive" },
  { key: 'hand', label: 'Handwriting', css: "'Caveat', cursive" },
  { key: 'mono', label: 'Mono', css: "'JetBrains Mono', ui-monospace, monospace" },
]

export const fontCss = (key: string | undefined) => FONTS.find((f) => f.key === key)?.css ?? FONTS[0].css

/** Sizes in the toolbar, in px. Unset means the page's size, which fits the lines. */
export const SIZES = [12, 14, 16, 18, 20, 22, 24]
