import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { registerHooks } from 'node:module'
import { createHash } from 'node:crypto'
import { normalizePipeline, projectPipeline, radarEnvelope, readPipelineStore, legacyPipelineLeads } from '../lib/pt/pipeline.ts'
import { presentationState, compatibleEnvelope } from '../lib/pt/presentation-state.mjs'
import { displaySnapshot, collect } from '../../desktop/mp.preciadoTech.pipeline/collector.mjs'
import { CADENCE } from '../lib/pt/contract.ts'
import { THEME_TOKENS } from '../lib/pt/theme.ts'
import { resetConfigCache } from '../lib/config.ts'
const fixture = name => JSON.parse(readFileSync(new URL(`./pt-parity/${name}`, import.meta.url)))
const now = fixture('manifest.json').evaluatedAt
const raw = fixture('pipeline.json')
const envelope = radarEnvelope({ ok: true, store: normalizePipeline(raw) }, now)
const project = rows => projectPipeline(normalizePipeline({ leads: rows }), now)
const lead = (id, fields = {}) => ({ id, business_name: id, stage: 'concept_ready', updated_at: now, ...fields })
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pt-pipeline-'))
after(() => fs.rm(temp, { force: true, recursive: true }))

test('frozen radar envelope includes held, archived, duplicate and corrupt rows', () => {
  const expected = fixture('radar-envelopes.json').find(row => row.id === 'pipeline-edge-cases').envelope
  assert.deepEqual(JSON.parse(JSON.stringify(envelope)), expected)
  const d = envelope.data
  assert.equal(d.rawRecordCount, 11)
  assert.equal(d.recordCount, 7)
  assert.equal(d.duplicateRecordCount, 1)
  assert.equal(d.invalidRecordCount, 3)
  assert.equal(Object.values(d.counts).reduce((a,b)=>a+b), 7)
  const held = d.records.find(r => r.id === 'fixture-held')
  assert.equal(held.blocked, true)
  assert.equal(held.sendReady, false)
  assert.equal(held.facts.review.state, 'held')
  assert.ok(held.facts.review.evidence.some(e => e.value === 'approved'))
  const archived = d.records.find(r => r.id === 'fixture-archived')
  assert.equal(archived.active, false)
  assert.equal(archived.requiresBoss, false)
  assert.deepEqual(archived.attention, [])
  assert.deepEqual(d.records.find(r => r.id === 'fixture-duplicate').sourceIndices, [6,7])
})

test('full-store counts and attention precede any display cap', () => {
  const store = normalizePipeline({ leads: Array.from({ length: 121 }, (_, n) => lead(`lead-${n}`, { updated_at: '2026-09-01T00:00:00Z' })) })
  const d = projectPipeline(store, now, 2)
  assert.equal(d.counts.concept_ready, 121)
  assert.equal(d.attentionCount, 121)
  assert.equal(d.pendingDecisionCount, 0)
  assert.equal(d.display.recordIds.length, 2)
  assert.equal(d.display.complete, false)
})

test('normalization retains original legacy/unknown fields and terminal stages', () => {
  const store = normalizePipeline({ leads: [lead('legacy', { email_sent_at: '2026-09-30T16:00:00Z', resend_id: 'provider-fixture', arbitrary_legacy: { preserved: true }, history: [{ stage: 'legacy-stage', ts: now }] }), lead('terminal-archive', { stage: 'archived' }), lead('terminal-disqualified', { stage: 'disqualified' })] })
  assert.deepEqual(store.records[0].evidence[0].raw.arbitrary_legacy, { preserved: true })
  assert.equal(store.records[0].history[0].stage, 'legacy-stage')
  assert.deepEqual(legacyPipelineLeads(store)[0].arbitrary_legacy, { preserved: true })
  const d = projectPipeline(store, now)
  assert.equal(d.counts.archived, 1)
  assert.equal(d.counts.disqualified, 1)
  const legacy = d.records.find(r => r.id === 'legacy')
  assert.equal(legacy.facts.send.state, 'reported_sent')
  assert.equal(legacy.facts.providerAcceptance.state, 'accepted')
  assert.equal(legacy.facts.delivery.state, 'unknown')
})

