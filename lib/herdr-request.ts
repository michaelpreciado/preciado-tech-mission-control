import { HerdrError } from './herdr-bridge'

export async function readHerdrRequest(req: Request): Promise<Record<string, unknown>> {
  const length = Number(req.headers.get('content-length'))
  if (length > 40_000) throw new HerdrError('Request too large', 413)
  const reader = req.body?.getReader()
  if (!reader) throw new HerdrError('Request body is required', 400)
  let size = 0
  let text = ''
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 40_000) { await reader.cancel(); throw new HerdrError('Request too large', 413) }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
  } finally { reader.releaseLock() }
  let body: unknown
  try { body = JSON.parse(text) } catch { throw new HerdrError('Invalid JSON', 400) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HerdrError('Invalid request', 400)
  return body as Record<string, unknown>
}
