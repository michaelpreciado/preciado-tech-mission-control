import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { DatabaseSync } from 'node:sqlite'

// Keep the collector on synthetic files and omit unrelated cron collection.
registerHooks({ resolve(specifier, context, nextResolve) {
  let source
  if (context.parentURL?.endsWith('/lib/collectors/bots.ts')) {
    if (specifier === '../config') source = 'export const getConfig = () => globalThis.__ptBotFixtureConfig;'
    if (specifier === './cron') source = 'export const collectCron = async () => [];'
  }
  if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true }
  return nextResolve(specifier, context)
} })
const { collectBots, toBotStatus } = await import('../lib/collectors/bots.ts')

const hidden = { telegramToken: 'secret-sentinel', canonicalSessionId: 'session-sentinel', sessionId: 'session-sentinel', session_id: 'session-sentinel' }
test('status allowlist excludes unexpected sensitive fields at every nested level', () => {
  const status = toBotStatus({
    name: 'fixture', isDefault: false, model: 'fixture/model', sessions: 1, messages: 2,
    lastActiveAt: 123, canonicalLastActiveAt: 123, routineCount: 1, avatarInitial: 'F',
    gateway: { status: 'running', detail: 'running', ...hidden,
      platforms: [{ name: 'telegram', state: 'connected', needsAttention: false, ...hidden }] },
    routines: [{ id: 'routine-1', name: '[bot:fixture] sample', routine: 'sample', enabled: true, schedule: 'daily', cadence: 'daily', ...hidden }],
    ...hidden,
  })
  assert.doesNotMatch(JSON.stringify(status), /telegramToken|canonicalSessionId|sessionId|session_id|secret-sentinel|session-sentinel/)
  assert.equal(status.sessions, 1)
  assert.equal(status.routines[0].id, 'routine-1')
  assert.equal(status.gateway.platforms[0].state, 'connected')
})

test('actual collector omits session identifiers and never opens profile token files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-bots-status-'))
  const profile = path.join(dir, 'profiles', 'fixture')
  fs.mkdirSync(profile, { recursive: true })
  const file = path.join(profile, 'state.db')
  const db = new DatabaseSync(file)
  db.exec(`
    CREATE TABLE sessions (id TEXT, title TEXT, archived INTEGER, started_at REAL, message_count INTEGER, model TEXT);
    CREATE TABLE messages (session_id TEXT, timestamp REAL);
    INSERT INTO sessions VALUES ('session-sentinel', 'Bot Chat', 0, 1700000000, 1, 'fixture/model');
    INSERT INTO messages VALUES ('session-sentinel', 1700000001);
  `)
  db.close()
  fs.writeFileSync(path.join(profile, '.env'), 'TELEGRAM_BOT_TOKEN=secret-sentinel\n')
  fs.writeFileSync(path.join(profile, 'gateway_state.json'), JSON.stringify({ gateway_state: 'running', ...hidden,
    platforms: { telegram: { state: 'connected', needs_attention: false, ...hidden } } }))
  globalThis.__ptBotFixtureConfig = { paths: { gatewayStateFile: path.join(profile, 'gateway_state.json') }, chat: { profiles: ['fixture'] } }
  const originalRead = fs.readFileSync
  let tokenReads = 0
  fs.readFileSync = function (file, ...rest) {
    if (String(file).endsWith('/.env')) { tokenReads++; throw new Error('Token file must not be read') }
    return originalRead.call(this, file, ...rest)
  }
  try {
    const dto = await collectBots(true)
    assert.equal(dto.bots.length, 1)
    assert.equal(dto.bots[0].model, 'fixture/model')
    assert.equal(dto.bots[0].canonicalLastActiveAt, 1700000001000)
    assert.equal(tokenReads, 0)
    assert.doesNotMatch(JSON.stringify(dto), /telegramToken|canonicalSessionId|sessionId|session_id|secret-sentinel|session-sentinel/)
  } finally {
    fs.readFileSync = originalRead
    delete globalThis.__ptBotFixtureConfig
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
