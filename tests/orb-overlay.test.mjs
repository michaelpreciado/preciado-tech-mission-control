import test from 'node:test'
import assert from 'node:assert/strict'
import { parseOrbOverlayEvent } from '../lib/orb-overlay.ts'

const NOW = 1_700_000_000_000

function event(over = {}) {
  return {
    id: 1,
    type: 'task.progress',
    raw_kind: 'progress',
    task_id: 'task-1',
    run_id: null,
    title: 'test task',
    status: 'running',
    from_agent: null,
    to_agent: null,
    host: null,
    started_at: null,
    last_heartbeat_at: null,
    payload: null,
    ts: NOW,
    ...over,
  }
}

test('completion overlay uses the canonical task.done topic', () => {
  assert.deepEqual(parseOrbOverlayEvent(event({ type: 'task.done', raw_kind: 'done' }), NOW), {
    kind: 'success', until: NOW + 6_000,
  })
})

test('completion overlay accepts terminal status on task.progress', () => {
  assert.equal(parseOrbOverlayEvent(event({ status: 'completed' }), NOW)?.kind, 'success')
  assert.equal(parseOrbOverlayEvent(event({ status: 'closed' }), NOW)?.kind, 'success')
  assert.equal(parseOrbOverlayEvent(event({ type: 'task.failed', raw_kind: 'failed', status: 'closed' }), NOW), null)
})

test('sync overlay uses merge/sync discriminators', () => {
  assert.equal(parseOrbOverlayEvent(event({ type: 'task.merge', raw_kind: 'merge' }), NOW)?.kind, 'sync')
  assert.equal(parseOrbOverlayEvent(event({ type: 'task.progress', raw_kind: 'sync' }), NOW)?.kind, 'sync')
  assert.equal(parseOrbOverlayEvent(event({ type: 'task.progress', raw_kind: 'progress' }), NOW), null)
})
