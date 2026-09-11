import './helpers/ts-resolve.mjs'
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { formatTimeInStage, deadlineChip, revenueLeads, stageStartedAt } from '../lib/revenue-pipeline.ts'

// Resolve app aliases and Next's extensionless entry to the real modules.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context)
  if (specifier === 'next/server') return nextResolve('next/server.js', context)
  return nextResolve(specifier, context)
} })
const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'w3b-review-'))
process.env.MC_PIPELINE_DIR = fixtureDir
process.env.INTERNAL_API_SECRET = 'w3b-test-only'
const { NextRequest } = await import('next/server.js')
const { GET, POST } = await import('../app/api/pipeline/review/route.ts')
const { GET: pipelineGET } = await import('../app/api/pipeline/route.ts')
const storeFile = path.join(fixtureDir, 'pipeline.json')
after(() => fs.rm(fixtureDir, { recursive: true, force: true }))
const now = Date.parse('2026-09-10T12:00:00Z')
const request = (body, headers = {}) => new NextRequest('http://localhost/api/pipeline/review', {
  method: 'POST', headers: { host: 'localhost', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
})
const get = id => GET(new NextRequest(`http://localhost/api/pipeline/review${id === undefined ? '' : `?lead_id=${id}`}`))

test('time in stage uses stage history and handles boundaries and invalid dates', () => {
  for (const [date, expected] of [[undefined, '—'], ['bad', '—'], ['2026-09-11', 'now'], ['2026-09-10T11:59:30Z', 'now'], ['2026-09-10T11:55:00Z', '5m'], ['2026-09-10T07:00:00Z', '5h'], ['2026-09-08T12:00:00Z', '2d']]) {
    assert.equal(formatTimeInStage(date, now), expected)
  }
  assert.equal(stageStartedAt({ stage: 'awaiting_approval', updatedAt: '2026-09-10', history: [{ stage: 'awaiting_approval', ts: '2026-09-08' }] }), '2026-09-08')
})
test('deadline chips classify overdue, due, absent and invalid values', () => {
  assert.deepEqual(deadlineChip('2026-09-08T12:00:00Z', now), { kind: 'overdue', label: 'OVERDUE +2d' })
  assert.deepEqual(deadlineChip('2026-09-15T12:00:00Z', now), { kind: 'due', label: 'DUE 09-15' })
  assert.equal(deadlineChip(new Date(now).toISOString(), now).kind, 'due')
  for (const value of [null, undefined, '', 'bad']) assert.deepEqual(deadlineChip(value, now), { kind: 'none', label: '' })
})
test('revenue selection groups stages, orders approvals oldest first and caps recent completions', () => {
  const leads = [
    { id: 'a2', stage: 'awaiting_approval', updatedAt: '2026-09-10' },
    { id: 'a1', stage: 'awaiting_approval', updatedAt: '2026-09-08' },
    { id: 'dev', stage: 'in_development' }, { id: 'other', stage: 'leads_found' },
    ...[1, 2, 3, 4].map(n => ({ id: `c${n}`, stage: 'completed', updatedAt: `2026-09-0${n}` })),
  ]
  assert.deepEqual(revenueLeads(leads).map(l => l.id), ['a1', 'a2', 'dev', 'c4', 'c3', 'c2'])
  assert.deepEqual(revenueLeads([]), [])
})
test('real review handlers preserve stage and fields, persist decisions, and return individual records', async () => {
  assert.equal(typeof GET, 'function')
  assert.equal(typeof POST, 'function')
  for (const stage of ['awaiting_approval', 'in_development', 'completed']) {
    for (const status of ['pending', 'approved', 'rejected']) {
      const original = { id: 'fixture', business_name: 'Fixture', stage, approval: { status, telegramSentAt: '2026-09-01' }, extra_data: { offer_estimate: 600, next_action: null }, history: [{ stage, ts: '2026-09-01' }] }
      await fs.writeFile(storeFile, JSON.stringify({ leads: [original] }))
      const held = await POST(request({ lead_id: 'fixture', review: 'held' }))
      assert.equal(held.status, 200)
      const heldLead = (await held.json()).lead
      assert.deepEqual(heldLead.approval, original.approval)
      assert.equal(heldLead.extra_data.review, 'held')
      assert.ok(Number.isFinite(Date.parse(heldLead.extra_data.reviewed_at)))
      assert.equal(heldLead.stage, stage)
      const approved = await POST(request({ lead_id: 'fixture', review: 'approved' }))
      assert.equal(approved.status, 200)
      const lead = (await approved.json()).lead
      assert.equal(lead.approval.status, 'approved')
      assert.equal(lead.approval.telegramSentAt, '2026-09-01')
      assert.equal(lead.extra_data.offer_estimate, 600)
      assert.equal(lead.extra_data.review, 'approved')
      assert.ok(Number.isFinite(Date.parse(lead.extra_data.reviewed_at)))
      assert.equal(lead.stage, stage)
      assert.deepEqual(lead.history, original.history)
      const read = await get('fixture')
      assert.equal(read.status, 200)
      assert.equal(read.headers.get('cache-control'), 'no-store')
      assert.deepEqual(await read.json(), lead)
      assert.deepEqual(JSON.parse(await fs.readFile(storeFile, 'utf8')).leads[0], lead)
    }
  }
  await assert.rejects(fs.access(path.join(fixtureDir, 'events.jsonl')), { code: 'ENOENT' })
})
test('real handlers reject bad input, unknown leads, foreign origins and unauthorized callers', async () => {
  for (const body of [null, [], {}, { lead_id: 'fixture' }, { review: 'held' }, { lead_id: 'fixture', review: 'send' }, { lead_id: 4, review: 'held' }]) assert.equal((await POST(request(body))).status, 400)
  assert.equal((await POST(new NextRequest('http://localhost/api/pipeline/review', { method: 'POST', body: '{' }))).status, 400)
  assert.equal((await POST(request({ lead_id: 'missing', review: 'held' }))).status, 404)
  assert.equal((await get('missing')).status, 404)
  assert.equal((await get()).status, 400)
  assert.equal((await POST(request({ lead_id: 'fixture', review: 'held' }, { origin: 'https://foreign.example' }))).status, 403)
  assert.equal((await POST(request({ lead_id: 'fixture', review: 'held' }, { 'x-forwarded-for': '203.0.113.2' }))).status, 401)
  assert.equal((await POST(request({ lead_id: 'fixture', review: 'held' }, { 'x-forwarded-for': '203.0.113.2', authorization: 'Bearer w3b-test-only' }))).status, 200)
})
test('Home view returns every active lead with previews while default board caps remain', async () => {
  const leads = Array.from({ length: 55 }, (_, n) => ({ id: `lead-${n}`, business_name: `Lead ${n}`, stage: 'awaiting_approval', preview_url: 'https://example.com/preview', first_seen_at: '2026-09-01', extra_data: { offer_estimate: 600 } }))
  await fs.writeFile(storeFile, JSON.stringify({ leads }))
  const home = await (await pipelineGET(new NextRequest('http://localhost/api/pipeline?view=revenue'))).json()
  assert.equal(home.leads.length, 55)
  assert.equal(home.leadsTotal, 55)
  assert.equal(home.leads[0].previewUrl, 'https://example.com/preview')
  assert.equal(home.leads[0].firstSeenAt, '2026-09-01')
  const board = await (await pipelineGET(new NextRequest('http://localhost/api/pipeline'))).json()
  assert.equal(board.leads.length, 50)
})
test('real handlers return 500 for unreadable store data', async () => {
  await fs.writeFile(storeFile, '{')
  assert.equal((await get('fixture')).status, 500)
  assert.equal((await POST(request({ lead_id: 'fixture', review: 'held' }))).status, 500)
})
