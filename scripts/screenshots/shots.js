async (page) => {
  const ids = { deck: 'b91b63d4-974c-4a77-be86-82e98916b419', note: 'aeb5968b-42fb-494b-84a3-536ca554f12b', sheet: 'bf980815-6e11-40ff-9bcd-d00dae5f7e02' }
  const out = 'Mneme/.shots/'
  const wait = (ms) => page.waitForTimeout(ms)
  const settings = (patch) => page.evaluate(async (p) => { (await import('/src/settings/store.ts')).useSettings.getState().set(p) }, patch)
  const shot = async (name) => { await page.mouse.move(1430, 450); await wait(350); await page.screenshot({ path: out + name + '.png' }) }
  const openPage = async () => {
    await page.evaluate(async (id) => { (await import('/src/data/sheets.ts')).updateSheet(id, {}) }, ids.sheet)
    await page.goto('http://localhost:5178/write/' + ids.sheet); await wait(2200)
    const z = page.getByRole('button', { name: 'Zoom out' })
    await page.getByRole('button', { name: /Recenter page/ }).first().click(); await wait(200)
    await z.click(); await z.click(); await wait(300)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await settings({ theme: 'light', sidebar: 'rail' })

  await openPage(); await shot('page')
  await page.keyboard.press('i'); await wait(500); await shot('insert')
  await page.keyboard.press('Escape'); await wait(200)

  await settings({ theme: 'dark' }); await wait(300)
  await page.keyboard.press('p'); await wait(400); await shot('page-dark')
  await page.keyboard.press('t')
  await settings({ theme: 'light', sidebar: 'full' })

  await page.goto('http://localhost:5178/'); await wait(1800); await shot('library')
  await page.getByRole('button', { name: 'Get the LLM prompt' }).first().click(); await wait(800); await shot('prompt')
  await page.keyboard.press('Escape'); await wait(300)

  await page.goto('http://localhost:5178/notes/' + ids.note); await wait(2000); await shot('notes')
  await page.goto('http://localhost:5178/deck/' + ids.deck + '/learn'); await wait(2000); await shot('learn')
  await page.keyboard.press('Escape'); await wait(300)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:5178/write/' + ids.sheet); await wait(2200); await shot('phone')
  await page.setViewportSize({ width: 1440, height: 900 })
  return 'ok'
}
