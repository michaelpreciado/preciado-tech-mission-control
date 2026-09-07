// node --import ./tests/helpers/ts-resolve.mjs scripts/smoke-pipeline-orbit.mts
import assert from 'node:assert/strict'
import { layoutPipelineOrbit, orbitRingIndex, ORBIT_LIMIT, ORBIT_RADII, type OrbitLeadDetails } from '../lib/pipeline-orbit-layout.ts'
import { RING_RADII } from '../lib/kanban-ring-layout.ts'

const stages = ['prospecting', 'qualified', 'concept', 'approval', 'development', 'delivered', 'shipped', 'lost']
const leads: OrbitLeadDetails[] = Array.from({ length: 88 }, (_, i) => ({
  id: `lead-${String(i).padStart(3, '0')}`, stage: stages[i % 8], score: i,
  businessName: `Business ${i}`, ...(i === 3 ? { approval: { status: 'pending' as const } } : {}),
}))
const before = JSON.stringify(leads)
const layout = layoutPipelineOrbit(leads)
const nodes = layout.orbits.flatMap(ring => ring.nodes)
assert.equal(nodes.length, ORBIT_LIMIT)
assert.equal(JSON.stringify(layout), JSON.stringify(layoutPipelineOrbit(leads)))
assert.equal(JSON.stringify(layout), JSON.stringify(layoutPipelineOrbit([...leads].reverse())))
assert.equal(JSON.stringify(leads), before)
assert.equal(new Set(nodes.map(node => node.id)).size, nodes.length)
for (let i = 0; i < layout.orbits.length; i++) {
  const ring = layout.orbits[i]
  assert.equal(ring.radius, ORBIT_RADII[i])
  assert.ok(ring.radius > 3.05 && ring.radius > RING_RADII.done)
  if (i) assert.ok(ring.radius > layout.orbits[i - 1].radius)
  const members = leads.filter(lead => orbitRingIndex(lead.stage) === i)
    .sort((a, b) => b.score! - a.score! || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  assert.equal(ring.count, members.length)
  assert.equal(ring.planet?.id, members[0].id)
  assert.ok(!nodes.some(node => node.id === ring.planet?.id))
  assert.ok(ring.planet!.scale > 0.065)
}
assert.equal(nodes.find(node => node.id === 'lead-003')?.tone, 'warn')
const empty = layoutPipelineOrbit([])
assert.equal(empty.orbits.length, 4)
assert.equal(empty.maxRadius, 5.5)
assert.ok(empty.orbits.every(ring => ring.nodes.length === 0 && ring.planet === null && ring.count === 0))
const tied = layoutPipelineOrbit([{ id: 'b', stage: 'approval', score: 2 }, { id: 'a', stage: 'approval', score: 2 }])
assert.equal(tied.orbits[1].planet?.id, 'a')
const cases = layoutPipelineOrbit([
  { id: 'lost', stage: 'lost' }, { id: 'shipped', stage: 'shipped', score: 1 },
  { id: 'blocked', stage: 'development', blocked: true },
  { id: 'approved', stage: 'approval', approved: true },
  { id: 'rejected', stage: 'concept', approval: { status: 'rejected' } },
])
assert.equal(cases.orbits[3].nodes[0].tone, 'muted')
assert.equal(cases.orbits[3].planet?.tone, 'success')
assert.equal(cases.orbits[2].planet?.tone, 'error')
assert.equal(cases.orbits[1].planet?.tone, 'success')
assert.equal(cases.orbits[0].planet?.tone, 'muted')
const snapshot = layoutPipelineOrbit([], { leads_found: 200, social_scraped: 50, concept_ready: 30, awaiting_approval: 100, in_development: 70, completed: 90 })
assert.deepEqual(snapshot.orbits.map(ring => ring.count), [280, 100, 160, 0])
const saturated = layoutPipelineOrbit(Array.from({ length: 100 }, (_, i) => ({ id: `s-${i}`, stage: i < 80 ? 'approval' : 'shipped', score: i })))
assert.equal(saturated.orbits[1].nodes.length, 64)
console.log(`PASS pipeline orbit: input=${leads.length} satellites=${nodes.length} planets=${layout.orbits.filter(ring => ring.planet).length} rings=4 countTotal=${layout.orbits.reduce((sum, ring) => sum + ring.count, 0)}`)
