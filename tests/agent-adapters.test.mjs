import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { adapters, selectAgent, withAgentFlight, isAgentBusy } from '../lib/agent-adapters.ts'
import { resolveChatAgents } from '../lib/config.ts'
import { piSessionDir, readPiSessions } from '../lib/pi-sessions.ts'

test('adapter selection defaults only missing agent to Hermes and rejects unknown values', () => {
  assert.equal(selectAgent(undefined), 'hermes')
  for (const id of ['hermes', 'pi', 'codex']) assert.equal(selectAgent(id), id)
  for (const bad of [null, '', 'bash', {}, 0]) assert.equal(selectAgent(bad), null)
  const input = { message: '$(touch /tmp/nope); --help', session: 'native-id' }
  assert.deepEqual(adapters.hermes.args(input), ['--continue', 'native-id', '-z', input.message, '--cli'])
  assert.deepEqual(adapters.hermes.args({ ...input, profile: 'jarvis', createSession: true }), ['--profile', 'jarvis', 'chat', '--continue', 'native-id', '--create-if-missing', '-q', input.message, '--oneshot', '--cli', '-Q'])
  assert.deepEqual(adapters.pi.args(input), ['--session-dir', piSessionDir(), '--session-id', 'native-id', '-p', '--', input.message])
  assert.deepEqual(adapters.codex.args(input), ['exec', '--', input.message])
  assert.equal(adapters.codex.continuity, false)
  assert.equal(adapters.pi.parseReply(' OK\n', 'warnings'), 'OK')
  assert.throws(() => adapters.pi.parseReply('', 'startup warning'), /Pi returned no reply/)
})

test('Pi sender and reader share an absolute custom session directory', () => {
  const previous = process.env.PI_CODING_AGENT_SESSION_DIR
  process.env.PI_CODING_AGENT_SESSION_DIR = 'data/pi sessions'
  try {
    assert.equal(piSessionDir(), path.resolve('data/pi sessions'))
    const args = adapters.pi.args({ message: '--help; $(echo unsafe)', session: 'native-id' })
    assert.equal(args[1], piSessionDir())
    assert.deepEqual(args.slice(-2), ['--', '--help; $(echo unsafe)'])
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_SESSION_DIR
    else process.env.PI_CODING_AGENT_SESSION_DIR = previous
  }
})

test('agent config is backward compatible and rejects malformed or duplicate entries', () => {
  assert.deepEqual(resolveChatAgents(undefined, '/bin/hermes'), [{ id: 'hermes', command: '/bin/hermes', enabled: true }])
  assert.deepEqual(resolveChatAgents([
    null, { id: 'invalid', command: 'sh', enabled: true },
    { id: 'pi', command: 'pi', enabled: 'yes' },
    { id: 'pi', command: '/bin/pi', enabled: true },
    { id: 'pi', command: 'bad', enabled: false },
    { id: 'codex', command: ' ', enabled: true },
    { id: 'hermes', command: 'replacement', enabled: true },
  ], 'legacy'), [{ id: 'hermes', command: 'replacement', enabled: true }, { id: 'pi', command: '/bin/pi', enabled: true }])
})

test('busy map gives 409 only for the same agent, and releases success and failure', async () => {
  let release
  const held = withAgentFlight('pi', () => new Promise(resolve => { release = resolve }))
  assert.equal(isAgentBusy('pi'), true)
  assert.equal((await withAgentFlight('pi', async () => assert.fail('must not execute'))).status, 409)
  assert.deepEqual(await withAgentFlight('hermes', async () => 'OK'), { status: 200, value: 'OK' })
  release('done')
  await held
  assert.equal(isAgentBusy('pi'), false)
  await assert.rejects(withAgentFlight('pi', async () => { throw new Error('failed') }), /failed/)
  assert.equal(isAgentBusy('pi'), false)
})

test('Pi native sessions expose IDs and text messages, tolerating partial writes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-pi-test-'))
  try {
    fs.writeFileSync(path.join(dir, 'session.jsonl'), [
      { type: 'session', id: 'test-id', timestamp: '2026-09-13T00:00:00Z' },
      null,
      42,
      { type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'Remember blue' }], timestamp: 10 } },
      { type: 'message', message: { role: 'assistant', content: [null, { type: 'thinking', thinking: 'private' }, { type: 'text', text: 'OK' }], timestamp: 20 } },
    ].map(JSON.stringify).join('\n') + '\n{"unfinished":')
    const [session] = readPiSessions(dir)
    assert.equal(session.conversation.agent, 'pi')
    assert.equal(session.conversation.id, 'test-id')
    assert.equal(session.conversation.title, 'Remember blue')
    assert.equal(session.messages[1].content, 'OK')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('one-shot CLI closes stdin so Pi can finish reading redirected input', async () => {
  const { sendAgent } = await import('../lib/agent-adapters.ts')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-cli-test-'))
  try {
    const command = path.join(dir, 'cli.mjs')
    fs.writeFileSync(command, '#!/usr/bin/env node\nprocess.stdin.resume(); process.stdin.on("end", () => console.log("OK"));\n', { mode: 0o700 })
    assert.equal(await sendAgent('pi', command, { message: 'hello', session: 'test' }, 3000), 'OK')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
