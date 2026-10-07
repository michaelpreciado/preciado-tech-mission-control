import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { deniedCrewEnvelope } from '../lib/pt/crew-read.ts'
import { createSessionToken, SESSION_COOKIE } from '../lib/session.ts'
let reads=0
const snapshot={...deniedCrewEnvelope('2026-10-03T16:00:00Z'),data:{members:[],counts:{active:0}}}
globalThis.__crewRouteFixture={collectCrew:()=>{reads++;return snapshot},deniedCrewEnvelope}
registerHooks({resolve(specifier,context,nextResolve){
  if(specifier==='@/lib/pt/crew-read') return {url:'data:text/javascript,export const {collectCrew,deniedCrewEnvelope}=globalThis.__crewRouteFixture;',shortCircuit:true}
  if(specifier.startsWith('@/')) return {url:new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,shortCircuit:true}
  if(specifier==='next/server') return nextResolve('next/server.js',context)
  return nextResolve(specifier,context)
}})
process.env.INTERNAL_API_SECRET='crew-fixture-secret'
process.env.MC_SESSION_SECRET='crew-fixture-session'
process.env.MC_AUTH_PASSWORD='crew-fixture-password'
delete process.env.MC_TRUSTED_PROXIES;delete process.env.FRIDAY_TRUSTED_IPS
const {NextRequest}=await import('next/server')
const {GET}=await import('../app/api/crew/route.ts')
for(const headers of [{},{'x-forwarded-for':'203.0.113.8'},{'x-forwarded-for':'203.0.113.8',authorization:'Bearer wrong'}]) test('crew GET denies before collection and uses E<T> on denial',async()=>{
  const before=reads,result=await GET(new NextRequest('http://fixture.invalid/api/crew',{headers}))
  assert.equal(result.status,401);assert.equal(reads,before);assert.equal(result.headers.get('cache-control'),'no-store')
  const body=await result.json();assert.equal(body.schemaVersion,1);assert.equal(body.contractRevision,'pt-os.v1');assert.equal(body.data,null);assert.equal(body.sources[0].blocked,true);assert.equal(body.errors[0].code,'access_denied')
})
for(const mode of ['bearer','tailnet','session']) test(`crew GET accepts ${mode}`,async()=>{
  const headers={'x-forwarded-for':mode==='tailnet'?'100.79.84.9':'203.0.113.8'}
  if(mode==='bearer') headers.authorization='Bearer crew-fixture-secret'
  if(mode==='session') headers.cookie=`${SESSION_COOKIE}=${await createSessionToken()}`
  const before=reads,result=await GET(new NextRequest('http://fixture.invalid/api/crew',{headers}))
  assert.equal(result.status,200);assert.equal(reads,before+1);assert.deepEqual(await result.json(),snapshot)
})
