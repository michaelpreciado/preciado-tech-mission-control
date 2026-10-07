import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import { registerHooks } from 'node:module'
import { deliverablesFixture } from './helpers/deliverables-fixture.mjs'
import * as owner from '../lib/pt/deliverables.ts'
import { sha256 } from '../lib/pt/artifact-files.ts'
import { contentPath } from '../lib/pt/deliverables-display.mjs'
import { collect, collectContent, displaySnapshot } from '../../desktop/mp.preciadoTech.deliverables/collector.mjs'
import { createSessionToken, SESSION_COOKIE } from '../lib/session.ts'
const fixture = await deliverablesFixture()
after(() => fs.rm(fixture.temp, { recursive: true, force: true }))
let reads = 0
globalThis.__deliverablesRoute = { ...owner,
  collectDeliverables: () => { reads++; return owner.collectDeliverables({ ...fixture.options, now: new Date().toISOString() }) },
  readDeliverable: (id, revision, evidence) => { reads++; return owner.readDeliverable(id, revision, evidence, { ...fixture.options, now: new Date().toISOString() }) },
}
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === '@/lib/pt/deliverables') return { url: 'data:text/javascript,export const {collectDeliverables,readDeliverable,unavailableDeliverables}=globalThis.__deliverablesRoute;', shortCircuit: true }
  if (specifier.startsWith('@/')) return { url: new URL('../' + specifier.slice(2) + '.ts', import.meta.url).href, shortCircuit: true }
  if (specifier === 'next/server') return nextResolve('next/server.js', context)
  return nextResolve(specifier, context)
} })
process.env.INTERNAL_API_SECRET = 'deliverables-fixture-only'
process.env.MC_SESSION_SECRET = 'deliverables-fixture-session'
process.env.MC_AUTH_PASSWORD = 'deliverables-fixture-password'
delete process.env.MC_TRUSTED_PROXIES; delete process.env.FRIDAY_TRUSTED_IPS
const { NextRequest } = await import('next/server')
const { GET: indexGET } = await import('../app/api/deliverables/route.ts')
const { GET: detailGET } = await import('../app/api/deliverables/[id]/route.ts')
const headers = { authorization: 'Bearer deliverables-fixture-only', 'x-forwarded-for': '203.0.113.2' }
const req = (endpoint, auth = headers) => new NextRequest('http://fixture.invalid' + endpoint, { headers: auth })
const detail = (item, query = contentPath(item), auth = headers) => detailGET(req(query, auth), { params: Promise.resolve({ id: item.id }) })
const row = name => fixture.envelope.data.items.find(i => i.path === name)
test('both endpoints deny before filesystem reads, including unset bearer/password', async () => {
  for (const auth of [{}, { authorization: 'Bearer wrong' }]) {
    const before = reads
    for (const response of [await indexGET(req('/api/deliverables',auth)), await detail(row('draft.txt'),contentPath(row('draft.txt')),auth)]) {
      assert.equal(response.status,401); assert.equal(response.headers.get('cache-control'),'no-store')
      assert.equal((await response.json()).data,null)
    }
    assert.equal(reads,before)
  }
  delete process.env.MC_AUTH_PASSWORD; delete process.env.INTERNAL_API_SECRET
  assert.equal((await indexGET(req('/api/deliverables',{}))).status,401)
  process.env.INTERNAL_API_SECRET = 'deliverables-fixture-only'; process.env.MC_AUTH_PASSWORD = 'deliverables-fixture-password'
})
test('bearer, valid session and existing tailnet auth work on both endpoints', async () => {
  for (const auth of [headers, { cookie: `${SESSION_COOKIE}=${await createSessionToken()}` }, { 'x-forwarded-for': '100.79.84.9' }]) {
    assert.equal((await indexGET(req('/api/deliverables',auth))).status,200)
    const response = await detail(row('held/offer.html'),contentPath(row('held/offer.html')),auth)
    assert.equal(response.status,200); assert.match(response.headers.get('content-type'),/application\/json/)
    assert.equal(response.headers.get('x-content-type-options'),'nosniff'); assert.match(response.headers.get('content-security-policy'),/sandbox/)
    assert.equal((await response.json()).data.mediaType,'text/html-source')
  }
})
test('HTTP 400/404/409/413/415 are explicit; path inputs cannot widen the allowlist', async () => {
  assert.equal((await indexGET(req('/api/deliverables?path=/etc/passwd'))).status,400)
  assert.equal((await detail(row('draft.txt'),contentPath(row('draft.txt'))+'&root=/tmp')).status,400)
  assert.equal((await detailGET(req('/api/deliverables/unknown'),{params:Promise.resolve({id:'unknown'})})).status,404)
  assert.equal((await detail(row('draft.txt'),'/api/deliverables/'+row('draft.txt').id)).status,409)
  assert.equal((await detail(row('unsupported.pdf'))).status,415)
  assert.equal((await detail(row('large.txt'),'/api/deliverables/'+row('large.txt').id)).status,413)
  await fs.rename(path.join(fixture.report,'moved.md'),path.join(fixture.temp,'moved.md'))
  assert.equal((await detail(row('moved.md'))).status,404)
  await fixture.write('draft.txt','Changed draft')
  assert.equal((await detail(row('draft.txt'))).status,409)
})
test('native curl collector and browser API read identical bytes through both real route handlers', async () => {
  const calls = []
  const server = http.createServer(async (request,response) => {
    try {
      calls.push(request.url)
      const webRequest = new NextRequest(`http://127.0.0.1${request.url}`, { headers: { ...request.headers, 'x-forwarded-for': '203.0.113.2' } })
      const url = new URL(webRequest.url)
      const result = url.pathname === '/api/deliverables' ? await indexGET(webRequest) : await detailGET(webRequest,{params:Promise.resolve({id:url.pathname.split('/').pop()})})
      response.writeHead(result.status,Object.fromEntries(result.headers)); response.end(await result.text())
    } catch { response.writeHead(500); response.end('{}') }
  })
  await new Promise((resolve,reject) => { server.on('error',reject); server.listen(0,'127.0.0.1',resolve) })
  const envFile = path.join(fixture.temp,'collector.env')
  await fs.writeFile(envFile,`MC_DELIVERABLES_ORIGIN=http://127.0.0.1:${server.address().port}\nINTERNAL_API_SECRET=deliverables-fixture-only\n`,{mode:0o600})
  process.env.MC_DELIVERABLES_ENV_FILE = envFile
  try {
    const nativeIndex = await collect(), browserIndex = await (await indexGET(req('/api/deliverables'))).json()
    assert.equal(nativeIndex.dataRevision,browserIndex.dataRevision)
    for (const item of nativeIndex.data.items.filter(i => i.available)) {
      const native = await collectContent(item), browser = await (await detail(item)).json()
      assert.equal(sha256(native.data.text),item.artifactRevision)
      assert.equal(sha256(browser.data.text),item.artifactRevision)
      assert.deepEqual(native.data,browser.data)
      console.log('CLIENT HASH PARITY',item.path,item.artifactRevision)
    }
    assert.ok(calls.includes('/api/deliverables')); assert.ok(calls.some(p => p.includes('?revision=')))
    assert.doesNotMatch(JSON.stringify(displaySnapshot(nativeIndex)),/deliverables-fixture-only/)
    await fs.chmod(envFile,0o644); await assert.rejects(collect(),/credential_file_unavailable/)
    await fs.chmod(envFile,0o600)
    await fs.symlink(envFile,path.join(fixture.temp,'linked.env')); process.env.MC_DELIVERABLES_ENV_FILE = path.join(fixture.temp,'linked.env')
    await assert.rejects(collect(),/credential_file_unavailable/)
  } finally { await new Promise(resolve => server.close(resolve)); delete process.env.MC_DELIVERABLES_ENV_FILE }
})
