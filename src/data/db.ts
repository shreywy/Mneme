import Dexie, { type Table } from 'dexie'
import type { Item, Topic } from '../deck-format/types'
import type { CardState } from '../engine/memory'
import type { Block } from '../notes-format/types'
import type { SheetBlock, SheetRow, SheetStroke } from '../sheets/types'

export type Folder = { id: string; name: string; parentId: string | null; position: number; createdAt: number; archived?: boolean; archivedAt?: number }
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
  archived?: boolean
  archivedAt?: number
  /** Set when deleted: it waits in Recently deleted, then goes for good. */
  deletedAt?: number
  /** How the class labels this part of the course: "Chapter 4", "Week 5". Groups pages in a folder. */
  unit?: string
  /** Place in its unit when the user has ordered it by hand (otherwise alphabetical). */
  rank?: number
}
export type ItemRow = Item & { deckId: string; position: number }
export type StudyMode = 'learn' | 'flashcards' | 'test'
export type Review = { id?: number; syncId?: string; deckId: string; key: string; correct: boolean; rating: number; ms: number; mode: StudyMode; at: number }
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
  /** Indexes into `blocks` of the sections read (index 0 for a page with no sections). */
  read?: number[]
  archived?: boolean
  archivedAt?: number
  /** Set when deleted: it waits in Recently deleted, then goes for good. */
  deletedAt?: number
  /** Place in its unit when the user has ordered it by hand (otherwise alphabetical). */
  rank?: number
}
export type Link = { noteId: string; deckId: string; createdAt: number }
export type MarkColor = 'yellow' | 'green' | 'blue' | 'pink'
/** A highlight, annotation ("note") or bookmark on a notes page. `block` is the top-level block it sits in;
 *  `anchor` pins it to a span of text (a bookmark without one marks the whole block). */
export type NoteMark = {
  id: string
  noteId: string
  kind: 'highlight' | 'note' | 'bookmark'
  block: number
  anchor?: { quote: string; prefix: string; suffix: string; offset: number }
  color?: MarkColor
  text?: string
  createdAt: number
  updatedAt: number
}
/** A picture added to a page, kept on this device until it's uploaded (and as a fast local copy after). */
export type LocalImage = { id: string; sheetId: string; blob: Blob; type: string; w: number; h: number; url?: string; deleteHash?: string; createdAt: number }
export type DeckRecord ={ deckId: string; bestStreak: number; sessions: number; secondsStudied: number; answered: number; correct: number }

class MnemeDB extends Dexie {
  folders!: Table<Folder, string>
  decks!: Table<DeckRow, string>
  items!: Table<ItemRow, [string, string]>
  cards!: Table<CardState, [string, string]>
  reviews!: Table<Review, number>
  records!: Table<DeckRecord, string>
  notes!: Table<NoteRow, string>
  links!: Table<Link, [string, string]>
  marks!: Table<NoteMark, string>
  sheets!: Table<SheetRow, string>
  sheetBlocks!: Table<SheetBlock, string>
  sheetInk!: Table<SheetStroke, string>
  images!: Table<LocalImage, string>
  secrets!: Table<Secret, string>
  chats!: Table<Chat, string>

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
    // v3: reviews get a global syncId so the same review from two devices is never duplicated.
    this.version(3).stores({
      reviews: '++id, deckId, at, correct, syncId',
    })
    // v4: highlights, annotations and bookmarks on notes pages.
    this.version(4).stores({
      marks: 'id, noteId',
    })
    // v5: the user's own pages (Text notes) and their blocks.
    this.version(5).stores({
      sheets: 'id, folderId, updatedAt',
      sheetBlocks: 'id, sheetId',
    })
    // v6: ink on pages, and pictures waiting to upload (images never sync themselves, only their link).
    this.version(6).stores({
      sheetInk: 'id, sheetId, blockId',
      images: 'id, sheetId',
    })
    // v7: sub-pages. An index on parentId so a page's sub-pages are one query.
    this.version(7).stores({
      sheets: 'id, folderId, updatedAt, parentId',
    })
    // v8: AI. The Gemini key (encrypted) and the tutor's chats, one per card. Neither syncs nor goes in backups.
    this.version(8).stores({
      secrets: 'id',
      chats: 'id, updatedAt',
    })
  }
}

/** The Gemini key sealed with a non-extractable AES key (`wrap`), which IndexedDB keeps but nothing can read out. */
export type Secret = { id: string; key?: CryptoKey; iv?: Uint8Array; data?: ArrayBuffer }
/** An AI chat: the pinned context, a summary of older turns, and the recent turns. */
export type Chat = { id: string; title: string; summary: string; turns: { role: 'user' | 'model'; text: string }[]; tokens: number; updatedAt: number }

export const db = new MnemeDB()
