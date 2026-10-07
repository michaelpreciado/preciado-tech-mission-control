import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { CADENCE, evaluateFreshness, isCompatibleContract, sourceRevisionMaterial } from '../lib/pt/contract.ts'
import { COMMAND_CATALOG, COMMAND_GROUPS, PRACTICE_AREAS } from '../lib/pt/catalog.ts'
import { THEME_TOKENS, THEME_CSS_VARIABLES } from '../lib/pt/theme.ts'

const fixture = name => JSON.parse(readFileSync(new URL(`./pt-parity/${name}`, import.meta.url), 'utf8'))
const heartbeats = fixture('heartbeats.json')
for (const row of heartbeats.cases) {
  test(`frozen heartbeat: ${row.id}`, () => {
    assert.deepEqual(evaluateFreshness({
      read: row.read, hasSnapshot: row.hasSnapshot,
      evidenceAt: row.heartbeat ? new Date(row.heartbeat.receivedAt).toISOString() : null,
      now: heartbeats.evaluatedAt, cadenceMs: CADENCE.crew.heartbeatTtlMs,
    }), row.expected)
  })
}

test('empty, blocked and failed source reads remain distinct', () => {
  const examples = fixture('envelopes.json').map(row => row.envelope)
  const [empty, held, failed] = examples
  assert.deepEqual(empty.data, [])
  assert.equal(failed.data, null)
  for (const envelope of examples) {
    assert.ok(isCompatibleContract(envelope))
    const source = envelope.sources[0]
    const quality = evaluateFreshness({ read: envelope.errors.length ? 'error' : 'success', hasSnapshot: envelope.data !== null,
      evidenceAt: source.sourceAt, now: envelope.generatedAt, cadenceMs: CADENCE.pipeline.pollMs })
    assert.equal(quality.freshness, source.freshness)
  }
  assert.equal(held.sources[0].blocked, true)
  assert.equal(held.sources[0].freshness, 'fresh')
  assert.equal(isCompatibleContract({ ...empty, contractRevision: 'pt-os.v2' }), false)
  assert.equal(isCompatibleContract({ ...empty, schemaVersion: 2 }), false)
})

test('response time and source order cannot renew dataRevision', () => {
  const source = fixture('envelopes.json')[0].envelope.sources[0]
  const second = { ...source, id: 'crew', revision: 'crew-r1' }
  const first = sourceRevisionMaterial([source, second])
  assert.equal(first, sourceRevisionMaterial([second, { ...source, observedAt: '2027-01-01T00:00:00Z' }]))
  assert.notEqual(first, sourceRevisionMaterial([source, { ...second, revision: 'crew-r2' }]))
})

test('invalid evidence timestamps do not establish freshness', () => {
  assert.deepEqual(evaluateFreshness({ read: 'success', hasSnapshot: true, evidenceAt: 'garbage', now: heartbeats.evaluatedAt, cadenceMs: 300000 }),
    { freshness: 'unknown', reason: 'invalid_timestamp' })
})

test('frozen fixture bytes are intact and edge-case indices remain valid', () => {
  const manifest = fixture('manifest.json')
  for (const [name, hash] of Object.entries(manifest.sha256)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(`./pt-parity/${name}`, import.meta.url))).digest('hex'), hash, name)
  }
  const { leads } = fixture('pipeline.json')
  const cases = fixture('pipeline-cases.json').appendedCases
  assert.deepEqual(cases.map(row => row.case), ['held', 'archived', 'duplicate', 'corrupt-record'])
  for (const row of cases) for (const i of row.indices) assert.ok(i < leads.length)
  const duplicate = cases.find(row => row.case === 'duplicate').indices.map(i => leads[i])
  assert.deepEqual(duplicate[0], duplicate[1])
})

test('catalog freezes four destinations and the three practice groups', () => {
  assert.deepEqual(COMMAND_CATALOG.map(command => command.id), ['pipeline', 'crew', 'command', 'deliverables'])
  assert.deepEqual(PRACTICE_AREAS, ['Web Development', 'AI Solutions', 'Tech Advisory'])
  assert.equal(COMMAND_GROUPS.flatMap(group => group.commands).length, 4)
  for (const command of COMMAND_CATALOG) {
    assert.match(command.webPath, /^\/(?!\/)/)
    assert.equal(command.desktopActionId, `mp.preciadoTech.${command.id}`)
    if (command.enabled) assert.ok(readFileSync(new URL(`../app${command.webPath}/page.tsx`, import.meta.url)))
    else assert.ok(command.blockedReason)
  }
})

test('theme adapters derive from the approved Blue Matrix Glass values', () => {
  assert.equal(THEME_TOKENS['bg.void'], '#05060a')
  assert.equal(THEME_TOKENS['accent.blue'], '#00d4ff')
  assert.equal(THEME_TOKENS['accent.blue.deep'], '#0092d6')
  assert.equal(THEME_TOKENS['text.primary'], '#e8f4ff')
  assert.equal(THEME_TOKENS['text.muted'], '#7e9fbc')
  assert.equal(THEME_TOKENS['glass.fill'], 'rgba(10,20,34,0.72)')
  assert.equal(THEME_TOKENS['glass.border'], 'rgba(0,212,255,0.45)')
  assert.equal(THEME_CSS_VARIABLES['--pt-font-sans'], '"Geist", sans-serif')
  assert.equal(THEME_CSS_VARIABLES['--pt-font-mono'], '"JetBrains Mono", monospace')
})
