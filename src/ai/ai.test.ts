// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { ask, askJson, errorFor, readChunk, resetModels } from './gemini'
import { contentsFor, emptyChat, needsSummary, saveChat, systemFor, BUDGET, KEEP } from './chat'
import { getKey, removeKey, setKey } from './key'

beforeEach(async () => { resetModels(); await Promise.all(db.tables.map((t) => t.clear())) })
afterEach(() => vi.unstubAllGlobals())

const sse = (...chunks: object[]) => new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\r\n\r\n`).join(''), { status: 200 })
const part = (text: string, tokens = 10, end = false) => ({ candidates: [{ content: { parts: [{ text }] }, ...(end ? { finishReason: 'STOP' } : {}) }], usageMetadata: { promptTokenCount: tokens } })

describe('talking to Gemini', () => {
  it('streams text and keeps the prompt token count', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse(part('Hel'), part('lo', 42, true))))
    const seen: string[] = []
    const r = await ask('k', { contents: [] }, { onText: (t) => seen.push(t) })
    expect(r).toEqual({ text: 'Hello', tokens: 42 })
    expect(seen).toEqual(['Hel', 'Hello'])
  })

  it('falls back to Flash-Lite when Flash is out of free requests or overloaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('flash-latest') ? new Response('{}', { status: 503 }) : sse(part('ok', 1, true)))))
    expect((await ask('k', { contents: [] })).text).toBe('ok')
    resetModels()
    const f = vi.fn(async (url: string) => (url.includes('flash-latest') ? new Response('{}', { status: 429 }) : sse(part('ok', 1, true))))
    vi.stubGlobal('fetch', f)
    expect((await ask('k', { contents: [] })).text).toBe('ok')
    expect(f.mock.calls.map((c) => c[0])).toEqual([expect.stringContaining('gemini-flash-latest'), expect.stringContaining('gemini-flash-lite-latest')])
    // For the next minute it goes straight to Flash-Lite.
    await ask('k', { contents: [] })
    expect(f.mock.calls[2][0]).toContain('gemini-flash-lite-latest')
  })

  it('treats a stream that stops without a finish marker as cut off, and retries JSON once', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse(part('{'))))
    await expect(ask('k', { contents: [] })).rejects.toThrow(/cut off/)
    const f = vi.fn().mockResolvedValueOnce(sse(part('{'))).mockResolvedValueOnce(sse(part('{"a":1}', 1, true)))
    vi.stubGlobal('fetch', f)
    expect(await askJson('k', { contents: [] })).toEqual({ a: 1 })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('says plainly what went wrong', () => {
    expect(errorFor(400, '{"reason":"API_KEY_INVALID"}').kind).toBe('key')
    expect(errorFor(429, '').message).toMatch(/limit/)
    expect(errorFor(400, '{"error":{"message":"Bad thing"}}').message).toBe('Gemini said: Bad thing')
    expect(() => readChunk('{"promptFeedback":{"blockReason":"SAFETY"}}')).toThrow(/wouldn’t answer/)
    expect(readChunk('{"candidates":[{"content":{"parts":[{"text":"thinking","thought":true},{"text":"answer"}]}}]}').text).toBe('answer')
  })
})

describe('chats', () => {
  it('pins the context and the summary, and puts pictures on the first question', () => {
    const c = { ...emptyChat('a', 't'), summary: 'They mixed up mean and median.', turns: [{ role: 'user' as const, text: 'q1' }, { role: 'model' as const, text: 'a1' }] }
    expect(systemFor({ context: 'Card: what is a median?' }, c)).toMatch(/Card: what is a median\?[\s\S]*mixed up mean and median/)
    const turns = contentsFor(c, { context: '', images: [{ mimeType: 'image/png', data: 'AAA' }] }, 'q2')
    expect(turns.map((t) => t.role)).toEqual(['user', 'model', 'user'])
    expect(turns[0].parts).toEqual([{ text: 'q1' }, { inlineData: { mimeType: 'image/png', data: 'AAA' } }])
  })

  it('summarises once the prompt passes 60% of the budget', () => {
    const turns = Array.from({ length: KEEP + 2 }, (_, i) => ({ role: (i % 2 ? 'model' : 'user') as 'user' | 'model', text: String(i) }))
    expect(needsSummary({ tokens: BUDGET * 0.5, turns })).toBe(false)
    expect(needsSummary({ tokens: BUDGET * 0.7, turns })).toBe(true)
    expect(needsSummary({ tokens: BUDGET * 0.7, turns: turns.slice(0, KEEP) })).toBe(false)
  })

  it('keeps at most 200 chats, dropping the oldest', async () => {
    for (let i = 0; i < 202; i++) await db.chats.put({ ...emptyChat(`c${i}`, ''), updatedAt: i })
    await saveChat(emptyChat('new', ''))
    expect(await db.chats.count()).toBe(200)
    expect(await db.chats.get('c0')).toBeUndefined()
  })
})

describe('the key', () => {
  it('is checked with Google, sealed on the device, and removable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    await setKey('  AIzaSyTESTTESTTESTTESTTESTTESTTESTTEST  ')
    expect(await getKey()).toBe('AIzaSyTESTTESTTESTTESTTESTTESTTESTTEST')
    const sealed = await db.secrets.get('gemini')
    expect(new TextDecoder().decode(new Uint8Array(sealed!.data!))).not.toContain('AIza')
    await removeKey()
    expect(await db.secrets.get('gemini')).toBeUndefined()
  })

  it('refuses a key Google rejects, and junk', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"reason":"API_KEY_INVALID"}', { status: 400 })))
    await expect(setKey('AIzaSyTESTTESTTESTTESTTESTTESTTESTTEST')).rejects.toThrow(/didn’t accept/)
    await expect(setKey('not a key')).rejects.toThrow(/doesn’t look like/)
    expect(await db.secrets.get('gemini')).toBeUndefined()
  })
})

describe('study actions', () => {
  const deck = { title: 'Stats', topics: [{ id: 't', name: 'Averages' }] }
  const reply = (obj: object) => vi.stubGlobal('fetch', vi.fn(async () => sse(part(JSON.stringify(obj), 1, true))))

  it('new cards go through the deck parser, get fresh keys and the Generated topic', async () => {
    const { moreLikeThis } = await import('./actions')
    reply({ format: 'mneme.deck', deck: { title: 'x' }, topics: [{ id: 'generated', name: 'Generated' }], terms: [], questions: [
      { id: 'a', type: 'true_false', topic: 'generated', prompt: 'The median ignores outliers.', answer: true, explanation: 'It only uses the middle.', difficulty: 1 },
      { id: 'b', type: 'scenario', topic: 'generated', prompt: 'Data: 1, 2, 100', explanation: 'e', difficulty: 2, questions: [
        { id: 'p1', type: 'numeric', prompt: 'Median?', answer: 2, tolerance: 0, explanation: 'e', difficulty: 1 },
        { id: 'p2', type: 'true_false', prompt: 'Mean > median?', answer: true, explanation: 'e', difficulty: 1 }] },
    ] })
    const items = await moreLikeThis('k', deck, { kind: 'term', key: 'm', topic: 't', term: 'Median', definition: 'Middle value', aliases: [] })
    expect(items.map((i) => i.topic)).toEqual(['generated', 'generated'])
    expect(items[0].key).toMatch(/^gen-\w+-0$/)
    const sc = items[1] as Extract<typeof items[number], { qtype: 'scenario' }>
    expect(sc.parts.map((p) => p.key)).toEqual([`${sc.key}--p1`, `${sc.key}--p2`])
  })

  it('grading reads Gemini’s verdict, and anything but true is wrong', async () => {
    const { gradeTyped } = await import('./actions')
    const ex = { kind: 'typed', key: 'q', prompt: 'Median of 1, 3, 9?', promptKind: 'question', answers: ['3'], item: { kind: 'question', key: 'q', topic: 't', qtype: 'short_answer', prompt: 'Median of 1, 3, 9?', answer: '3', accept: [], explanation: '', difficulty: 1 } } as never
    reply({ right: true, why: 'Three is 3.' })
    expect(await gradeTyped('k', deck, ex, { kind: 'text', value: 'three' })).toEqual({ right: true, why: 'Three is 3.' })
    reply({ right: 'yes' })
    expect((await gradeTyped('k', deck, ex, { kind: 'text', value: '9' })).right).toBe(false)
  })
})

describe('handwriting to text', () => {
  it('writes maths lines as equations and $…$ in a line as inline maths', async () => {
    const { linesToDoc } = await import('./transcribe')
    expect(linesToDoc([{ text: 'Area is $\pi r^2$ here' }, { math: true, text: '$$E = mc^2$$' }, { text: '  ' }])).toEqual({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Area is ' }, { type: 'inlineMath', attrs: { latex: '\pi r^2' } }, { type: 'text', text: ' here' }] },
      { type: 'equation', attrs: { latex: 'E = mc^2' } },
    ] })
    expect(linesToDoc([])).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
  })
})
