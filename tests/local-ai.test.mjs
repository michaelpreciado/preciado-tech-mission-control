import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRecipes, parseDockerPs, parseGpuCards, parseGpuApps, parseListeningPorts, interpretProxy, markThisMachine } from '../lib/collectors/local-ai.ts'

const recipe = (id, extra = {}) => ({ id, name: id.toUpperCase(), family: 'f', engine: 'vllm', format: 'q4', sizeGb: 3.5, cards: 1, minDriver: '580.0', ...extra })

test('parseRecipes: shipped shape, hardware-keyed under `hardware`', () => {
  const r = parseRecipes({ schemaVersion: 'x/3', registryCommit: 'abc', hardware: { a: { match: { name: 'A', backend: 'nvidia', vramGb: 8 }, recipes: [recipe('r1'), recipe('r2')] }, b: { match: {}, recipes: [recipe('r3')] } } })
  assert.equal(r.shape, 'hardware-keyed-object')
  assert.equal(r.recipes.length, 3)
  assert.equal(r.groups.find(g => g.key === 'a').recipeCount, 2)
  assert.equal(r.recipes[0].hardware, 'a')
})

test('parseRecipes: top-level keyed object and bare-array groups', () => {
  const r = parseRecipes({ a: { match: {}, recipes: [recipe('r1')] }, b: [recipe('r2')] })
  assert.equal(r.shape, 'top-level-keyed-object')
  assert.equal(r.arrayGroups, 1)
  assert.deepEqual(r.recipes.map(x => x.id), ['r1', 'r2'])
})

test('parseRecipes: garbage is unrecognised with zero recipes, rows without ids dropped', () => {
  assert.equal(parseRecipes('nope').recipes.length, 0)
  assert.equal(parseRecipes({ hardware: { a: { recipes: [{ name: 'no id' }] } } }).recipes.length, 0)
})

test('parseDockerPs: labels, role, digest truncation; blank and bad lines skipped', () => {
  const line = JSON.stringify({ Names: 'omarchy-local-ai-gateway-x', Image: 'ghcr.io/a/b@sha256:' + 'a'.repeat(64), Status: 'Up 2 minutes', Labels: 'io.omarchy.local-ai=1,io.omarchy.local-ai.uid=1000' })
  const rows = parseDockerPs(`${line}\n\nnot json\n`)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].role, 'gateway')
  assert.equal(rows[0].labels['io.omarchy.local-ai.uid'], '1000')
  assert.ok(rows[0].image.length < 40)
  assert.deepEqual(parseDockerPs(''), [])
})

test('nvidia-smi parsers handle units, commas in names, and argv leakage', () => {
  const cards = parseGpuCards('index, name, memory.used [MiB], memory.total [MiB]\n0, NVIDIA GeForce RTX 5070 Ti, 14465 MiB, 16303 MiB\n')
  assert.deepEqual(cards, [{ index: 0, name: 'NVIDIA GeForce RTX 5070 Ti', usedMiB: 14465, totalMiB: 16303 }])
  const apps = parseGpuApps('pid, process_name, used_gpu_memory [MiB]\n12, /opt/app --token=secret --x, 12 MiB\n')
  assert.equal(apps[0].process, '/opt/app')
  assert.equal(apps[0].usedMiB, 12)
  assert.deepEqual(parseGpuApps('pid, process_name, used_gpu_memory [MiB]\n'), [])
})

test('parseListeningPorts reads v4 and v6 local addresses', () => {
  const ss = 'State Recv-Q Send-Q Local Address:Port Peer Address:Port\nLISTEN 0 4096 127.0.0.1:12434 0.0.0.0:*\nLISTEN 0 4096 [::1]:12440 [::]:*\nLISTEN 0 4096 *:11434 *:*\n'
  assert.deepEqual([...parseListeningPorts(ss)].sort(), [11434, 12434, 12440])
})

test('interpretProxy: a 200 with nothing in it is EMPTY, never ok', () => {
  assert.equal(interpretProxy(200, '').state, 'empty')
  assert.equal(interpretProxy(200, '   \n').state, 'empty')
  assert.equal(interpretProxy(200, '{}').state, 'empty')
  assert.equal(interpretProxy(200, 'plain text').state, 'unavailable')
  assert.equal(interpretProxy(502, '').state, 'unavailable')
  const ok = interpretProxy(200, '{"phase":"idle","resident":null}')
  assert.equal(ok.state, 'ok')
  assert.equal(ok.data.body.resident, null)
  assert.equal(interpretProxy(503, '{"recovery_required":true}').state, 'ok')
})

test('markThisMachine requires GPU name and VRAM to agree', () => {
  const groups = [
    { key: 'ti16', name: 'GeForce RTX 5070 Ti', backend: 'nvidia', vramGb: 16, recipeCount: 1, thisMachine: false },
    { key: 'ti12', name: 'GeForce RTX 5070 Ti', backend: 'nvidia', vramGb: 12, recipeCount: 1, thisMachine: false },
    { key: 'cpu', name: 'CPU (AVX2)', backend: 'cpu', vramGb: 0, recipeCount: 1, thisMachine: false },
  ]
  markThisMachine(groups, [{ index: 0, name: 'NVIDIA GeForce RTX 5070 Ti', usedMiB: 1, totalMiB: 16303 }])
  assert.deepEqual(groups.map(g => g.thisMachine), [true, false, false])
})
