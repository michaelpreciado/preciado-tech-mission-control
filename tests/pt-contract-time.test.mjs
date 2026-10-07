import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { sourceRevisionMaterial } from '../lib/pt/contract.ts'
import { normalizePipeline, projectPipeline } from '../lib/pt/pipeline.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
// TZ is fixed at process start, so each zone needs its own process.
const inZone = (tz, code) => JSON.parse(execFileSync(process.execPath, ['--import', './tests/helpers/ts-resolve.mjs', '--input-type=module', '-e', code], { cwd: root, env: { ...process.env, TZ: tz }, encoding: 'utf8' }))
const ZONES = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']

test('zone-less evidence is read as UTC in every server time zone', () => {
  const code = `import { evaluateFreshness } from './lib/pt/contract.ts'
    console.log(JSON.stringify(evaluateFreshness({ read: 'success', hasSnapshot: true, evidenceAt: '2026-01-01T11:59:30', now: '2026-01-01T12:00:00Z', cadenceMs: 60000 })))`
  for (const tz of ZONES) assert.deepEqual(inZone(tz, code), { freshness: 'fresh', reason: null }, tz)
})

test('pipeline fact times are server time zone independent', () => {
  const code = `import { normalizePipeline, projectPipeline } from './lib/pt/pipeline.ts'
    const r = projectPipeline(normalizePipeline({ leads: [{ id: 'a', business_name: 'a', stage: 'concept_ready', updated_at: '2026-01-01T11:59:30', outreach: { reply_at: '2026-01-01T11:59:30' } }] }), '2026-01-01T12:00:00Z').records[0]
    console.log(JSON.stringify({ sourceAt: r.sourceAt, freshness: r.freshness, reply: r.facts.reply }))`
  const results = ZONES.map(tz => inZone(tz, code))
  for (const r of results) assert.deepEqual(r, results[0])
  assert.equal(results[0].sourceAt, '2026-01-01T11:59:30.000Z')
  assert.equal(results[0].reply.freshness, 'fresh')
})

test('existing-format guarantees are unchanged', () => {
  const code = `import { evaluateFreshness } from './lib/pt/contract.ts'
    const f = (evidenceAt, now = '2026-01-01T12:00:00Z') => evaluateFreshness({ read: 'success', hasSnapshot: true, evidenceAt, now, cadenceMs: 60000 })
    let threw = []; for (const bad of [{ now: 'nope', cadenceMs: 1 }, { now: '2026-01-01T12:00:00Z', cadenceMs: 0 }]) { try { evaluateFreshness({ read: 'success', hasSnapshot: true, evidenceAt: null, ...bad }) } catch (e) { threw.push(e instanceof RangeError) } }
    console.log(JSON.stringify([f('2026-01-01T04:59:30-07:00'), f('2026-01-01T12:00:30Z'), f('2026-01-01T11:58:00Z'), f('garbage'), f('2026-01-01'), threw]))`
  const expected = [{ freshness: 'fresh', reason: null }, { freshness: 'unknown', reason: 'future_timestamp' }, { freshness: 'stale', reason: 'cadence_exceeded' }, { freshness: 'unknown', reason: 'invalid_timestamp' }, { freshness: 'stale', reason: 'cadence_exceeded' }, [true, true]]
  for (const tz of ZONES) assert.deepEqual(inZone(tz, code), expected, tz)
})

test('the newest fact time wins across mixed timestamp formats', () => {
  const reply = (a, b) => projectPipeline(normalizePipeline({ leads: [{ id: 'a', business_name: 'a', stage: 'concept_ready', updated_at: '2026-01-01T12:00:00Z', reply: { received_at: a }, outreach: { reply_at: b } }] }), '2026-01-02T00:00:00Z').records[0].facts.reply.sourceAt
  for (const [a, b] of [['2026-01-01T11:59:30', '2026-01-01T12:00:00Z'], ['2026-01-01T12:00:00+01:00', '2026-01-01T11:30:00Z']]) {
    const newest = new Date(Math.max(...[a, b].map(v => Date.parse(/[zZ]|[+-]\d{2}:\d{2}$/.test(v) ? v : `${v}Z`)))).toISOString()
    assert.equal(reply(a, b), newest)
    assert.equal(reply(b, a), newest)
  }
})

test('duplicate source ids produce order-independent revision material', () => {
  const src = (id, revision) => ({ id, revision, sourceAt: null, observedAt: '2026-01-01T00:00:00Z', lastSuccessAt: null, freshness: 'unknown', blocked: false, reason: null })
  assert.equal(sourceRevisionMaterial([src('a', '1'), src('a', '2')]), sourceRevisionMaterial([src('a', '2'), src('a', '1')]))
  const mixed = [src('b', null), src('a', 'null'), src('a', null), src('a', '0')]
  assert.equal(sourceRevisionMaterial(mixed), sourceRevisionMaterial([...mixed].reverse()))
  assert.equal(sourceRevisionMaterial(mixed), JSON.stringify([['a', null], ['a', '0'], ['a', 'null'], ['b', null]]))
  // A null revision never collides with the literal string "null".
  assert.notEqual(sourceRevisionMaterial([src('a', null)]), sourceRevisionMaterial([src('a', 'null')]))
})
