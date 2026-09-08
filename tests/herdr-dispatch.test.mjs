import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHerdrDispatcher } from '../lib/herdr-dispatch.ts'
import { HerdrError } from '../lib/herdr-bridge.ts'

test('dispatch claims before spawn, records link, releases safe failures and retains uncertain claims', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-dispatch-test-'))
  const cwd = path.join(root, 'task')
  fs.mkdirSync(cwd)
  const previous = process.env.FRIDAY_KANBAN_WORKSPACE_ROOT
  process.env.FRIDAY_KANBAN_WORKSPACE_ROOT = root
  const events = []
  let failure
  const ok = name => (...args) => { events.push([name, ...args]); return { ok: true, result: 'ok' } }
  const dispatch = createHerdrDispatcher({
    herdr: { snapshot: async () => ({ available: true }), spawn: async input => { events.push(['spawn', input]); if (failure) throw failure; return { ok: true, target: 'w3:pA', name: 'worker' } } },
    claimTask: ok('claim'), commentTask: ok('comment'), reclaimTask: ok('reclaim'), unblockTask: ok('unblock'), reopenReviewTask: ok('reopen'),
  })
  const detail = { id: 't_smoke', title: 'Only test', status: 'ready', priority: 0, consecutiveFailures: 0, workspacePath: cwd, origin: os.hostname() }
  try {
    const result = await dispatch(detail.id, detail, { kind: 'codex' })
    assert.equal(result.target, 'w3:pA')
    assert.deepEqual(events.map(e => e[0]), ['claim', 'spawn', 'comment'])
    assert.equal(events[1][1].cwd, cwd)
    assert.match(events[2][2], /agent=w3%3ApA/)
    events.length = 0
    failure = new HerdrError('before start')
    await assert.rejects(dispatch(detail.id, detail, { kind: 'codex' }))
    assert.deepEqual(events.map(e => e[0]), ['claim', 'spawn', 'reclaim'])
    events.length = 0
    failure = new HerdrError('uncertain', 502, 'w3:pA')
    await assert.rejects(dispatch(detail.id, detail, { kind: 'codex' }))
    assert.deepEqual(events.map(e => e[0]), ['claim', 'spawn', 'comment'])
    events.length = 0
    await assert.rejects(dispatch(detail.id, { ...detail, origin: 'remote-host' }, { kind: 'codex' }), { status: 400 })
    await assert.rejects(dispatch(detail.id, detail, { kind: 'codex', workdir: '/tmp' }), { status: 400 })
    await assert.rejects(dispatch(detail.id, { ...detail, status: 'running' }, { kind: 'codex' }), { status: 409 })
    assert.equal(events.length, 0)
  } finally {
    if (previous === undefined) delete process.env.FRIDAY_KANBAN_WORKSPACE_ROOT; else process.env.FRIDAY_KANBAN_WORKSPACE_ROOT = previous
    fs.rmdirSync(cwd)
    fs.rmdirSync(root)
  }
})
