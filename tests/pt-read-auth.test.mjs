import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { isReadAuthorized } from '../lib/pt/read-auth.ts'
import { createSessionToken, SESSION_COOKIE } from '../lib/session.ts'

// Isolate source readers: exercise real GET handlers without opening host stores.
const sourceStubs = {
  '@/lib/config': 'export const getConfig = () => ({ paths: { vaultDir: "fixture-vault" } });',
  '@/lib/vault-docs': 'export const scanVaultDocs = async () => []; export const collectVaultClientDocs = async () => [];',
  '@/lib/pipeline-data': 'export const pipelineStore = () => new URL("./pt-parity/pipeline.json", import.meta.url); export const upsertLead = () => { throw Error("Unexpected mutation"); };',
  '@/lib/heartbeats': 'export const getHeartbeats = () => []; export const recordHeartbeat = () => { throw Error("Unexpected mutation"); };',
}
// Resolve the fixture URL before encoding the stub as a data URL.
sourceStubs['@/lib/pipeline-data'] = sourceStubs['@/lib/pipeline-data'].replace('new URL("./pt-parity/pipeline.json", import.meta.url)', `new URL(${JSON.stringify(new URL('./pt-parity/pipeline.json', import.meta.url).href)})`)
registerHooks({ resolve(specifier, context, nextResolve) {
  if (sourceStubs[specifier] && context.parentURL?.includes('/app/api/')) {
    return { url: `data:text/javascript,${encodeURIComponent(sourceStubs[specifier])}`, shortCircuit: true }
  }
  if (specifier.startsWith('@/')) return { url: new URL('../' + specifier.slice(2) + '.ts', import.meta.url).href, shortCircuit: true }
  if (specifier === 'next/server') return nextResolve('next/server.js', context)
  return nextResolve(specifier, context)
} })

// Synthetic credentials exist in process memory only; no real env files are read.
process.env.INTERNAL_API_SECRET = 'pt-service-fixture-only'
process.env.MC_SESSION_SECRET = 'pt-session-fixture-only'
process.env.MC_AUTH_PASSWORD = 'pt-password-fixture-only'
delete process.env.MC_TRUSTED_PROXIES
delete process.env.FRIDAY_TRUSTED_IPS

const { NextRequest } = await import('next/server')
const paths = ['vault', 'pipeline/review', 'agents/heartbeat', 'auth/check']
const handlers = await Promise.all(paths.map(path => import(`../app/api/${path}/route.ts`)))
const pipeline = JSON.parse(readFileSync(new URL('./pt-parity/pipeline.json', import.meta.url)))
function request(path, headers = {}, cookie, method = 'GET') {
  const h = new Headers(headers)
  if (cookie) h.set('cookie', `${SESSION_COOKIE}=${cookie}`)
  return new NextRequest(`http://fixture.invalid/api/${path}?lead_id=${pipeline.leads[0].id}`, { headers: h, method })
}

for (const row of JSON.parse(readFileSync(new URL('./pt-parity/denied-auth.json', import.meta.url))).cases) {
  test(`private GET denied: ${row.id}`, async () => {
    for (const [i, path] of paths.entries()) {
      const req = request(path, row.headers, row.cookie)
      assert.equal(await isReadAuthorized(req), false)
      const response = await handlers[i].GET(req)
      if (path === 'auth/check') assert.equal((await response.json()).ok, false)
      else assert.equal(response.status, row.expectedStatus, path)
    }
  })
}

for (const mode of ['session', 'tailnet', 'tailnet-session', 'bearer']) {
  test(`all four GETs accept ${mode}`, async () => {
    const headers = { 'x-forwarded-for': mode.startsWith('tailnet') ? '100.79.84.9' : '203.0.113.19' }
    if (mode === 'bearer') headers.authorization = `Bearer ${process.env.INTERNAL_API_SECRET}`
    const cookie = mode.includes('session') ? await createSessionToken() : undefined
    for (const [i, path] of paths.entries()) {
      const response = await handlers[i].GET(request(path, headers, cookie))
      assert.equal(response.status, 200, path)
      const body = await response.json()
      if (path === 'auth/check') assert.equal(body.ok, true)
      if (path === 'pipeline/review') assert.equal(body.id, pipeline.leads[0].id)
    }
  })
}

test('tailnet boundaries, trusted custom ranges and proxy chains', async () => {
  for (const ip of ['100.64.0.0', '100.127.255.255', '127.0.0.1', '::1', '192.168.1.9']) {
    assert.equal(await isReadAuthorized(request('vault', { 'x-forwarded-for': ip })), true, ip)
  }
  for (const ip of ['100.63.255.255', '100.128.0.0']) {
    assert.equal(await isReadAuthorized(request('vault', { 'x-forwarded-for': ip })), false, ip)
  }
  process.env.FRIDAY_TRUSTED_IPS = '198.51.100.0/24'
  process.env.MC_TRUSTED_PROXIES = '192.0.2.2'
  try {
    assert.equal(await isReadAuthorized(request('vault', { 'x-forwarded-for': '198.51.100.7' })), true)
    assert.equal(await isReadAuthorized(request('vault', { 'x-forwarded-for': '100.79.84.9, 192.0.2.2' })), true)
    assert.equal(await isReadAuthorized(request('vault', { 'x-forwarded-for': '203.0.113.19, 192.0.2.2' })), false)
  } finally { delete process.env.FRIDAY_TRUSTED_IPS; delete process.env.MC_TRUSTED_PROXIES }
})

test('expired and tampered sessions are denied', async () => {
  const exp = Math.floor(Date.now() / 1000) - 60
  const payload = `v1.${exp}.Zml4dHVyZQ==`
  const signature = createHmac('sha256', `friday-session-v1:${process.env.MC_SESSION_SECRET}`).update(payload).digest('base64').replaceAll('+', '-').replaceAll('/', '_')
  const valid = await createSessionToken()
  for (const cookie of [`${payload}.${signature}`, valid.replace('v1.', 'v2.')]) {
    assert.equal(await isReadAuthorized(request('vault', { 'x-forwarded-for': '203.0.113.19' }, cookie)), false)
  }
})

test('unset secrets do not open private GETs', async () => {
  const saved = ['MC_AUTH_PASSWORD', 'MC_SESSION_SECRET', 'INTERNAL_API_SECRET'].map(key => [key, process.env[key]])
  try {
    for (const [key] of saved) delete process.env[key]
    for (const [i, path] of paths.entries()) {
      const response = await handlers[i].GET(request(path))
      if (path === 'auth/check') assert.deepEqual(await response.json(), { ok: false, authEnabled: false })
      else assert.equal(response.status, 401)
    }
  } finally { for (const [key, value] of saved) process.env[key] = value }
})

test('valid read session does not authorize mutation; same-origin gates still reject', async () => {
  const cookie = await createSessionToken()
  for (const index of [1, 2]) {
    const path = paths[index]
    const denied = await handlers[index].POST(request(path, { 'x-forwarded-for': '203.0.113.19' }, cookie, 'POST'))
    assert.equal(denied.status, 401)
    const crossOrigin = await handlers[index].POST(request(path, { 'host': 'fixture.invalid', 'origin': 'http://other.invalid', 'x-forwarded-for': '127.0.0.1' }, undefined, 'POST'))
    assert.equal(crossOrigin.status, 403)
  }
})
