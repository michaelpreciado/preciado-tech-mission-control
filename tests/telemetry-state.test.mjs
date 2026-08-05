import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveState,
  taskFromKanban,
  treeFromKanban,
  HEARTBEAT_OFFLINE_MS,
} from '../lib/telemetry.ts'

const NOW = 1_700_000_000_000

function task(over = {}) {
  return { id: 't1', title: 'Build the thing', status: null, startedAt: null, lastHeartbeatAt: null, host: null, failed: false, ...over }
}

/* ── The animation contract: task status → agent state ──────────────────
   The 3D HUD animates OFF node.state: working=pulse+underline, errored=red
   flash, waiting=steady, offline=dim. These tests pin the mapping that makes
   "task starts → animation fires" and "task ends → animation clears" true. */

test('a running task derives → working (drives the pulse + underline)', () => {
  const t = task({ status: 'running', startedAt: NOW })
  assert.equal(deriveState([t], NOW, NOW), 'working')
})

test('a claimed task derives → working', () => {
  assert.equal(deriveState([task({ status: 'claimed' })], NOW, NOW), 'working')
})

test('a ready/todo/assigned task derives → waiting (steady, no pulse)', () => {
  for (const s of ['ready', 'todo', 'assigned']) {
    assert.equal(deriveState([task({ status: s })], NOW, NOW), 'waiting', s)
  }
})

test('a failed/blocked/gave_up task derives → errored (red flash) — outranks working', () => {
  const blocked = task({ id: 'b', status: 'blocked', failed: true })
  const running = task({ id: 'r', status: 'running' })
  assert.equal(deriveState([blocked, running], NOW, NOW), 'errored')
})

test('terminal task removal → no open task + recent lastSeen → idle (animation clears)', () => {
  assert.equal(deriveState([], NOW, NOW), 'idle')
})

test('no open task + no signal → offline', () => {
  assert.equal(deriveState([], null, NOW), 'offline')
})

test('no open task + last seen beyond offline window → offline', () => {
  assert.equal(deriveState([], NOW - HEARTBEAT_OFFLINE_MS - 1000, NOW), 'offline')
})

/* ── taskFromKanban: kanban row → telemetry leaf (preserves failure signals) */

test('taskFromKanban maps a running kanban row with an explicit failure error → failed', () => {
  const r = taskFromKanban({ id: 'k1', title: 'T', status: 'running', lastFailureError: 'boom' })
  assert.equal(r.failed, true)
  assert.equal(r.title, 'T')
})

test('taskFromKanban maps failed status → failed', () => {
  assert.equal(taskFromKanban({ id: 'k1', title: 'T', status: 'failed' }).failed, true)
})

test('taskFromKanban parses ISO startedAt', () => {
  const r = taskFromKanban({ id: 'k1', title: 'T', startedAt: '2024-01-01T00:00:00.000Z' })
  assert.ok(r.startedAt > 0)
  assert.equal(taskFromKanban({ id: 'k2', title: 'T' }).startedAt, null)
})

/* ── treeFromKanban: snapshot → full roster tree with per-agent state */

test('treeFromKanban marks the assignee agent working when it owns a running task', () => {
  const runningRows = [{ id: 'a1', title: 'Running', assignee: 'jarvis', status: 'running', startedAt: new Date(NOW).toISOString() }]
  const tree = treeFromKanban(runningRows, NOW)
  const jarvis = tree.find(n => n.id === 'jarvis')
  assert.equal(jarvis.state, 'working')
  assert.equal(jarvis.currentTask.title, 'Running')
  const hermes = tree.find(n => n.id === 'hermes')
  assert.ok(hermes) // root always present
})

test('treeFromKanban roster count = 8 (hermes + 7 agents)', () => {
  const tree = treeFromKanban([], NOW)
  assert.equal(tree.length, 8)
})
