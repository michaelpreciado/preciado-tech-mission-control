import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import { createSessionToken, SESSION_COOKIE } from '../lib/session.ts'
const fixture = file => JSON.parse(fs.readFileSync(new URL('./pt-parity/' + file, import.meta.url), 'utf8'))[0].envelope
let reads = 0, fail = false
const collect = file => { reads++; if (fail) throw Error('private-file-path-must-not-leak'); return fixture(file) }
globalThis.__commandsRouteFixture = { collectPipelineRadar: async () => collect('radar-envelopes.json'), collectCrew: () => collect('crew-envelopes.json') }
registerHooks({ resolve(specifier, context, nextResolve) {
  if (['@/lib/pt/pipeline', '@/lib/pt/crew-read'].includes(specifier)) return { url: 'data:text/javascript,export const {collectPipelineRadar,collectCrew}=globalThis.__commandsRouteFixture;', shortCircuit: true }
  if (specifier.startsWith('@/')) return { url: new URL('../' + specifier.slice(2) + '.ts', import.meta.url).href, shortCircuit: true }
  if (specifier === 'next/server') return nextResolve('next/server.js', context)
  return nextResolve(specifier, context)
} })
process.env.INTERNAL_API_SECRET = 'commands-fixture-secret'
process.env.MC_SESSION_SECRET = 'commands-fixture-session'
process.env.MC_AUTH_PASSWORD = 'commands-fixture-password'
delete process.env.MC_TRUSTED_PROXIES; delete process.env.FRIDAY_TRUSTED_IPS
const { NextRequest } = await import('next/server')
const { GET } = await import('../app/api/commands/route.ts')
for (const headers of [{}, { 'x-forwarded-for': '203.0.113.8' }, { authorization: 'Bearer wrong' }]) test('commands denies before reads with E<T>', async () => {
  const before = reads
  const response = await GET(new NextRequest('http://fixture.invalid/api/commands', { headers }))
  assert.equal(response.status, 401); assert.equal(reads, before)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const body = await response.json()
  assert.equal(body.schemaVersion, 1); assert.equal(body.data, null)
  assert.equal(body.sources[0].blocked, true); assert.equal(body.errors[0].code, 'access_denied')
})
for (const mode of ['bearer', 'tailnet', 'session']) test(`commands accepts ${mode} and returns four safe destinations`, async () => {
  const headers = { 'x-forwarded-for': mode === 'tailnet' ? '100.79.84.9' : '203.0.113.8' }
  if (mode === 'bearer') headers.authorization = 'Bearer commands-fixture-secret'
  if (mode === 'session') headers.cookie = `${SESSION_COOKIE}=${await createSessionToken()}`
  const before = reads, response = await GET(new NextRequest('http://fixture.invalid/api/commands', { headers }))
  assert.equal(response.status, 200); assert.equal(reads, before + 2)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const body = await response.json()
  assert.deepEqual(body.data.commands.map(c => c.id), ['pipeline', 'crew', 'command', 'deliverables'])
  assert.deepEqual(Object.keys(body.data.referencedSnapshots), ['pipeline', 'crew'])
  assert.doesNotMatch(JSON.stringify(body), /fixture-secret|shell|exec|argv|ticker|private-file/)
})
test('unexpected projection failure remains a safe E<T> response', async () => {
  fail = true
  try {
    const response = await GET(new NextRequest('http://fixture.invalid/api/commands', { headers: { authorization: 'Bearer commands-fixture-secret' } }))
    assert.equal(response.status, 503)
    const body = await response.json()
    assert.equal(body.data, null); assert.equal(body.errors[0].code, 'read_failed')
    assert.doesNotMatch(JSON.stringify(body), /private-file/)
  } finally { fail = false }
})
