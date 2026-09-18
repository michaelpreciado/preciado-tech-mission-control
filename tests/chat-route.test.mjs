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

/* ── per-turn model override ─────────────────────────────────────────────── */

test('hermes adapter carries a picked model into argv, and omits it when unpicked', async () => {
  const { adapters } = await import('../lib/agent-adapters.ts')
  assert.deepEqual(
    adapters.hermes.args({ message: 'hi', session: 's1', model: 'deepseek/deepseek-v4-flash', provider: 'openrouter' }),
    ['-m', 'deepseek/deepseek-v4-flash', '--provider', 'openrouter', '--continue', 's1', '-z', 'hi', '--cli'],
  )
  // The create-shape invocation takes the same flags ahead of the subcommand.
  assert.deepEqual(
    adapters.hermes.args({ message: 'hi', session: 's1', createSession: true, model: 'm/x' }),
    ['-m', 'm/x', 'chat', '--continue', 's1', '--create-if-missing', '-Q', '--query-file', '-'],
  )
  // A first turn without a pick still uses the canonical quiet query-file lane.
  assert.deepEqual(adapters.hermes.args({ message: 'hi', session: 's1', createSession: true }), ['chat', '--continue', 's1', '--create-if-missing', '-Q', '--query-file', '-'])
  // Follow-up without a pick remains the top-level Hermes one-shot lane.
  assert.deepEqual(adapters.hermes.args({ message: 'hi', session: 's1' }), ['--continue', 's1', '-z', 'hi', '--cli'])
})

test('follow-up Hermes argv carries the model and provider before the top-level lane', async () => {
  const { adapters } = await import('../lib/agent-adapters.ts')
  assert.deepEqual(adapters.hermes.args({ message: 'next', session: 's1', model: 'gemma4:12b', provider: 'ollama' }), [
    '-m', 'gemma4:12b', '--provider', 'ollama', '--continue', 's1', '-z', 'next', '--cli',
  ])
})

test('first-turn model argv uses the canonical quiet query-file lane', async () => {
  const { adapters } = await import('../lib/agent-adapters.ts')
  assert.deepEqual(adapters.hermes.args({ message: 'hello', session: 's1', createSession: true, model: 'nemotron-3-ultra-free', provider: 'opencode-free' }), [
    '-m', 'nemotron-3-ultra-free', '--provider', 'opencode-free', 'chat', '--continue', 's1', '--create-if-missing', '-Q', '--query-file', '-',
  ])
})

test('502 exposes a bounded sanitized CLI stderr tail', async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const { resetConfigCache } = await import('../lib/config.ts')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-chat-failure-'))
  const command = path.join(dir, 'cli.mjs')
  fs.writeFileSync(command, '#!/bin/sh\nif [ "$1" = "--version" ]; then exit 0; fi\nprintf "%s\\n" "OPENROUTER_API_KEY=do-not-return /home/mp/private/provider.json" "provider refused request" "provider refused request" "provider refused request" >&2\nexit 1\n', { mode: 0o700 })
  const previous = process.env.FRIDAY_CHAT_COMMAND
  process.env.FRIDAY_CHAT_COMMAND = command
  resetConfigCache()
  try {
    const response = await POST(request({ message: 'hello', session: 'chat-failure-test' }))
    assert.equal(response.status, 502)
    const body = await response.json()
    assert.match(body.error, /provider refused request/)
    assert.equal(body.error.length <= 380, true)
    assert.doesNotMatch(body.error, /do-not-return|\/home\/mp\/private/)
    assert.equal(body.detail, body.error.replace(/^agent run failed — /, ''))
  } finally {
    if (previous === undefined) delete process.env.FRIDAY_CHAT_COMMAND
    else process.env.FRIDAY_CHAT_COMMAND = previous
    resetConfigCache()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('model override is charset-checked and refused for agents that cannot take it', async () => {
  assert.equal((await POST(request({ message: 'hello', model: 'bad model!' }))).status, 400)
  assert.equal((await POST(request({ message: 'hello', model: 'ok-model', provider: 'BAD PROVIDER' }))).status, 400)
  assert.equal((await POST(request({ agent: 'pi', message: 'hello', model: 'vendor/model' }))).status, 400)
  assert.equal((await POST(request({ agent: 'codex', message: 'hello', provider: 'openrouter' }))).status, 400)
  const empty = await POST(request({ message: 'hello', model: '' }))
  assert.notEqual(empty.status, 400)
})