test('disqualified/archived/aliases do not become actionable opportunities', () => {
  const store = normalizePipeline({ leads: [lead('active'), lead('replacement', { archived: true, extra_data: { duplicate_of: 'active' } }), lead('unqualified', { qualified: false, stage: 'awaiting_approval' }), lead('archive', { extra_data: { archived: true }, stage: 'awaiting_approval' })] })
  const d = projectPipeline(store, now)
  assert.equal(d.rawRecordCount, 4); assert.equal(d.recordCount, 3); assert.equal(d.duplicateRecordCount, 1)
  assert.equal(d.activeCount, 1); assert.equal(d.pendingDecisionCount, 0)
  assert.deepEqual(store.records.find(r=>r.id==='active').evidence.map(e=>e.index), [0,1])
})

test('conflicting duplicates block readiness without discarding either record', () => {
  const d = project([lead('dup', { stage: 'completed', approval: { status: 'approved' } }), lead('dup', { stage: 'completed', extra_data: { review: 'held' } })])
  assert.equal(d.recordCount, 1)
  assert.equal(d.records[0].blocked, true)
  assert.equal(d.records[0].sendReady, false)
  assert.equal(d.records[0].duplicateCount, 1)
  assert.ok(d.records[0].blockedReasons.includes('duplicate_conflict'))
})

test('six facts remain independent; test sends and offer estimates are not outcomes', () => {
  const d = project([
    lead('build', { stage: 'completed', extra_data: { offer_estimate: 1500, deposit: '$750', test_resend_id: 'test-only', review_send_completed: true } }),
    lead('review', { approval: { status: 'approved' } }),
    lead('accepted', { outreach: { resend_id: 'accepted-fixture' } }),
    lead('delivered', { outreach: { resend_status: 'delivered', reply: 'none recorded' } }),
    lead('reply', { outreach: { reply: 'Interested, call me' } }),
    lead('payment', { payment: { status: 'paid', paid_at: now } }),
    lead('contradiction', { outreach: { resend_status: 'delivered' }, extra_data: { email_status: 'bounced-2026-09-30' } }),
  ])
  const facts = id => d.records.find(r=>r.id===id).facts
  assert.equal(facts('build').build.state, 'complete')
  for (const key of ['review','providerAcceptance','delivery','reply','payment','send']) assert.equal(facts('build')[key].state, 'unknown', key)
  assert.equal(facts('review').review.state, 'approved'); assert.equal(facts('review').send.state, 'unknown')
  assert.equal(facts('accepted').providerAcceptance.state, 'accepted'); assert.equal(facts('accepted').delivery.state, 'unknown')
  assert.equal(facts('delivered').delivery.state, 'delivered'); assert.equal(facts('delivered').reply.state, 'unknown')
  assert.equal(facts('reply').reply.state, 'received'); assert.equal(facts('reply').payment.state, 'unknown')
  assert.equal(facts('payment').payment.state, 'paid'); assert.equal(facts('payment').delivery.state, 'unknown')
  assert.equal(facts('contradiction').delivery.state, 'conflict')
})

test('stale uses last operational change, exact seven-day boundary, explicit gates only', () => {
  const d = project([
    lead('boundary', { updated_at: '2026-09-26T16:00:00Z' }),
    lead('before', { updated_at: '2026-09-26T16:00:00.001Z' }),
    lead('recent-work', { history: [{ stage: 'concept_ready', ts: '2026-01-01T00:00:00Z' }] }),
    lead('completed-history', { stage: 'completed', updated_at: '2026-01-01T00:00:00Z' }),
    lead('unknown', { updated_at: undefined }), lead('future', { updated_at: '2027-01-01T00:00:00Z' }),
    lead('malformed', { updated_at: 'garbage', created_at: '2026-01-01T00:00:00Z' }),
    lead('gate', { input_gate: { status: 'needs_input' } }),
    lead('blocker', { extra_data: { blocker: 'Needs internal repair' } }),
  ])
  const record = id => d.records.find(r=>r.id===id)
  assert.equal(record('boundary').freshness, 'fresh'); assert.equal(record('boundary').requiresBoss, false)
  for (const id of ['before','recent-work']) assert.equal(record(id).freshness, 'fresh')
  assert.equal(record('completed-history').freshness, 'stale')
  assert.deepEqual(record('completed-history').attention, [])
  for (const id of ['unknown','future','malformed']) assert.equal(record(id).freshness, 'unknown')
  assert.equal(record('gate').requiresBoss, true)
  assert.equal(record('blocker').blocked, true); assert.equal(record('blocker').requiresBoss, false)
})

