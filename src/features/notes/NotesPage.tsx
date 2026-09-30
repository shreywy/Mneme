import { TopBar } from '../../app/Shell'

export function NotesPage() {
  return (
    <>
      <TopBar crumbs={<b>Notes</b>} />
      <div className="page">
        <div className="hero-empty">
          <h1>Notes are on the way.</h1>
          <p>
            Soon the prompt will also write interactive study notes for a chapter or a week: a quick-reference card, collapsible sections,
            diagrams, worked examples and questions you answer right on the page. You'll be able to link any notes page to any deck,
            and arrange them by chapter, week or however your class runs.
          </p>
          <p style={{ fontSize: 13 }}>For now, decks work in full. Import one from the Library.</p>
        </div>
      </div>
    </>
  )
}
