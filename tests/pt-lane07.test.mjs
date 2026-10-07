import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { CADENCE, evaluateFreshness } from '../lib/pt/contract.ts'
import { normalizePipeline, radarEnvelope, unavailablePipeline } from '../lib/pt/pipeline.ts'
import { projectCrew } from '../lib/pt/crew.ts'
import { crewEnvelope } from '../lib/pt/crew-read.ts'
import { commandsEnvelope, unavailableCommandsEnvelope } from '../lib/pt/commands.ts'
import { unavailableDeliverables } from '../lib/pt/deliverables.ts'
import { presentationState } from '../lib/pt/presentation-state.mjs'
import { crewDisplay } from '../lib/pt/crew-display.mjs'
import { deliverablesDisplay } from '../lib/pt/deliverables-display.mjs'
import { paletteSnapshot } from '../lib/pt/catalog.ts'
import { displaySnapshot as pipelineNative } from '../../desktop/mp.preciadoTech.pipeline/collector.mjs'
import { displaySnapshot as crewNative } from '../../desktop/mp.preciadoTech.crew/collector.mjs'
import { displaySnapshot as commandNative } from '../../desktop/mp.preciadoTech.command/collector.mjs'
import { displaySnapshot as deliverablesNative } from '../../desktop/mp.preciadoTech.deliverables/collector.mjs'
const now = '2026-10-03T16:00:00.000Z', ms = Date.parse(now)
const source = { id: 'fixture', revision: 'fixture', sourceAt: now, observedAt: now, lastSuccessAt: now, freshness: 'fresh', blocked: false, reason: null }
const pipeline = radarEnvelope({ ok: true, store: normalizePipeline({ leads: [{ id: 'p', business_name: 'Fixture', stage: 'completed', updated_at: now }] }) }, now)
const crew = crewEnvelope(projectCrew({ tasks: [], heartbeats: [] }, now), [source], now)
const commands = commandsEnvelope({ pipeline, crew }, now)
const deliverables = { ...pipeline, data: { items: [], count: 0, complete: true } }

for (const [id, envelope, web, native] of [
  ['pipeline', pipeline, presentationState, pipelineNative], ['crew', crew, crewDisplay, crewNative],
  ['command', commands, paletteSnapshot, commandNative], ['deliverables', deliverables, deliverablesDisplay, deliverablesNative],
]) test(`${id}: uniform future-snapshot rejection in browser and desktop`, () => {
  for (const display of [web, native]) {
    const view = display(envelope, ms - 1)
    assert.equal(view.freshness, 'unknown'); assert.equal(view.error, 'future_snapshot')
    assert.equal(view.label, 'unknown'); assert.equal(view.lastKnown, false)
    if (view.rows) assert.deepEqual(view.rows, [])
    if (view.stages) assert.deepEqual(view.stages, [])
    if (view.commands) { assert.ok(view.commands.every(c => !c.enabled)); assert.ok(view.commands.every(c => c.badge?.value == null)) }
    if ('canRead' in view) assert.equal(view.canRead, false)
    assert.notEqual(display(envelope, ms).error, 'future_snapshot')
  }
})

test('catalog destinations survive complete healthy polling cycles; badge owner expiry stays exact', () => {
  const initial = ms
  for (let cycle = 0; cycle < 4; cycle++) {
    const clock = initial + cycle * CADENCE.command.pollMs, at = new Date(clock).toISOString()
    const p = { ...pipeline, generatedAt: at, validUntil: new Date(clock + CADENCE.pipeline.validityMs).toISOString() }
    const c = { ...crew, generatedAt: at, validUntil: new Date(clock + CADENCE.crew.validityMs).toISOString() }
    const catalog = commandsEnvelope({ pipeline: p, crew: c }, at)
    assert.equal(catalog.data.referencedSnapshots.crew.validUntil, c.validUntil)
    assert.equal(catalog.data.referencedSnapshots.pipeline.validUntil, p.validUntil)
    assert.ok(Date.parse(catalog.validUntil) > clock + CADENCE.command.pollMs)
    for (let offset = 0; offset <= CADENCE.command.pollMs; offset += 1000) for (const display of [paletteSnapshot, commandNative]) {
      const view = display(catalog, clock + offset)
      assert.deepEqual(view.commands.filter(c => c.enabled).map(c => c.id), ['pipeline','crew','deliverables'])
      const badge = view.commands.find(c => c.id === 'crew').badge
      assert.equal(badge.freshness, offset >= CADENCE.crew.validityMs ? 'stale' : 'fresh')
      assert.equal(badge.lastKnown, offset >= CADENCE.crew.validityMs)
    }
    assert.ok(paletteSnapshot(catalog, Date.parse(catalog.validUntil)).commands.every(c => !c.enabled))
    assert.ok(paletteSnapshot(catalog, clock, true, 'access_denied').commands.every(c => !c.enabled))
  }
})

