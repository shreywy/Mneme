import { lazy, Suspense } from 'react'
import { SecondStepGate } from '../features/account/TwoStep'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { IconSprite } from '../ui/Icons'
import { ContextMenuHost } from '../ui/ContextMenu'
import { Toasts } from '../ui/toasts'
import { Shell } from './Shell'
import { ArchivePage, LibraryPage } from '../features/library/LibraryPage'
import { DeckPage } from '../features/deck/DeckPage'
import { LearnPage } from '../features/learn/LearnPage'
import { FlashcardsPage } from '../features/flashcards/FlashcardsPage'
import { AccountPage } from '../features/account/AccountPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { CheatSheetPage } from '../features/cheatsheet/CheatSheetPage'
import { SharedPage } from '../features/share/SharedPage'
import { TestPage } from '../features/test/TestPage'
import { NotesPage } from '../features/notes/NotesPage'
import { Dialogs } from './Dialogs'
import { AiPanel } from '../features/ai/AiPanel'
import { SnapLayer } from '../features/ai/SnapLayer'
import { ConfirmHost } from '../ui/confirm'

// Pages bring the editor with them, so they load on first use.
const SheetPage = lazy(() => import('../features/sheet/SheetPage').then((m) => ({ default: m.SheetPage })))
// The introduction and docs are their own pages, loaded when visited.
const AboutPage = lazy(() => import('../features/site/AboutPage').then((m) => ({ default: m.AboutPage })))
const DocsPage = lazy(() => import('../features/site/DocsPage').then((m) => ({ default: m.DocsPage })))

export function App() {
  return (
    <BrowserRouter>
      <IconSprite />
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<LibraryPage />} />
          <Route path="folder/:folderId" element={<LibraryPage />} />
          <Route path="deck/:deckId" element={<DeckPage />} />
          <Route path="notes/:noteId" element={<NotesPage />} />
          <Route path="notes" element={<Navigate to="/" replace />} />
          <Route path="write/:sheetId" element={<Suspense fallback={<div className="page" />}><SheetPage /></Suspense>} />
          <Route path="archive" element={<ArchivePage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="cheatsheet" element={<CheatSheetPage />} />
          <Route path="s/:shareId" element={<SharedPage />} />
          <Route path="*" element={<LibraryPage />} />
        </Route>
        <Route path="about" element={<Suspense fallback={null}><AboutPage /></Suspense>} />
        <Route path="docs" element={<Suspense fallback={null}><DocsPage /></Suspense>} />
        <Route path="docs/:topic" element={<Suspense fallback={null}><DocsPage /></Suspense>} />
        <Route path="deck/:deckId/learn" element={<LearnPage />} />
        <Route path="deck/:deckId/flashcards" element={<FlashcardsPage />} />
        <Route path="deck/:deckId/test" element={<TestPage />} />
      </Routes>
      <Dialogs />
      <AiPanel />
      <SnapLayer />
      <SecondStepGate />
      <ConfirmHost />
      <Toasts />
      <ContextMenuHost />
    </BrowserRouter>
  )
}
