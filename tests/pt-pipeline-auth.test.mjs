import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { unavailablePipeline, radarEnvelope, normalizePipeline } from '../lib/pt/pipeline.ts'
import { compatibleEnvelope } from '../lib/pt/presentation-state.mjs'
import { createSessionToken, SESSION_COOKIE } from '../lib/session.ts'
let reads = 0, fail = false
const legacy = { leads: [], stats: { count: 0 } }
const radar = radarEnvelope({ ok: true, store: normalizePipeline({ leads: [] }) })
globalThis.__lane07Pipeline = {
  unavailablePipeline,
  collectPipelineRadar: async () => { reads++; if (fail) throw Error('private-path-canary'); return radar },
  collectPipeline: async () => { reads++; if (fail) throw Error('private-path-canary'); return legacy },
  pipelineStore: () => { throw Error('mutation forbidden') }, upsertLead: () => { throw Error('mutation forbidden') },
}
registerHooks({ resolve(specifier, context, nextResolve) {
  if (['@/lib/pt/pipeline', '@/lib/pipeline-data'].includes(specifier)) return { url: 'data:text/javascript,export const {unavailablePipeline,collectPipelineRadar,collectPipeline,pipelineStore,upsertLead}=globalThis.__lane07Pipeline;', shortCircuit: true }
  if (specifier.startsWith('@/')) return { url: new URL('../' + specifier.slice(2) + '.ts', import.meta.url).href, shortCircuit: true }
  if (specifier === 'next/server') return nextResolve('next/server.js', context)
  return nextResolve(specifier, context)
} })
process.env.INTERNAL_API_SECRET = 'lane07-service-fixture'
process.env.MC_SESSION_SECRET = 'lane07-session-fixture'
process.env.MC_AUTH_PASSWORD = 'lane07-password-fixture'
delete process.env.MC_TRUSTED_PROXIES; delete process.env.FRIDAY_TRUSTED_IPS
const { NextRequest } = await import('next/server')
const { GET } = await import('../app/api/pipeline/route.ts')
for (const view of ['', '?view=revenue', '?view=radar']) {
  test(`pipeline ${view || 'default'} 401 is E<T> before any source read`, async () => {
    for (const headers of [{}, { authorization: 'Bearer wrong', 'x-forwarded-for': '203.0.113.8' }]) {
      const before = reads, response = await GET(new NextRequest('http://fixture.invalid/api/pipeline' + view, { headers }))
      const body = await response.json()
      assert.equal(response.status, 401); assert.equal(reads, before)
      assert.ok(compatibleEnvelope(body)); assert.equal(body.data, null)
      assert.equal(body.errors[0].code, 'access_denied'); assert.equal(body.sources[0].blocked, true)
      assert.equal(response.headers.get('cache-control'), 'no-store')
    }
  })
  test(`pipeline ${view || 'default'} failure is a safe E<T>`, async () => {
    fail = true
    try {
      const response = await GET(new NextRequest('http://fixture.invalid/api/pipeline' + view, { headers: { authorization: 'Bearer lane07-service-fixture' } }))
      const body = await response.json()
      assert.equal(response.status, 503); assert.ok(compatibleEnvelope(body)); assert.equal(body.data, null)
      assert.equal(body.sources[0].freshness, 'error'); assert.equal(body.errors[0].code, 'read_failed')
      assert.doesNotMatch(JSON.stringify(body), /private-path-canary|lane07-service-fixture/)
    } finally { fail = false }
  })
  test(`pipeline ${view || 'default'} preserves bearer, trusted-IP/wrong-bearer and session reads`, async () => {
    for (const headers of [{ authorization: 'Bearer lane07-service-fixture' }, { 'x-forwarded-for': '100.79.84.9', authorization: 'Bearer wrong' }, { cookie: `${SESSION_COOKIE}=${await createSessionToken()}` }]) {
      const response = await GET(new NextRequest('http://fixture.invalid/api/pipeline' + view, { headers }))
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), view === '?view=radar' ? radar : legacy)
    }
  })
}
