import fs from 'node:fs'
import { commandsEnvelope, deniedCommandsEnvelope, unavailableCommandsEnvelope } from '../lib/pt/commands.ts'
import { displaySnapshot } from '../../desktop/mp.preciadoTech.command/collector.mjs'
const read = file => JSON.parse(fs.readFileSync(`tests/pt-parity/${file}`, 'utf8'))
const pipeline = read('radar-envelopes.json')[0].envelope
const crew = read('crew-envelopes.json')[0].envelope
const now = crew.generatedAt
const ready = commandsEnvelope({ pipeline, crew }, now)
const local = { command: 'destination_not_implemented', deliverables: null }
const blocked = reason => ({ pipeline: reason, crew: reason, ...local, deliverables: reason })
const restricted = structuredClone(ready)
restricted.data.commands.find(c => c.id === 'pipeline').enabled = false
restricted.data.commands.find(c => c.id === 'pipeline').blockedReason = 'feature_not_staged_ready'
const forgedReady = structuredClone(ready)
for (const c of forgedReady.data.commands) { c.enabled = true; c.blockedReason = null }
const cases = [
  { id: 'staged-ready', envelope: ready, now, expected: { pipeline: null, crew: null, ...local } },
  { id: 'feature-not-staged-ready', envelope: restricted, now, expected: { pipeline: 'feature_not_staged_ready', crew: null, ...local } },
  { id: 'wire-cannot-enable-placeholder', envelope: forgedReady, now, expected: { pipeline: null, crew: null, ...local } },
  { id: 'expired', envelope: ready, now: ready.validUntil, expected: blocked('snapshot_expired') },
  { id: 'failed-refresh', envelope: ready, now, failed: true, error: 'transport_failed', expected: blocked('refresh_failed') },
  { id: 'denied-retained', envelope: ready, now, failed: true, error: 'access_denied', expected: blocked('access_denied') },
  { id: 'denied-empty', envelope: deniedCommandsEnvelope(now), now, expected: blocked('access_denied') },
  { id: 'read-failed', envelope: unavailableCommandsEnvelope(now), now, expected: blocked('catalog_unavailable') },
  { id: 'missing-badges', envelope: commandsEnvelope({}, now), now, expected: { pipeline: null, crew: null, ...local } },
]
fs.writeFileSync('tests/pt-parity/command-envelopes.json', JSON.stringify(cases, null, 2) + '\n')
fs.writeFileSync('../desktop/mp.preciadoTech.command/fixture.json', JSON.stringify(displaySnapshot(ready, Date.parse(now)), null, 2) + '\n')
console.log(`Frozen ${cases.length} command cases and desktop fixture.`)
