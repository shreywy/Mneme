async (page) => {
  return await page.evaluate(async () => {
    const repo = await import('/src/data/repo.ts')
    const notesRepo = await import('/src/data/notes.ts')
    const sheets = await import('/src/data/sheets.ts')
    const { parseAnyText } = await import('/src/notes-format/parse.ts')
    const deckMd = (await import('/deck-format/mneme-deck-prompt.md?raw')).default
    const notesMd = (await import('/deck-format/mneme-notes-prompt.md?raw')).default
    const example = (md, head) => md.slice(md.indexOf(head)).match(/```json\n([\s\S]*?)\n```/)[1]

    const acct = await repo.createFolder('ACCT 100')
    const econ = await repo.createFolder('ECON 101')
    const phys = await repo.createFolder('PHYS 101')

    const d = parseAnyText(example(deckMd, '## 5. Complete example'))
    const { deckId } = await repo.importDeck(d.result.deck)
    const { db } = await import('/src/data/db.ts')
    await db.decks.update(deckId, { folderId: acct })

    const n = parseAnyText(example(notesMd, '## 6. Complete example'))
    const made = await notesRepo.importNotes(n.result.notes, n.result.deck)
    await db.notes.update(made.noteId, { folderId: econ })
    if (made.deckId) await db.decks.update(made.deckId, { folderId: econ })

    const t = (text, marks) => ({ type: 'text', text, ...(marks ? { marks } : {}) })
    const p = (...c) => ({ type: 'paragraph', content: c })
    const im = (latex) => ({ type: 'inlineMath', attrs: { latex } })
    const h = (level, text) => ({ type: 'heading', attrs: { level }, content: [t(text)] })
    const cell = (type, text) => ({ type, content: [p(t(text))] })
    const row = (type, cells) => ({ type: 'tableRow', content: cells.map((x) => cell(type, x)) })
    const doc = { type: 'doc', content: [
      h(1, 'Projectile motion'),
      p(t('A ball leaves the ground at speed '), im('v_0'), t(' and angle '), im('\\theta'), t('. Gravity only pulls down, so the '), t('sideways speed never changes', [{ type: 'bold' }]), t('.')),
      h(2, 'Height over time'),
      { type: 'equation', attrs: { latex: 'y(t) = v_0 \\sin\\theta \\, t - \\tfrac{1}{2} g t^2' } },
      { type: 'plot', attrs: { spec: { fns: ['10*x - 4.9*x^2'], xMin: 0, xMax: 2.2, yMin: 0, yMax: 6, xLabel: 't (s)', yLabel: 'y (m)' } } },
      h(2, 'How far it goes'),
      { type: 'working', attrs: { lines: [
        { lhs: 'y', rel: '=', rhs: '0', why: 'it lands at the height it started' },
        { lhs: 't', rel: '=', rhs: '\\frac{2 v_0 \\sin\\theta}{g}', why: 'solve, ignoring t = 0' },
        { lhs: 'R', rel: '=', rhs: '\\frac{v_0^2 \\sin 2\\theta}{g}', why: 'range is v_x times t' },
      ] } },
      { type: 'table', content: [row('tableHeader', ['Angle', 'Range at 10 m/s', 'Time in the air']), row('tableCell', ['30°', '8.8 m', '1.0 s']), row('tableCell', ['45°', '10.2 m', '1.4 s']), row('tableCell', ['60°', '8.8 m', '1.8 s'])] },
      h(2, 'Check it in code'),
      { type: 'codeBlock', attrs: { language: 'python' }, content: [t('from math import sin, radians\n\ndef range_m(v0, angle, g=9.81):\n    return v0**2 * sin(radians(2 * angle)) / g\n\nprint(round(range_m(10, 45), 1))  # 10.2')] },
      { type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: true }, content: [p(t('Derive the range'))] },
        { type: 'taskItem', attrs: { checked: false }, content: [p(t('Problem set 3, questions 4–7'))] },
      ] },
    ] }
    const sheetId = await sheets.createSheet({ folderId: phys })
    const [main] = await sheets.blocksFor(sheetId)
    await sheets.saveBlockDoc(main.id, doc)
    await sheets.updateSheet(sheetId, { title: 'Projectile motion', titleAuto: false })
    await sheets.addBlock({ sheetId, x: 29, y: 8, w: 11, h: 3, kind: 'text', data: { doc: { type: 'doc', content: [h(3, 'Remember'), p(t('Same height up and down, so '), im('\\theta'), t(' and '), im('90^\\circ - \\theta'), t(' land in the same place.'))] } }, z: 2 })
    await sheets.addBlock({ sheetId, x: 29, y: 2, w: 1, h: 1, kind: 'bookmark', data: { doc: null, label: 'Exam formulas' }, z: 3 })
    return { deckId, noteId: made.noteId, sheetId }
  })
}
