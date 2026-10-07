// Gemini, called straight from the browser with the user's own key. The key goes to Google and nowhere
// else. Flash first; if its free-tier limit is hit before anything came back, Flash-Lite instead.

export const MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'] as const
const API = 'https://generativelanguage.googleapis.com/v1beta/models'

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } }
export type Turn = { role: 'user' | 'model'; parts: Part[] }
export type Ask = {
  system?: string
  contents: Turn[]
  /** Ask for JSON back (parsed by the caller). */
  json?: boolean
}
export type Reply = { text: string; tokens: number }

export class AiError extends Error {
  constructor(message: string, readonly kind: 'key' | 'quota' | 'blocked' | 'net' | 'other') { super(message) }
}

/** A readable error for a failed response. */
export function errorFor(status: number, body: string): AiError {
  if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED/.test(body) || status === 401 || status === 403)
    return new AiError('Google didn’t accept this key. Check it in Settings → AI.', 'key')
  if (status === 429) return new AiError('Your free Gemini limit is used up for now. Try again in a minute.', 'quota')
  if (status >= 500) return new AiError('Gemini is having trouble right now. Try again.', 'net')
  const msg = /"message":\s*"([^"]+)"/.exec(body)?.[1]
  return new AiError(msg ? `Gemini said: ${msg}` : `Gemini returned an error (${status}).`, 'other')
}

/** Text and token count from one streamed chunk (`data: {...}` line). Throws if the reply was blocked. */
export function readChunk(json: string): { text: string; tokens?: number; done?: boolean } {
  const c = JSON.parse(json)
  if (c.promptFeedback?.blockReason) throw new AiError('Gemini wouldn’t answer that.', 'blocked')
  const cand = c.candidates?.[0]
  const text = (cand?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? '').join('')
  if (!text && cand?.finishReason === 'SAFETY') throw new AiError('Gemini wouldn’t answer that.', 'blocked')
  return { text, tokens: c.usageMetadata?.promptTokenCount, done: !!cand?.finishReason }
}

const body = (a: Ask) => JSON.stringify({
  ...(a.system ? { systemInstruction: { parts: [{ text: a.system }] } } : {}),
  contents: a.contents,
  // Low thinking: a few seconds instead of fifteen for a study question.
  generationConfig: { thinkingConfig: { thinkingLevel: 'low' }, ...(a.json ? { responseMimeType: 'application/json' } : {}) },
})

/** Streams a reply. `onText` gets the whole text so far after each chunk. */
export async function ask(key: string, a: Ask, { signal, onText }: { signal?: AbortSignal; onText?: (sofar: string) => void } = {}): Promise<Reply> {
  for (const [i, model] of MODELS.entries()) {
    let res: Response
    try {
      res = await fetch(`${API}/${model}:streamGenerateContent?alt=sse`, {
        method: 'POST', signal, body: body(a),
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      })
    } catch (e) {
      if (signal?.aborted) throw e
      throw new AiError('Couldn’t reach Gemini. Check your connection.', 'net')
    }
    if (!res.ok) {
      const err = errorFor(res.status, await res.text())
      if (err.kind === 'quota' && i < MODELS.length - 1) continue
      throw err
    }
    let text = '', tokens = 0, buf = '', finished = false
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += value
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        const c = readChunk(line.slice(5))
        text += c.text
        tokens = c.tokens ?? tokens
        finished ||= !!c.done
        if (c.text) onText?.(text)
      }
    }
    if (!text.trim()) throw new AiError('Gemini sent back an empty answer. Try again.', 'other')
    // The stream can close early without saying why; an answer without its finish marker is cut off.
    if (!finished) throw new AiError('Gemini’s answer was cut off. Try again.', 'net')
    return { text, tokens }
  }
  throw new AiError('Your free Gemini limit is used up for now. Try again in a minute.', 'quota')
}

/** Asks for JSON and reads it with `read` (which throws if it's unusable). One quiet retry for a garbled or cut-off answer. */
export async function askJson<T>(key: string, a: Omit<Ask, 'json'>, read: (text: string) => T = (t) => JSON.parse(t.replace(/^```(?:json)?\s*|\s*```$/g, '')) as T, signal?: AbortSignal): Promise<T> {
  for (let tries = 2; ; tries--) {
    try { return read((await ask(key, { ...a, json: true }, { signal })).text) }
    catch (e) {
      const retry = !(e instanceof AiError) || (e.kind === 'net' && e.message.includes('cut off'))
      if (!retry || tries <= 1 || signal?.aborted) throw e instanceof AiError ? e : new AiError('Gemini’s answer came back garbled. Try again.', 'other')
    }
  }
}

/** Is this key accepted? Lists models, which costs nothing against the free limit. */
export async function checkKey(key: string): Promise<void> {
  let res: Response
  try { res = await fetch(`${API}?pageSize=1`, { headers: { 'x-goog-api-key': key } }) }
  catch { throw new AiError('Couldn’t reach Google. Check your connection.', 'net') }
  if (!res.ok) throw errorFor(res.status, await res.text())
}