test('followup calendar deadlines use Los Angeles days and suppress replies/holds', () => {
  const store = normalizePipeline({ leads: [
    lead('today', { outreach: { status: 'sent', followup_due: '2026-10-03' } }),
    lead('yesterday', { outreach: { status: 'sent', followup_due: '2026-10-02' } }),
    lead('answered', { outreach: { status: 'sent', followup_due: '2026-10-02', reply: 'Thanks' } }),
    lead('suppressed', { outreach: { status: 'sent', followup_due: '2026-10-02', followup_suppressed: true } }),
  ] })
  const d = projectPipeline(store, '2026-10-04T03:00:00.000Z') // Oct 3 evening PDT
  const overdue = d.records.filter(r=>r.attention.includes('Follow-up overdue')).map(r=>r.id)
  assert.deepEqual(overdue, ['yesterday'])
})

test('successful empty, missing, failed, corrupt JSON and invalid root stay distinct', async () => {
  const file = path.join(temp, 'store.json')
  for (const [text, expected] of [['[]','empty'], ['{"leads":[]}','empty'], ['{','invalid_json'], ['{}','invalid_store']]) {
    await fs.writeFile(file, text)
    const read = await readPipelineStore(file), e = radarEnvelope(read, now)
    if (expected === 'empty') { assert.equal(e.data.recordCount, 0); assert.equal(e.sources[0].freshness, 'fresh') }
    else { assert.equal(e.data, null); assert.equal(e.errors[0].code, expected); assert.equal(e.sources[0].freshness, 'error') }
  }
  const missing = radarEnvelope(await readPipelineStore(path.join(temp, 'missing')), now)
  assert.equal(missing.data, null); assert.equal(missing.sources[0].freshness, 'unknown')
  const failed = radarEnvelope(await readPipelineStore(temp), now)
  assert.equal(failed.data, null); assert.equal(failed.errors[0].code, 'read_failed')
})

test('revisions follow source bytes; polling cannot renew operational evidence', () => {
  const later = radarEnvelope({ ok:true, store:normalizePipeline(raw) }, '2026-10-03T16:00:01.000Z')
  assert.equal(later.dataRevision, envelope.dataRevision)
  assert.notEqual(later.snapshotId, envelope.snapshotId)
  assert.deepEqual(later.data.records.map(r=>[r.id,r.sourceAt,r.freshness]),envelope.data.records.map(r=>[r.id,r.sourceAt,r.freshness]))
  assert.equal(Date.parse(envelope.validUntil)-Date.parse(envelope.generatedAt), CADENCE.pipeline.validityMs)
})

test('collector and browser share transport expiry, retention, revision and theme', () => {
  for (const [clock, failed] of [[Date.parse(now),false],[Date.parse(envelope.validUntil),false],[Date.parse(now),true]]) {
    const browser = presentationState(envelope, clock, failed), desktop = displaySnapshot(envelope, clock, failed)
    for (const key of ['freshness','blocked','label','lastKnown']) assert.equal(desktop[key], browser[key])
    assert.equal(desktop.pendingDecisionCount, envelope.data.pendingDecisionCount)
    assert.equal(desktop.attentionCount, envelope.data.attentionCount)
    assert.deepEqual(Object.fromEntries(desktop.stages.map(s=>[s.id,s.count])), envelope.data.counts)
    assert.equal(desktop.snapshotId, envelope.snapshotId)
  }
  assert.equal(displaySnapshot({ ...envelope, contractRevision:'pt-os.v2' }).recordCount,null)
  assert.equal(compatibleEnvelope({}),false)
  assert.equal(displaySnapshot(null).attentionCount,null)
  const desktop = displaySnapshot(envelope)
  assert.equal(desktop.theme.blue,THEME_TOKENS['accent.blue'])
  const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex')
  assert.equal(hash(new URL('../lib/pt/presentation-state.mjs',import.meta.url)),hash(new URL('../../desktop/mp.preciadoTech.pipeline/presentation-state.mjs',import.meta.url)))
})

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context)
  if (specifier === 'next/server') return nextResolve('next/server.js', context)
  return nextResolve(specifier, context)
} })
const { NextRequest } = await import('next/server.js')
const { GET } = await import('../app/api/pipeline/route.ts')

