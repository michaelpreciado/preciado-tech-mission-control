import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LANE_ORDER, WORKER_FRESH_MS, laneFor, isUnassigned, workerState, toneFor, stateWord,
  summarizeKanban, briefSentence, needsYouTasks, upNextTasks, taskSort, buildRoster,
} from '../lib/flight-strip.ts'
import { projectCrew } from '../lib/pt/crew.ts'

const NOW = Date.parse('2026-09-29T22:00:00Z')
const iso = (msAgo) => new Date(NOW - msAgo).toISOString()
const task = (over = {}) => ({ id: 't_1', title: 'Task', status: 'todo', priority: 0, consecutiveFailures: 0, ...over })

/* Every status the board can render maps to exactly one lane (implementation gate G5). */
test('every known status maps to exactly one lane, unknown falls to up_next', () => {
  const known = ['todo', 'ready', 'running', 'in_progress', 'blocked', 'failed', 'review', 'done', 'archived', 'scheduled', 'triage']
  for (const s of known) assert.ok(LANE_ORDER.includes(laneFor(s)), s)
  assert.equal(laneFor('blocked'), 'needs_you')
  assert.equal(laneFor('failed'), 'needs_you')
  assert.equal(laneFor('review'), 'needs_you')
  assert.equal(laneFor('running'), 'running')
  assert.equal(laneFor('in_progress'), 'running')
  for (const s of ['todo', 'ready', 'scheduled', 'triage']) assert.equal(laneFor(s), 'up_next', s)
  assert.equal(laneFor('done'), 'done')
  assert.equal(laneFor('archived'), 'done')
  assert.equal(laneFor('some_future_status'), 'up_next')
  assert.deepEqual(LANE_ORDER, ['needs_you', 'running', 'up_next', 'done'])
})

test('isUnassigned treats the live "none" sentinel and blanks as unassigned', () => {
  for (const v of [undefined, null, '', '  ', 'none', 'None', 'unassigned']) assert.equal(isUnassigned(v), true, String(v))
  for (const v of ['jarvis', 'friday', 'forge']) assert.equal(isUnassigned(v), false, v)
})

/* A card whose status says running is not evidence that a worker exists. */
test('workerState only calls a task live with a current run and a fresh heartbeat', () => {
  const fresh = iso(60_000)
  assert.equal(workerState(task({ status: 'running', currentRunId: 4, lastHeartbeatAt: fresh }), NOW), 'live')
  assert.equal(workerState(task({ status: 'in_progress', currentRunId: 4, lastHeartbeatAt: fresh }), NOW), 'live')
  // no run attached: tracking only
  assert.equal(workerState(task({ status: 'running', lastHeartbeatAt: fresh }), NOW), 'no-worker')
  // run attached but heartbeat is stale
  assert.equal(workerState(task({ status: 'running', currentRunId: 4, lastHeartbeatAt: iso(WORKER_FRESH_MS + 1000) }), NOW), 'no-worker')
  // Start time only establishes tracked work, never a confirmed worker.
  assert.equal(workerState(task({ status: 'running', currentRunId: 4, startedAt: iso(30_000) }), NOW), 'no-worker')
  assert.equal(workerState(task({ status: 'running', currentRunId: 4, startedAt: iso(WORKER_FRESH_MS * 3) }), NOW), 'no-worker')
  assert.equal(workerState(task({ status: 'running', currentRunId: 4 }), NOW), 'no-worker')
  // unparsable / future heartbeat cannot prove liveness
  assert.equal(workerState(task({ status: 'running', currentRunId: 4, lastHeartbeatAt: 'garbage' }), NOW), 'no-worker')
  assert.equal(workerState(task({ status: 'running', currentRunId: 4, lastHeartbeatAt: iso(-10 * 60_000) }), NOW), 'no-worker')
  // non-running statuses are never workers even with a stale run pointer
  for (const s of ['todo', 'blocked', 'review', 'done', 'failed']) {
    assert.equal(workerState(task({ status: s, currentRunId: 9, lastHeartbeatAt: fresh }), NOW), 'not-running', s)
  }
})

test('rail tone: dodger only for a live worker, red only for failed, grey for tracking-only', () => {
  const fresh = iso(1000)
  assert.equal(toneFor(task({ status: 'running', currentRunId: 1, lastHeartbeatAt: fresh }), NOW), 'run')
  assert.equal(toneFor(task({ status: 'running' }), NOW), 'next')
  assert.equal(toneFor(task({ status: 'failed' }), NOW), 'fail')
  assert.equal(toneFor(task({ status: 'blocked' }), NOW), 'you')
  assert.equal(toneFor(task({ status: 'review' }), NOW), 'you')
  assert.equal(toneFor(task({ status: 'todo' }), NOW), 'next')
  assert.equal(toneFor(task({ status: 'done' }), NOW), 'done')
  assert.equal(toneFor(task({ status: 'archived' }), NOW), 'next')
  // past failures are text only, never a red rail
  assert.equal(toneFor(task({ status: 'blocked', consecutiveFailures: 3 }), NOW), 'you')
})

