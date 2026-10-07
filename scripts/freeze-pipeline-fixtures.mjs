/** Regenerate derived projections; preserve the frozen, allowlisted source input. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { normalizePipeline, radarEnvelope } from '../lib/pt/pipeline.ts'
import { displaySnapshot } from '../../desktop/mp.preciadoTech.pipeline/collector.mjs'
const file = 'tests/pt-parity/radar-envelopes.json'
const rows = JSON.parse(fs.readFileSync(file))
for (const row of rows) {
  const read = row.id === 'pipeline-edge-cases'
    ? { ok: true, store: normalizePipeline(JSON.parse(fs.readFileSync('tests/pt-parity/pipeline.json'))) }
    : row.id === 'empty' ? { ok: true, store: normalizePipeline({ leads: [] }) }
    : { ok: false, code: row.id, revision: row.envelope.sources[0].revision }
  row.envelope = radarEnvelope(read, row.envelope.generatedAt)
}
fs.writeFileSync(file, JSON.stringify(rows, null, 2) + '\n')
const manifestFile = 'tests/pt-parity/manifest.json', manifest = JSON.parse(fs.readFileSync(manifestFile))
manifest.sha256['radar-envelopes.json'] = createHash('sha256').update(fs.readFileSync(file)).digest('hex')
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
const smoke = '../desktop/mp.preciadoTech.pipeline/Smoke.qml'
const first = rows[0].envelope
fs.writeFileSync(smoke, fs.readFileSync(smoke, 'utf8').replace(/snapshot: \{.*\}; width:/, `snapshot: ${JSON.stringify(displaySnapshot(first, Date.parse(first.generatedAt)))}; width:`))
