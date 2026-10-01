import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemePref = 'light' | 'dark' | 'system'
export type CorrectSound = 'chime' | 'pop' | 'wood' | 'bell' | 'marimba' | 'pluck'

export const ACCENTS = [
  { id: 'moss', name: 'Moss', light: '#4F6B3A', dark: '#A7BE8A' },
  { id: 'fern', name: 'Fern', light: '#2F5D46', dark: '#86B59C' },
  { id: 'sage', name: 'Sage', light: '#62805C', dark: '#AFC4A8' },
  { id: 'terracotta', name: 'Terracotta', light: '#A9553A', dark: '#E0916F' },
  { id: 'ochre', name: 'Ochre', light: '#98712A', dark: '#D8B062' },
  { id: 'slate', name: 'Slate', light: '#475866', dark: '#9DB0BF' },
] as const
export type AccentId = (typeof ACCENTS)[number]['id']

export const DARK_PALETTES = [
  { id: 'paper', name: 'Paper', bg: '#171613' },
  { id: 'black', name: 'Black', bg: '#000000' },
  { id: 'grey', name: 'Grey', bg: '#1C1C1E' },
  { id: 'discord', name: 'Blurple grey', bg: '#313338' },
] as const
export type DarkPalette = (typeof DARK_PALETTES)[number]['id']

type Settings = {
  theme: ThemePref
  accent: AccentId
  darkPalette: DarkPalette
  /** Custom background colour; when set it decides light or dark by itself. */
  customBg: string | null
  sound: boolean
  correctSound: CorrectSound
  reduceMotion: boolean
  sidebar: 'full' | 'rail'
  learnShuffle: boolean
  learnPanel: boolean
  learnMatch: boolean
  hiddenHints: string[]
  openFolders: string[]
  libraryView: 'grid' | 'list'
  librarySort: 'recent' | 'name' | 'progress'
  set: (patch: Partial<Omit<Settings, 'set'>>) => void
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      theme: 'system',
      accent: 'moss',
      darkPalette: 'paper',
      customBg: null,
      sound: true,
      correctSound: 'chime',
      reduceMotion: false,
      sidebar: 'full',
      learnShuffle: true,
      learnPanel: false,
      learnMatch: true,
      hiddenHints: [],
      openFolders: [],
      libraryView: 'grid',
      librarySort: 'recent',
      set: (patch) => set(patch),
    }),
    { name: 'mneme.settings' },
  ),
)

export const hideHint = (id: string) => {
  const { hiddenHints, set } = useSettings.getState()
  if (!hiddenHints.includes(id)) set({ hiddenHints: [...hiddenHints, id] })
}

/** Relative luminance (WCAG) of a #rrggbb colour, 0 = black, 1 = white. */
export function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

const CUSTOM_VARS = ['--bg', '--surface', '--surface2', '--ink', '--muted', '--line', '--accent-ink']
/** Derive the whole surface and text palette from one background colour. */
function customPalette(bg: string, dark: boolean): Record<string, string> {
  const mix = (toward: string, pct: number) => `color-mix(in oklab, ${bg}, ${toward} ${pct}%)`
  return dark
    ? { '--bg': bg, '--surface': mix('white', 5), '--surface2': mix('white', 10), '--line': mix('white', 15), '--ink': mix('white', 90), '--muted': mix('white', 58), '--accent-ink': bg }
    : { '--bg': bg, '--surface': mix('white', 60), '--surface2': mix('black', 4), '--line': mix('black', 11), '--ink': mix('black', 88), '--muted': mix('black', 58), '--accent-ink': mix('white', 85) }
}

/** Apply theme, accent and motion settings to <html>. Called on load and whenever settings change. */
export function applySettings(s: Pick<Settings, 'theme' | 'accent' | 'reduceMotion' | 'darkPalette' | 'customBg'>) {
  const root = document.documentElement
  const custom = s.customBg && /^#[0-9a-f]{6}$/i.test(s.customBg) ? s.customBg : null
  // A dark custom background gets light text and vice versa; the Light/Dark choice only applies without one.
  const dark = custom ? luminance(custom) < 0.18 : s.theme === 'dark' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  root.dataset.theme = dark ? 'dark' : 'light'
  if (!custom && dark && s.darkPalette !== 'paper') root.dataset.palette = s.darkPalette
  else delete root.dataset.palette
  const vars = custom ? customPalette(custom, dark) : null
  for (const v of CUSTOM_VARS) vars ? root.style.setProperty(v, vars[v]) : root.style.removeProperty(v)
  const a = ACCENTS.find((x) => x.id === s.accent) ?? ACCENTS[0]
  root.style.setProperty('--accent', dark ? a.dark : a.light)
  if (s.reduceMotion) root.dataset.motion = 'reduced'
  else delete root.dataset.motion
}
