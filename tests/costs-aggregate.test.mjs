import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateFile, foldRecords, calendarWindow, isRealModelRow, rollupModes, emptyModel,
} from '../lib/collectors/costs-aggregate.ts'

/* ══════════════════════════════════════════════════════════════════════
   Fixtures reproduce the shapes that were actually mis-counted in the
   local session tree. Each is one line of JSONL exactly as OpenClaw
   writes it, trimmed to the fields the pipeline reads.
   ══════════════════════════════════════════════════════════════════════ */

/** One assistant turn billed through OpenRouter. */
function meteredTurn({ responseId, ts, input = 1000, output = 100, cacheRead = 5000, cost = 0.25 }) {
  return JSON.stringify({
    type: 'message', id: responseId.slice(0, 8), timestamp: ts,
    message: {
      role: 'assistant', provider: 'openrouter', model: 'minimax/minimax-m2.5', responseId,
      usage: {
        input_tokens: input, output_tokens: output, cache_read_tokens: cacheRead, cache_write_tokens: 0,
        cost: { input: cost * 0.4, output: cost * 0.2, cacheRead: cost * 0.4, cacheWrite: 0, total: cost },
      },
    },
  })
}

/** A turn on a flat-plan provider. It logs a list-rate price it never paid. */
function subscriptionTurn({ responseId, ts, cost = 0.7 }) {
  return JSON.stringify({
    type: 'message', timestamp: ts,
    message: {
      role: 'assistant', provider: 'openai', api: 'openai-chatgpt-responses',
      model: 'gpt-5.5', responseId,
      usage: {
        input_tokens: 2000, output_tokens: 50, cache_read_tokens: 40_000, cache_write_tokens: 0,
        cost: { input: cost, output: 0, cacheRead: 0, cacheWrite: 0, total: cost },
      },
    },
  })
}

/** Ollama on this machine: no cache reads, no price. */
function localTurn({ ts, model = 'gemma4:26b', input = 4000, output = 200 }) {
  return JSON.stringify({
    type: 'message', timestamp: ts,
    message: { role: 'assistant', provider: 'ollama', model, usage: { input_tokens: input, output_tokens: output } },
  })
}

const collect = text => foldRecords(aggregateFile(text).records)
const model = (byModel, key) => byModel.get(key)

/* ── Duplicate collapsing ───────────────────────────────────────────── */

test('a checkpoint replaying a session does not double-count its turns', () => {
  // The exact failure: OpenClaw writes the trajectory AND a checkpoint per
  // fork, each carrying the whole conversation. Same responseId, different
  // envelope id and a timestamp a few ms apart.
  const trajectory = meteredTurn({ responseId: 'resp_a', ts: '2026-08-01T00:00:00.000Z' })
  const checkpoint = meteredTurn({ responseId: 'resp_a', ts: '2026-08-01T00:00:00.109Z' })
  const { byModel } = collect(`${trajectory}\n${checkpoint}`)
  const m = model(byModel, 'openrouter::minimax/minimax-m2.5')
  assert.equal(m.requests, 1, 'the same API call must count once')
  assert.equal(m.estimatedCostUsd, 0.25, 'and must be billed once')
})

test('the same call replayed across separate files still counts once', () => {
  // aggregateFile returns identity-keyed records precisely so the merge can
  // be a set union across files. Summing per-file partials was the bug.
  const line = meteredTurn({ responseId: 'resp_b', ts: '2026-08-01T00:00:00.000Z' })
  const merged = new Map([...aggregateFile(line).records, ...aggregateFile(line).records])
  const { byModel } = foldRecords(merged)
  assert.equal(model(byModel, 'openrouter::minimax/minimax-m2.5').requests, 1)
})

test('genuinely distinct calls are never collapsed', () => {
  const a = meteredTurn({ responseId: 'resp_c', ts: '2026-08-01T00:00:00.000Z' })
  const b = meteredTurn({ responseId: 'resp_d', ts: '2026-08-01T00:00:01.000Z' })
  const { byModel } = collect(`${a}\n${b}`)
  const m = model(byModel, 'openrouter::minimax/minimax-m2.5')
  assert.equal(m.requests, 2)
  assert.equal(Math.round(m.estimatedCostUsd * 100) / 100, 0.5)
})

test('records with no responseId fall back to a content key', () => {
  // Ollama turns carry no responseId. Two turns at the same instant with the
  // same token counts are indistinguishable and collapse; a later one does not.
  const same = localTurn({ ts: '2026-08-01T00:00:00.000Z' })
  const later = localTurn({ ts: '2026-08-01T00:00:02.000Z' })
  assert.equal(collect(`${same}\n${same}`).byModel.get('ollama::gemma4:26b').requests, 1)
  assert.equal(collect(`${same}\n${later}`).byModel.get('ollama::gemma4:26b').requests, 2)
})

