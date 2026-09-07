// node --import ./tests/helpers/ts-resolve.mjs scripts/smoke-kanban-ring.mts
import assert from 'node:assert/strict'
import { kanbanRingArcs, layoutKanbanRing, RING_COLORS, RING_RADII, ringLane, type RingTask } from '../lib/kanban-ring-layout.ts'

const statuses = ['doing', 'active', 'todo', 'ready', 'done', 'archived', 'blocked', 'failed', 'review', 'unknown']
const tasks: RingTask[] = Array.from({ length: 140 }, (_, i) => ({
  id: `task-${String(i).padStart(3, '0')}`,
  status: statuses[i % statuses.length],
  priority: i % 5,
  failures: i % 13 === 0 ? 2 : 0,
}))
const before = JSON.stringify(tasks)
const layout = layoutKanbanRing(tasks)
assert.ok(layout.nodes.length <= 96)
assert.equal(layout.nodes.length, 96)
assert.equal(JSON.stringify(layout), JSON.stringify(layoutKanbanRing(tasks)))
assert.equal(JSON.stringify(layout), JSON.stringify(layoutKanbanRing([...tasks].reverse(), 123456)))
assert.equal(JSON.stringify(tasks), before, 'input must not be mutated')
const input = new Map(tasks.map(task => [task.id, task]))
assert.equal(new Set(layout.nodes.map(node => node.id)).size, layout.nodes.length)
let failedCount = 0
for (const node of layout.nodes) {
  const task = input.get(node.id)
  assert.ok(task, 'node must come from input')
  assert.equal(node.radius, RING_RADII[ringLane(task.status)])
  assert.ok(Number.isFinite(node.angle) && node.scale > 0)
  const failed = task.status === 'blocked' || task.status === 'failed' || (task.failures ?? 0) > 0
  assert.equal(node.failed, failed)
  if (failed) {
    failedCount++
    assert.equal(node.color, '#ff5f57')
    assert.equal(node.color, RING_COLORS.error)
    assert.equal(node.tone, 'error')
  }
}
assert.ok(failedCount > 0)
// All three lanes, including terminal tasks, remain correctly separated before sampling.
const allStages = layoutKanbanRing(tasks.slice(0, 20))
assert.equal(new Set(allStages.nodes.map(node => node.radius)).size, 3)
assert.equal(layout.maxRadius, 3)
assert.equal(layout.arcs.reduce((sum, arc) => sum + arc.count, 0), tasks.length)
const fullArcs = kanbanRingArcs({ doing: 250, ready: 300, done: 400, review: 50 })
assert.equal(fullArcs.length, 3)
assert.equal(fullArcs.reduce((sum, arc) => sum + arc.count, 0), 1000)
assert.equal(fullArcs.find(arc => arc.stage === 'todo')?.count, 350)
assert.ok(Math.abs(fullArcs.reduce((sum, arc) => sum + arc.toAngle - arc.fromAngle, 0) - Math.PI * 2) < 1e-12)
assert.deepEqual(layoutKanbanRing([]), { nodes: [], arcs: [], maxRadius: 0 })
// Even when saturated, active tasks win over failures, which win over pending/done.
const saturated = layoutKanbanRing(Array.from({ length: 120 }, (_, i) => ({
  id: `active-${i}`, status: i < 100 ? 'doing' : 'failed', priority: 0,
})))
assert.ok(saturated.nodes.every(node => node.stage === 'doing'))
console.log(`PASS kanban ring: input=${tasks.length} nodes=${layout.nodes.length} failed=${failedCount} lanes=3 arcTotal=${tasks.length} snapshotTotal=1000`)
