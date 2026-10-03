async (page) => {
  return await page.evaluate(async () => {
    const ink = await import('/src/data/ink.ts')
    const { encodePoints } = await import('/src/sheets/ink.ts')
    const sheetId = location.pathname.split('/').pop()
    await ink.deleteStrokes((await ink.inkFor(sheetId)).map((x) => x.id))
    await new Promise((r) => setTimeout(r, 300))
    const host = document.querySelector('.sheet-host').getBoundingClientRect()
    const W = (r) => ({ x: r.left - host.left, y: r.top - host.top, w: r.width, h: r.height })
    const jit = (n, a = 0.6) => Math.sin(n * 12.9898) * a
    const add = (pts, o) => ink.addStroke({ sheetId, tool: 'pen', color: '#C0392B', size: 2.6, pts: encodePoints(pts), sim: true, ...o })

    // A loose hand-drawn ring round the equation.
    const eq = W(document.querySelector('.nv-eq-show').getBoundingClientRect())
    const cx = eq.x + eq.w / 2, cy = eq.y + eq.h / 2, rx = 175, ry = 30
    const ring = []
    for (let i = 0; i <= 70; i++) { const a = -0.6 + (i / 70) * Math.PI * 2.15; ring.push([cx + (rx + jit(i, 3)) * Math.cos(a), cy + (ry + jit(i + 7, 2)) * Math.sin(a), 0.45 + 0.25 * Math.sin(i / 9)]) }
    await add(ring)

    // Highlight the key phrase.
    const strong = W(document.querySelector('.sblock strong').getBoundingClientRect())
    const mid = strong.y + strong.h / 2
    await ink.addStroke({ sheetId, tool: 'highlighter', color: '#F2CF3D', size: 18, pts: encodePoints([[strong.x - 2, mid, 0.5], [strong.x + strong.w + 2, mid, 0.5]]), shape: true })

    // An arrow from the side note to the top of the curve.
    const note = W([...document.querySelectorAll('.sblock')].find((b) => b.textContent.includes('Remember')).getBoundingClientRect())
    const svg = W([...document.querySelectorAll('.sblock svg')].map((e) => e.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0])
    const from = [note.x - 10, note.y + 70], to = [svg.x + svg.w * 0.55, svg.y + svg.h * 0.13]
    const arrow = []
    for (let i = 0; i <= 40; i++) { const t = i / 40; const bx = from[0] + (to[0] - from[0]) * t, by = from[1] + (to[1] - from[1]) * t - Math.sin(t * Math.PI) * 60; arrow.push([bx + jit(i, 0.8), by + jit(i + 3, 0.8), 0.5]) }
    await add(arrow, { color: '#2D6CDF' })
    const ang = Math.atan2(to[1] - arrow[36][1], to[0] - arrow[36][0])
    const head = (s) => [[to[0] - 16 * Math.cos(ang + s), to[1] - 16 * Math.sin(ang + s), 0.5], [to[0], to[1], 0.6]]
    await add(head(0.5), { color: '#2D6CDF' }); await add(head(-0.5), { color: '#2D6CDF' })

    // "max" written by the peak.
    const mx = to[0] - 110, my = to[1] - 12
    const word = [[0, 14], [2, 0], [8, 12], [14, 0], [16, 14], null, [30, 4], [24, 2], [20, 8], [24, 14], [30, 10], [31, 3], [32, 14], null, [38, 2], [48, 14], null, [48, 2], [38, 14]]
    let cur = []
    for (const p of [...word, null]) {
      if (!p) { if (cur.length) await add(cur.map(([x, y], i) => [mx + x * 1.3, my + y * 1.3, 0.5 + jit(i, 0.1)]), { color: '#2D6CDF' }); cur = []; continue }
      if (cur.length) { const [lx, ly] = cur[cur.length - 1]; for (let k = 1; k <= 4; k++) cur.push([lx + (p[0] - lx) * k / 4, ly + (p[1] - ly) * k / 4]) } else cur.push(p)
    }
    return 'ok'
  })
}