/* ── Token basis ────────────────────────────────────────────────────── */

test('billable tokens exclude cache reads', () => {
  const { byModel } = collect(meteredTurn({ responseId: 'r', ts: '2026-08-01T00:00:00.000Z' }))
  const m = model(byModel, 'openrouter::minimax/minimax-m2.5')
  assert.equal(m.billableTokens, 1100, 'input + output + cache writes only')
  assert.equal(m.cacheReadTokens, 5000, 'reads are kept, just kept apart')
  assert.equal(m.totalTokens, 6100)
})

test('a cached model does not outrank a local one on billable tokens', () => {
  // Ranking on totals put a cached agent loop 27x above the rig for
  // comparable work, because Ollama reports no cache reads at all.
  const cached = meteredTurn({ responseId: 'r1', ts: '2026-08-01T00:00:00.000Z', input: 1000, output: 100, cacheRead: 900_000 })
  const local = localTurn({ ts: '2026-08-01T00:00:00.000Z', input: 40_000, output: 2000 })
  const { byModel } = collect(`${cached}\n${local}`)
  const api = model(byModel, 'openrouter::minimax/minimax-m2.5')
  const rig = model(byModel, 'ollama::gemma4:26b')
  assert.ok(api.totalTokens > rig.totalTokens, 'on totals the cached model wins')
  assert.ok(rig.billableTokens > api.billableTokens, 'on billable tokens the rig wins')
})

/* ── Billing mode ───────────────────────────────────────────────────── */

test('each provider lands in the right billing mode', () => {
  const text = [
    meteredTurn({ responseId: 'r1', ts: '2026-08-01T00:00:00.000Z' }),
    subscriptionTurn({ responseId: 'r2', ts: '2026-08-01T00:00:01.000Z' }),
    localTurn({ ts: '2026-08-01T00:00:02.000Z' }),
    localTurn({ ts: '2026-08-01T00:00:03.000Z', model: 'minimax-m2.5:cloud' }),
  ].join('\n')
  const { byModel } = collect(text)
  assert.equal(model(byModel, 'openrouter::minimax/minimax-m2.5').mode, 'metered')
  assert.equal(model(byModel, 'openai::gpt-5.5').mode, 'subscription')
  assert.equal(model(byModel, 'ollama::gemma4:26b').mode, 'local')
  assert.equal(model(byModel, 'ollama::minimax-m2.5:cloud').mode, 'cloud-routed')
})

test('rollupModes keeps plan list-rate dollars out of spend', () => {
  const text = [
    meteredTurn({ responseId: 'r1', ts: '2026-08-01T00:00:00.000Z', cost: 0.25 }),
    subscriptionTurn({ responseId: 'r2', ts: '2026-08-01T00:00:01.000Z', cost: 0.7 }),
  ].join('\n')
  const { byModel } = collect(text)
  const modes = rollupModes([...byModel.values()])
  const metered = modes.find(m => m.mode === 'metered')
  const sub = modes.find(m => m.mode === 'subscription')

  assert.equal(metered.costUsd, 0.25)
  assert.equal(metered.notionalCostUsd, 0)
  assert.equal(sub.costUsd, 0, 'a flat plan already paid for this — it is not spend')
  assert.equal(sub.notionalCostUsd, 0.7, 'but the figure is still reported, not discarded')
})

test('rollupModes drops modes with no usage and keeps a stable order', () => {
  const { byModel } = collect(localTurn({ ts: '2026-08-01T00:00:00.000Z' }))
  const modes = rollupModes([...byModel.values()])
  assert.deepEqual(modes.map(m => m.mode), ['local'])
})

/* ── Windowing ──────────────────────────────────────────────────────── */

test('calendarWindow is a calendar window, not the last N active days', () => {
  // The bug: slice(-30) on a sparse series reached back 76 calendar days
  // while every label on the page said "last 30 days".
  const now = Date.parse('2026-08-20T12:00:00.000Z')
  const rows = [
    { date: '2026-06-06' }, // 75 days back — must be excluded
    { date: '2026-07-21' }, // 30 days back, just outside a 30-day window
    { date: '2026-07-22' }, // exactly the cutoff — included
    { date: '2026-08-20' },
  ]
  assert.deepEqual(calendarWindow(rows, 30, now).map(r => r.date), ['2026-07-22', '2026-08-20'])
})

test('calendarWindow sorts ascending and rejects malformed dates', () => {
  const now = Date.parse('2026-08-20T12:00:00.000Z')
  const rows = [{ date: '2026-08-19' }, { date: 'unknown' }, { date: '2026-08-01' }]
  assert.deepEqual(calendarWindow(rows, 30, now).map(r => r.date), ['2026-08-01', '2026-08-19'])
})