test('stateWord keeps the real status word and labels tracking-only running cards', () => {
  assert.equal(stateWord(task({ status: 'blocked' }), NOW), 'Blocked')
  assert.equal(stateWord(task({ status: 'review' }), NOW), 'In review')
  assert.equal(stateWord(task({ status: 'in_progress', currentRunId: 1, lastHeartbeatAt: iso(1000) }), NOW), 'Running')
  assert.equal(stateWord(task({ status: 'running' }), NOW), 'Marked running · no live worker')
  assert.equal(stateWord(task({ status: 'some_new' }), NOW), 'some new')
})

test('summarizeKanban counts live vs tracking-only separately and defines open as non-terminal', () => {
  const tasks = [
    task({ id: 'a', status: 'running', currentRunId: 1, lastHeartbeatAt: iso(1000) }),
    task({ id: 'b', status: 'running' }),
    task({ id: 'c', status: 'blocked' }),
    task({ id: 'd', status: 'failed' }),
    task({ id: 'e', status: 'review' }),
    task({ id: 'f', status: 'todo' }),
    task({ id: 'g', status: 'scheduled' }),
    task({ id: 'h', status: 'done' }),
    task({ id: 'i', status: 'archived' }),
  ]
  const s = summarizeKanban(tasks, NOW)
  assert.equal(s.runningLive, 1)
  assert.equal(s.trackingOnly, 1)
  assert.equal(s.needsYou, 3)
  assert.equal(s.upNext, 2)
  assert.equal(s.done, 2)
  assert.equal(s.open, 7)
})

test('briefSentence never invents counts while loading or failed', () => {
  const s = summarizeKanban([], NOW)
  assert.equal(briefSentence(null, { loading: true, error: null }).kind, 'loading')
  assert.equal(briefSentence(null, { loading: false, error: 'HTTP 500' }).kind, 'unavailable')
  const stale = briefSentence(s, { loading: false, error: 'HTTP 500' })
  assert.equal(stale.kind, 'stale')
  assert.match(stale.text, /Nothing is running/)
  assert.doesNotMatch(briefSentence(null, { loading: true, error: null }).text, /\d/)
})

test('briefSentence phrases the answer in one sentence', () => {
  const mk = (runningLive, needsYou) => ({ runningLive, needsYou, trackingOnly: 0, upNext: 0, done: 0, open: runningLive + needsYou })
  assert.equal(briefSentence(mk(0, 20), {}).text, 'Nothing is running, and 20 are waiting on you.')
  assert.equal(briefSentence(mk(1, 1), {}).text, '1 is running, and 1 is waiting on you.')
  assert.equal(briefSentence(mk(3, 0), {}).text, '3 are running, and nothing needs you.')
  assert.equal(briefSentence(mk(0, 0), {}).text, 'Nothing is running and nothing needs you.')
})

test('needsYouTasks orders failed, then blocked, then review, oldest first, and caps', () => {
  const tasks = [
    task({ id: 'r1', status: 'review', createdAt: iso(5000) }),
    task({ id: 'b-new', status: 'blocked', createdAt: iso(1000) }),
    task({ id: 'b-old', status: 'blocked', createdAt: iso(9000) }),
    task({ id: 'f1', status: 'failed', createdAt: iso(3000) }),
    task({ id: 'x', status: 'todo' }),
  ]
  assert.deepEqual(needsYouTasks(tasks, 10).map(t => t.id), ['f1', 'b-old', 'b-new', 'r1'])
  assert.deepEqual(needsYouTasks(tasks, 2).map(t => t.id), ['f1', 'b-old'])
})

test('upNextTasks takes queued work by priority then age and skips other lanes', () => {
  const tasks = [
    task({ id: 'lo-old', status: 'todo', priority: 0, createdAt: iso(9000) }),
    task({ id: 'hi', status: 'ready', priority: 10, createdAt: iso(1000) }),
    task({ id: 'lo-new', status: 'scheduled', priority: 0, createdAt: iso(2000) }),
    task({ id: 'blocked', status: 'blocked', priority: 20 }),
    task({ id: 'run', status: 'running', priority: 20 }),
  ]
  assert.deepEqual(upNextTasks(tasks, 3).map(t => t.id), ['hi', 'lo-old', 'lo-new'])
})

test('taskSort keeps the existing board ordering: pinned, blocked/failed, failures, oldest', () => {
  const pins = new Set(['p'])
  const list = [
    task({ id: 'old', status: 'todo', createdAt: iso(9000) }),
    task({ id: 'p', status: 'todo', createdAt: iso(1000) }),
    task({ id: 'blk', status: 'blocked', createdAt: iso(500) }),
    task({ id: 'flaky', status: 'todo', consecutiveFailures: 2, createdAt: iso(100) }),
  ]
  assert.deepEqual([...list].sort((a, b) => taskSort(a, b, pins)).map(t => t.id), ['p', 'blk', 'flaky', 'old'])
})

test('buildRoster consumes the canonical projection and retains unknown identities', () => {
  const projection = projectCrew({ tasks: [task({ status: 'blocked', assignee: 'none' })], heartbeats: [] }, new Date(NOW).toISOString())
  const roster = buildRoster(projection)
  assert.deepEqual(roster.rows, projection.members)
  assert.equal(roster.rows.find(r => r.id === 'pepper').kind, 'unknown')
  assert.equal(roster.unowned.count, 1)
  assert.equal(buildRoster(null).unowned.count, null)
})
