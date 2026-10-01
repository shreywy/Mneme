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

type Settings = {
  theme: ThemePref
  accent: AccentId
  sound: boolean
  correctSound: CorrectSound
  reduceMotion: boolean
  sidebar: 'full' | 'rail'
  learnShuffle: boolean
  learnPanel: boolean
  learnMatch: boolean
  hiddenHints: string[]
  collapsedFolders: string[]
  libraryView: 'grid' | 'list'
  librarySort: 'recent' | 'name' | 'progress'
  set: (patch: Partial<Omit<Settings, 'set'>>) => void
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      theme: 'system',
      accent: 'moss',
      sound: true,
      correctSound: 'chime',
      reduceMotion: false,
      sidebar: 'full',
      learnShuffle: true,
      learnPanel: false,
      learnMatch: true,
      hiddenHints: [],
      collapsedFolders: [],
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

/** Apply theme, accent and motion settings to <html>. Called on load and whenever settings change. */
export function applySettings(s: Pick<Settings, 'theme' | 'accent' | 'reduceMotion'>) {
  const root = document.documentElement
  const dark = s.theme === 'dark' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  root.dataset.theme = dark ? 'dark' : 'light'
  const a = ACCENTS.find((x) => x.id === s.accent) ?? ACCENTS[0]
  root.style.setProperty('--accent', dark ? a.dark : a.light)
  if (s.reduceMotion) root.dataset.motion = 'reduced'
  else delete root.dataset.motion
}
