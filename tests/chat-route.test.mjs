import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { withAgentFlight } from '../lib/agent-adapters.ts'
// Resolve the app alias and Next's bundler-style entry for this route test only.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) return { url: new URL('../' + specifier.slice(2) + '.ts', import.meta.url).href, shortCircuit: true }
  if (specifier === 'next/server') return nextResolve('next/server.js', context)
  return nextResolve(specifier, context)
} })
const { POST } = await import('../app/api/chat/route.ts')
const request = body => new Request('http://localhost/api/chat', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost' }, body: JSON.stringify(body),
})

test('chat route rejects unknown agents before CLI execution', async () => {
  assert.equal((await POST(request({ agent: 'invalid', message: 'hello' }))).status, 400)
  assert.equal((await POST(request({ agent: 'pi', message: 'hello', session: '../../secret' }))).status, 400)
  assert.equal((await POST(request({ agent: 'codex', message: 'hello', session: 'fake' }))).status, 400)
})

test('POST defaults to Hermes, preserves its session fallback, and returns busy-map 409', async () => {
  const { resetConfigCache } = await import('../lib/config.ts')
  const previous = process.env.FRIDAY_CHAT_COMMAND
  process.env.FRIDAY_CHAT_COMMAND = '/usr/bin/true'
  resetConfigCache()
  let release
  const held = withAgentFlight('hermes', () => new Promise(resolve => { release = resolve }))
  try {
    assert.equal((await POST(request({ message: 'hello' }))).status, 409)
    release()
    await held
    const response = await POST(request({ message: 'hello' }))
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.agent, 'hermes')
    assert.equal(body.session, 'friday-dashboard')
    assert.equal(body.reply, '(no output)')
  } finally {
    release()
    await held
    if (previous === undefined) delete process.env.FRIDAY_CHAT_COMMAND
    else process.env.FRIDAY_CHAT_COMMAND = previous
    resetConfigCache()
  }
})

test('existing message length and same-origin gates still apply', async () => {
  assert.equal((await POST(request({ message: 'x'.repeat(4001) }))).status, 400)
  const foreign = new Request('http://localhost/api/chat', { method: 'POST', headers: { host: 'localhost', origin: 'https://elsewhere.invalid' }, body: '{"message":"hi"}' })
  assert.equal((await POST(foreign)).status, 403)
})
