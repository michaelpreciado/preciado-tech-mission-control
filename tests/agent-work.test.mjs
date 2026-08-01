import test from 'node:test'
import assert from 'node:assert/strict'
import { workKindForTool, dominantKind, isLive, LIVE_WINDOW_MS } from '../lib/agent-work.ts'

test('workKindForTool buckets the real tool vocabulary', () => {
  for (const t of ['terminal', 'patch', 'write_file', 'execute_code', 'process']) {
    assert.equal(workKindForTool(t), 'building', t)
  }
  for (const t of ['read_file', 'search_files', 'browser_navigate', 'vision_analyze']) {
    assert.equal(workKindForTool(t), 'research', t)
  }
  for (const t of ['todo', 'memory', 'send_message', 'cronjob']) {
    assert.equal(workKindForTool(t), 'content', t)
  }
})

test('workKindForTool is case-insensitive and safe on missing input', () => {
  assert.equal(workKindForTool('TERMINAL'), 'building')
  assert.equal(workKindForTool(null), 'thinking')
  assert.equal(workKindForTool(undefined), 'thinking')
  assert.equal(workKindForTool('some_future_tool'), 'thinking')
})

test('dominantKind picks the majority bucket', () => {
  assert.equal(dominantKind(['terminal', 'patch', 'read_file']), 'building')
  assert.equal(dominantKind(['read_file', 'search_files', 'terminal']), 'research')
  assert.equal(dominantKind([]), 'thinking')
  assert.equal(dominantKind([null, undefined]), 'thinking')
})

/* Liveness is the critical one: 36 of 37 sessions with ended_at IS NULL were
   actually abandoned, so recency — not the NULL — decides. */
test('isLive accepts a just-active session and rejects a stale one', () => {
  const now = 1_700_000_000_000
  const secs = now / 1000
  assert.equal(isLive(secs, now), true)
  assert.equal(isLive(secs - 60, now), true)                       // 1 min ago
  assert.equal(isLive(secs - LIVE_WINDOW_MS / 1000 + 5, now), true)
  assert.equal(isLive(secs - LIVE_WINDOW_MS / 1000 - 5, now), false)
  assert.equal(isLive(secs - 86400, now), false)                   // a day ago
})

test('isLive handles millisecond timestamps and junk', () => {
  const now = 1_700_000_000_000
  assert.equal(isLive(now, now), true)          // already in ms
  assert.equal(isLive(null, now), false)
  assert.equal(isLive(0, now), false)
  assert.equal(isLive(NaN, now), false)
})

test('isLive rejects timestamps far in the future', () => {
  const now = 1_700_000_000_000
  assert.equal(isLive(now / 1000 + 3600, now), false)
})
