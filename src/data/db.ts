import Dexie, { type Table } from 'dexie'
import type { Item, Topic } from '../deck-format/types'
import type { CardState } from '../engine/memory'
import type { Block } from '../notes-format/types'

export type Folder = { id: string; name: string; parentId: string | null; position: number; createdAt: number }
export type DeckRow = {
  id: string
  folderId: string | null
  title: string
  course?: string
  description?: string
  sources: string[]
  topics: Topic[]
  termCount: number
  questionCount: number
  createdAt: number
  updatedAt: number
  lastStudiedAt?: number
}
export type ItemRow = Item & { deckId: string; position: number }
export type StudyMode = 'learn' | 'flashcards' | 'test'
export type Review = { id?: number; deckId: string; key: string; correct: boolean; rating: number; ms: number; mode: StudyMode; at: number }
export type NoteRow = {
  id: string
  folderId: string | null
  title: string
  course?: string
  unit?: string
  summary?: string
  topics: string[]
  blocks: Block[]
  position: number
  createdAt: number
  updatedAt: number
  lastOpenedAt?: number
}
export type Link = { noteId: string; deckId: string; createdAt: number }
export type DeckRecord = { deckId: string; bestStreak: number; sessions: number; secondsStudied: number; answered: number; correct: number }

class MnemeDB extends Dexie {
  folders!: Table<Folder, string>
  decks!: Table<DeckRow, string>
  items!: Table<ItemRow, [string, string]>
  cards!: Table<CardState, [string, string]>
  reviews!: Table<Review, number>
  records!: Table<DeckRecord, string>
  notes!: Table<NoteRow, string>
  links!: Table<Link, [string, string]>

  constructor() {
    super('mneme')
    this.version(1).stores({
      folders: 'id, parentId, position',
      decks: 'id, folderId, title, updatedAt',
      items: '[deckId+key], deckId',
      cards: '[deckId+key], deckId',
      reviews: '++id, deckId, at, correct',
      records: 'deckId',
    })
    this.version(2).stores({
      notes: 'id, folderId, title, position, updatedAt',
      links: '[noteId+deckId], noteId, deckId',
    })
  }
}

export const db = new MnemeDB()
