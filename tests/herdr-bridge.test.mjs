import test from 'node:test'
import assert from 'node:assert/strict'
import { createHerdrBridge, normalizeSnapshot, validateSpawn } from '../lib/herdr-bridge.ts'

test('normalization uses global focus and pane cwd fallback', () => {
  const result = normalizeSnapshot({ focused_pane_id: 'w1:p2', panes: [{ pane_id: 'w1:p2', workspace_id: 'w1', cwd: '/tmp' }], workspaces: [{ workspace_id: 'w1', label: 'Work' }] }, { agents: [{ pane_id: 'w1:p2', name: 'A', agent: 'codex', agent_status: 'working' }, { pane_id: '--bad' }] })
  assert.equal(result.agents.length, 1)
  assert.deepEqual(result.agents[0], { id: 'w1:p2', name: 'A', kind: 'codex', status: 'working', cwd: '/tmp', focused: true })
  assert.equal(result.workspaces[0].cwd, '/tmp')
})

test('snapshot shares concurrent reads and caches unavailable state', async () => {
  let calls = 0
  const bridge = createHerdrBridge(async () => { calls++; throw new Error('private stderr') })
  const results = await Promise.all([bridge.snapshot(), bridge.snapshot(), bridge.snapshot()])
  assert.equal(calls, 2)
  assert.ok(results.every(value => value.available === false && value.agents.length === 0))
  assert.ok(!JSON.stringify(results).includes('private stderr'))
  await bridge.snapshot()
  assert.equal(calls, 2)
})

test('prompts remain a single argument and interrupt only sends ctrl+c', async () => {
  const calls = []
  const bridge = createHerdrBridge(async args => { calls.push(args); return {} })
  const prompt = 'quotes " and `commands` $(touch /tmp/nope)\nnext line'
  await bridge.operate({ op: 'prompt', target: 'w1:p2', text: prompt })
  assert.equal(calls[0].filter(arg => arg === prompt).length, 1)
  assert.deepEqual(calls[0].slice(0, 3), ['agent', 'prompt', 'w1:p2'])
  await bridge.operate({ op: 'stop', target: 'w1:p2' })
  assert.deepEqual(calls[1], ['agent', 'send-keys', 'w1:p2', 'ctrl+c'])
})

test('in-flight tails survive invalidation without duplicated CLI reads', async () => {
  let resolve
  let calls = 0
  const bridge = createHerdrBridge(async () => { calls++; return await new Promise(r => { resolve = r }) })
  const first = bridge.tail('w1:p2', 80)
  bridge.invalidate()
  const second = bridge.tail('w1:p2', 80)
  assert.equal(calls, 1)
  resolve({ read: { text: 'real wrapper' } })
  assert.equal((await first).text, 'real wrapper')
  await second
})

test('snapshot finishing after invalidation is not reused as cached truth', async () => {
  let release
  let calls = 0
  const bridge = createHerdrBridge(async args => {
    calls++
    if (args[0] === 'agent') return { agents: [] }
    if (calls === 1) await new Promise(resolve => { release = resolve })
    return { snapshot: { panes: [], workspaces: [] } }
  })
  const pending = bridge.snapshot()
  bridge.invalidate()
  release()
  await pending
  await bridge.snapshot()
  assert.equal(calls, 4)
})

test('spawn with no focused pane uses returned workspace root pane', async () => {
  const calls = []
  const bridge = createHerdrBridge(async args => {
    calls.push(args)
    if (args[0] === 'api') return { snapshot: {} }
    if (args[0] === 'workspace') return { root_pane: { pane_id: 'w8:p1' } }
    return {}
  })
  assert.equal((await bridge.spawn({ kind: 'codex', cwd: '/tmp', prompt: '--literal input' })).target, 'w8:p1')
  assert.deepEqual(calls.at(-1), ['agent', 'prompt', 'w8:p1', '--literal input'])
})

test('invalid targets, arbitrary keys, options and relative cwd rejected before execution', async () => {
  let calls = 0
  const bridge = createHerdrBridge(async () => { calls++; return {} })
  for (const payload of [{ op: 'focus', target: '--help' }, { op: 'send-keys', target: 'w1:p1', keys: ['rm -rf'] }, { op: 'send-keys', target: 'w1:p1', keys: [] }]) await assert.rejects(bridge.operate(payload), { status: 400 })
  assert.throws(() => validateSpawn({ kind: 'codex', cwd: 'relative' }), { status: 400 })
  assert.throws(() => validateSpawn({ kind: 'codex', cwd: '/tmp', model: '--help' }), { status: 400 })
  assert.equal(calls, 0)
})

test('tail shares reads, strips escape controls, and validates line budget', async () => {
  let calls = 0
  const bridge = createHerdrBridge(async () => { calls++; return { output: { text: '\u001b[31mred\u001b[0m\nline\u0000' } } })
  const values = await Promise.all([bridge.tail('w1:p1', 80), bridge.tail('w1:p1', 80)])
  assert.equal(calls, 1)
  assert.equal(values[0].text, 'red\nline')
  for (const lines of [0, 201, 1.5, NaN]) await assert.rejects(bridge.tail('w1:p1', lines), { status: 400 })
})

test('tail distinct request budget is bounded', async () => {
  const bridge = createHerdrBridge(async () => ({ text: 'ok' }))
  await Promise.all(Array.from({ length: 64 }, (_, i) => bridge.tail(`w1:p${i}`, 1)))
  await assert.rejects(bridge.tail('w1:p99', 1), { status: 429 })
})

test('failed startup identifies created pane and never retries or closes it', async () => {
  const calls = []
  const bridge = createHerdrBridge(async args => {
    calls.push(args)
    if (args[0] === 'api') return { snapshot: { focused_pane_id: 'w1:p1' } }
    if (args[0] === 'pane') return { pane_id: 'w1:pA' }
    throw new Error('timeout')
  })
  await assert.rejects(bridge.spawn({ kind: 'codex', cwd: '/tmp' }), { status: 502, target: 'w1:pA' })
  assert.equal(calls.length, 3)
})