test('future badge evidence is unknown without disabling a valid catalog', () => {
  const view = paletteSnapshot(commandsEnvelope({ crew: { ...crew, generatedAt: new Date(ms + 1000).toISOString() } }, now), ms)
  const row = view.commands.find(c => c.id === 'crew')
  assert.equal(row.enabled, true); assert.equal(row.badge.value, null)
  assert.equal(row.badge.freshness, 'unknown'); assert.equal(row.badge.error, 'future_snapshot')
})

test('failed sources share evaluator error classification and blocked remains orthogonal', () => {
  const expected = evaluateFreshness({ read: 'error', hasSnapshot: false, evidenceAt: null, now, cadenceMs: CADENCE.deliverables.validityMs })
  for (const envelope of [unavailablePipeline('read_failed', now), unavailableCommandsEnvelope(now), unavailableDeliverables('read_failed', now)]) {
    assert.equal(envelope.data, null)
    assert.equal(envelope.sources[0].freshness, expected.freshness)
    assert.equal(envelope.sources[0].reason, expected.reason)
    assert.equal(presentationState(envelope, ms).freshness, 'error')
    assert.equal(envelope.sources[0].blocked, false)
  }
  const denied = unavailableDeliverables('access_denied', now)
  assert.equal(denied.sources[0].freshness, 'unknown'); assert.equal(denied.sources[0].blocked, true)
  assert.equal(unavailableDeliverables('missing_store', now).sources[0].freshness, 'unknown')
  assert.equal(unavailableDeliverables('invalid_json', now).sources[0].freshness, 'error')
})

for (const age of [CADENCE.pipeline.attentionAfterMs - 1, CADENCE.pipeline.attentionAfterMs, CADENCE.pipeline.attentionAfterMs + 1, -1]) test(`pipeline record and dated fact use shared freshness boundary at age ${age}`, () => {
  const evidence = new Date(ms - age).toISOString()
  const read = radarEnvelope({ ok: true, store: normalizePipeline({ updated_at: evidence, leads: [{ id: 'dated', business_name: 'Dated', stage: 'concept_ready', updated_at: evidence, payment: { status: 'paid', paid_at: evidence } }] }) }, now)
  const record = read.data.records[0]
  const expected = evaluateFreshness({ read: 'success', hasSnapshot: true, evidenceAt: evidence, now, cadenceMs: CADENCE.pipeline.attentionAfterMs })
  assert.equal(record.freshness, expected.freshness)
  assert.equal(record.facts.payment.freshness, expected.freshness)
  assert.equal(record.facts.payment.reason, expected.reason)
  assert.equal(read.sources[0].freshnessBasis, 'inventory')
  assert.equal(read.sources[0].sourceAt, evidence)
  assert.equal(read.sources[0].freshness, 'fresh')
})

test('stage label owner supplies MC and desktop, including Build completed', () => {
  const labels = JSON.parse(fs.readFileSync(new URL('../lib/pt/stage-labels.json', import.meta.url)))
  const packaged = fs.readFileSync(new URL('../../desktop/mp.preciadoTech.pipeline/stage-labels.json', import.meta.url), 'utf8')
  assert.deepEqual(JSON.parse(packaged), labels)
  assert.equal(labels.completed, 'Build completed')
  const view = pipelineNative(pipeline, ms)
  assert.deepEqual(Object.fromEntries(view.stages.map(s => [s.id, s.label])), labels)
  const component = fs.readFileSync(new URL('../components/RevenuePipeline.tsx', import.meta.url), 'utf8')
  assert.match(component, /import STAGE_LABELS from '@\/lib\/pt\/stage-labels.json'/)
  assert.match(component, /Object.entries\(STAGE_LABELS\)/)
})