test('actual radar/default/revenue GETs share normalized source and fail closed', async () => {
  const saved = process.env.MC_PIPELINE_DIR
  process.env.MC_PIPELINE_DIR = temp; resetConfigCache()
  try {
    await fs.writeFile(path.join(temp,'pipeline.json'), JSON.stringify(raw))
    for (const view of ['radar','revenue','']) {
      const denied = await GET(new NextRequest(`http://fixture/api/pipeline?view=${view}`))
      assert.equal(denied.status,401)
      const res = await GET(new NextRequest(`http://fixture/api/pipeline?view=${view}`, { headers:{'x-forwarded-for':'127.0.0.1'} }))
      assert.equal(res.status,200)
      assert.equal(res.headers.get('cache-control'),'no-store')
      const body = await res.json()
      if (view === 'radar') assert.equal(body.data.recordCount,7)
      else { assert.equal(body.leadsTotal,7); assert.ok(Array.isArray(body.events)); assert.ok(body.sentSummary); assert.ok(body.counts) }
    }
    await fs.writeFile(path.join(temp,'pipeline.json'),'{')
    const response = await GET(new NextRequest('http://fixture/api/pipeline?view=radar',{headers:{'x-forwarded-for':'127.0.0.1'}}))
    assert.equal(response.status,503);assert.equal((await response.json()).data,null)
  } finally { if (saved === undefined) delete process.env.MC_PIPELINE_DIR; else process.env.MC_PIPELINE_DIR=saved; resetConfigCache() }
})

test('collector curls authenticated GET with bearer only on stdin and no body/token logging', async () => {
  const bin = path.join(temp, 'bin'); await fs.mkdir(bin)
  const audit = path.join(temp, 'curl-audit.json')
  const token = 'fixture-collector-bearer-only'
  const fake = `#!/usr/bin/env python3
import os, sys, json
value = sys.stdin.read()
token = ${JSON.stringify(token)}
with open(${JSON.stringify(audit)}, 'w') as f:
 json.dump({'args':sys.argv[1:], 'tokenInArgs':any(token in a for a in sys.argv), 'tokenInEnv':any(token in v for v in os.environ.values()), 'secretNamesPresent':any(n in os.environ for n in ['INTERNAL_API_SECRET','MC_INTERNAL_API_SECRET']), 'receivedHeader':value == ${JSON.stringify('header = "Authorization: Bearer '+token+'"\n')}},f)
sys.stdout.write(${JSON.stringify(JSON.stringify(envelope)+'\n200')})
`
  await fs.writeFile(path.join(bin,'curl'), fake, { mode:0o700 })
  const credential = path.join(temp,'collector.env')
  await fs.writeFile(credential, `MC_RADAR_ORIGIN=http://127.0.0.1:4176\nINTERNAL_API_SECRET=${token}\n`,{mode:0o600})
  const saved = Object.fromEntries(['PATH','MC_RADAR_ENV_FILE','INTERNAL_API_SECRET','MC_INTERNAL_API_SECRET'].map(k=>[k,process.env[k]]))
  process.env.PATH=bin+path.delimiter+process.env.PATH
  process.env.MC_RADAR_ENV_FILE=credential
  process.env.INTERNAL_API_SECRET=token
  process.env.MC_INTERNAL_API_SECRET=token
  try {
    const read=await collect()
    assert.deepEqual(read,JSON.parse(JSON.stringify(envelope)))
    const result=JSON.parse(await fs.readFile(audit,'utf8'))
    assert.equal(result.tokenInArgs,false);assert.equal(result.tokenInEnv,false);assert.equal(result.secretNamesPresent,false);assert.equal(result.receivedHeader,true)
    assert.equal(result.args[0],'-q');assert.ok(result.args.includes('--config'));assert.ok(result.args.includes('-'))
    assert.ok(result.args.at(-1).endsWith('/api/pipeline?view=radar'))
    assert.ok(!JSON.stringify(displaySnapshot(read)).includes(token))
    await fs.chmod(credential,0o644)
    await assert.rejects(collect(),/credential_file_unavailable/)
  } finally { for (const [k,v] of Object.entries(saved)) { if(v===undefined) delete process.env[k];else process.env[k]=v } }
})
