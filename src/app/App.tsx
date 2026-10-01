import { BrowserRouter, Route, Routes } from 'react-router'
import { IconSprite } from '../ui/Icons'
import { Toasts } from '../ui/toasts'
import { Shell } from './Shell'
import { ArchivePage, LibraryPage } from '../features/library/LibraryPage'
import { DeckPage } from '../features/deck/DeckPage'
import { LearnPage } from '../features/learn/LearnPage'
import { FlashcardsPage } from '../features/flashcards/FlashcardsPage'
import { AccountPage } from '../features/account/AccountPage'
import { TestPage } from '../features/test/TestPage'
import { NotesPage } from '../features/notes/NotesPage'
import { Dialogs } from './Dialogs'
import { ConfirmHost } from '../ui/confirm'

export function App() {
  return (
    <BrowserRouter>
      <IconSprite />
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<LibraryPage />} />
          <Route path="folder/:folderId" element={<LibraryPage />} />
          <Route path="deck/:deckId" element={<DeckPage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="archive" element={<ArchivePage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="*" element={<LibraryPage />} />
        </Route>
        <Route path="deck/:deckId/learn" element={<LearnPage />} />
        <Route path="deck/:deckId/flashcards" element={<FlashcardsPage />} />
        <Route path="deck/:deckId/test" element={<TestPage />} />
      </Routes>
      <Dialogs />
      <ConfirmHost />
      <Toasts />
    </BrowserRouter>
  )
}
