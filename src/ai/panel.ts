import { create } from 'zustand'
import type { Pinned } from './chat'

/** What the AI panel is about: a chat id (one per card, selection…), its pinned context, and maybe a first question. */
export type AiOpen = { id: string; title: string; pinned: Pinned; system?: string; ask?: string }

export const useAiPanel = create<{ cur: AiOpen | null; n: number }>(() => ({ cur: null, n: 0 }))
export const openAi = (cur: AiOpen) => useAiPanel.setState((s) => ({ cur, n: s.n + 1 }))
export const closeAi = () => useAiPanel.setState({ cur: null })

export const NO_KEY = 'Add a free Gemini API key in Settings to use this'