/* ── Per-day aggregation ────────────────────────────────────────────── */

test('per-day rows carry billable tokens alongside totals', () => {
  // The table showed a 30-day TOTAL beside an all-time BILLABLE column, so
  // 496M sat next to 2.0M on one row. Both bases must exist per day.
  const { byDay } = collect(meteredTurn({ responseId: 'r', ts: '2026-08-05T09:00:00.000Z' }))
  const day = byDay.get('2026-08-05')
  assert.equal(day.tokens, 6100)
  assert.equal(day.billableTokens, 1100)
  assert.equal(day.byModel['minimax/minimax-m2.5'].billable, 1100)
  assert.equal(day.byModel['minimax/minimax-m2.5'].tokens, 6100)
  assert.equal(day.byModel['minimax/minimax-m2.5'].requests, 1)
})

test('turns are bucketed by their own timestamp, not the file order', () => {
  const text = [
    meteredTurn({ responseId: 'r1', ts: '2026-08-05T23:59:00.000Z' }),
    meteredTurn({ responseId: 'r2', ts: '2026-08-06T00:01:00.000Z' }),
  ].join('\n')
  const { byDay } = collect(text)
  assert.deepEqual([...byDay.keys()].sort(), ['2026-08-05', '2026-08-06'])
})

/* ── Robustness ─────────────────────────────────────────────────────── */

test('malformed and irrelevant lines are skipped without throwing', () => {
  const text = [
    '', '   ', '{not json', '{"type":"message"}',
    JSON.stringify({ type: 'message', message: { usage: {} } }), // usage present, all zero
    meteredTurn({ responseId: 'r', ts: '2026-08-01T00:00:00.000Z' }),
  ].join('\n')
  const { byModel } = collect(text)
  assert.equal(model(byModel, 'openrouter::minimax/minimax-m2.5').requests, 1)
})

test('a negative logged cost is treated as unknown, not as a credit', () => {
  const line = JSON.stringify({
    type: 'message', timestamp: '2026-08-01T00:00:00.000Z',
    message: {
      provider: 'openrouter', model: 'x/y', responseId: 'neg',
      usage: { input_tokens: 10, output_tokens: 1, cost: { total: -5 } },
    },
  })
  assert.equal(collect(line).byModel.get('openrouter::x/y').estimatedCostUsd, 0)
})

test('lastUsedAt is the newest turn, whatever order the file is in', () => {
  const text = [
    meteredTurn({ responseId: 'r2', ts: '2026-08-09T00:00:00.000Z' }),
    meteredTurn({ responseId: 'r1', ts: '2026-08-01T00:00:00.000Z' }),
  ].join('\n')
  const { byModel } = collect(text)
  assert.equal(model(byModel, 'openrouter::minimax/minimax-m2.5').lastUsedAt, '2026-08-09T00:00:00.000Z')
})

/* ── Row filtering ──────────────────────────────────────────────────── */

test('isRealModelRow drops transport plumbing but keeps anything that moved tokens', () => {
  const router = emptyModel('local-ai-router', 'localrouter')  // 0 tokens, 0 cost
  const worked = { ...emptyModel('gemma4:26b', 'ollama'), totalTokens: 500 }
  const charged = { ...emptyModel('x/y', 'openrouter'), estimatedCostUsd: 0.01 }
  assert.equal(isRealModelRow(router), false)
  assert.equal(isRealModelRow(worked), true)
  assert.equal(isRealModelRow(charged), true, 'a priced row counts even with no token total')
})

/* ── Throughput samples ─────────────────────────────────────────────── */

test('a turn re-emitted by later snapshots is sampled once', () => {
  // model.completed embeds the whole messagesSnapshot, so every event
  // re-emits a sample for each earlier turn. Turn 1 of a 40-turn session was
  // counted 40 times and dragged the average toward whatever it happened to do.
  const snapshot = (turns) => JSON.stringify({
    type: 'model.completed', provider: 'ollama', modelId: 'gemma4:26b',
    data: { messagesSnapshot: turns },
  })
  const t1 = { role: 'user', timestamp: 1_000 }
  const t2 = { role: 'assistant', timestamp: 3_000, usage: { output: 60 } }
  const t3 = { role: 'user', timestamp: 4_000 }
  const t4 = { role: 'assistant', timestamp: 6_000, usage: { output: 40 } }

  const text = `${snapshot([t1, t2])}\n${snapshot([t1, t2, t3, t4])}`
  const { samples } = aggregateFile(text)
  assert.equal(samples.size, 2, 'two assistant turns, not three')
  const rates = [...samples.values()].map(s => Math.round(s.tokensPerSec))
  assert.deepEqual(rates.sort((a, b) => a - b), [20, 30])
})
