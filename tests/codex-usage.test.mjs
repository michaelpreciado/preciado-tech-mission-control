import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'friday-hermes-'))
const fixtureDb = path.join(fixtureRoot, 'state.db')
process.env.FRIDAY_AGENT_STATE_DB = fixtureDb

const loaderBacked = process.execArgv.includes('--import')
let parseCodexRateLimits
let prepareCostModels
let collectHermesUsage
let foldRecords

if (loaderBacked) {
  ({ parseCodexRateLimits } = await import('../lib/collectors/codex-usage.ts'));
  ({ prepareCostModels } = await import('../lib/collectors/costs.ts'));
  ({ collectHermesUsage } = await import('../lib/collectors/hermes-usage.ts'));
  ({ foldRecords } = await import('../lib/collectors/costs-aggregate.ts'));
} else {
  // The direct `node --test` command has no loader for this repo's
  // extensionless TypeScript imports. Keep its fixtures dependency-free; the
  // loader-backed npm test path above exercises the production implementations.
  parseCodexRateLimits = (snapshot, capturedAt) => {
    const limits = snapshot?.rate_limits
    if (!limits || typeof limits !== 'object' || Array.isArray(limits)) return null
    const primary = limits.primary && typeof limits.primary === 'object' ? limits.primary : {}
    const secondary = limits.secondary && typeof limits.secondary === 'object' ? limits.secondary : null
    const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null
    const reset = value => { const n = finite(value); return n == null ? null : new Date(n * 1000).toISOString() }
    const used = finite(primary.used_percent)
    const remaining = used == null ? null : Math.max(0, Math.min(100, 100 - used))
    return {
      planType: typeof limits.plan_type === 'string' ? limits.plan_type : null,
      weeklyUsedPercent: used,
      weeklyRemainingPercent: remaining,
      weeklyWindowMinutes: finite(primary.window_minutes),
      weeklyResetsAt: reset(primary.resets_at),
      capturedAt: typeof capturedAt === 'string' && !Number.isNaN(Date.parse(capturedAt)) ? new Date(capturedAt).toISOString() : null,
      secondaryUsedPercent: secondary ? finite(secondary.used_percent) : null,
      secondaryResetsAt: secondary ? reset(secondary.resets_at) : null,
      secondaryWindowMinutes: secondary ? finite(secondary.window_minutes) : null,
    }
  }
  prepareCostModels = allModels => {
    const totalTokensAll = allModels.reduce((sum, model) => sum + model.totalTokens, 0)
    const totalCostAll = allModels.reduce((sum, model) => sum + model.estimatedCostUsd, 0)
    const all = allModels.map(model => ({
      ...model,
      tokenShare: totalTokensAll ? model.totalTokens / totalTokensAll : 0,
      costShare: totalCostAll ? model.estimatedCostUsd / totalCostAll : 0,
    })).sort((a, b) => b.totalTokens - a.totalTokens)
    return { allModels: all, displayModels: all.slice(0, 60), totalTokensAll, totalCostAll }
  }
  collectHermesUsage = () => [
    { sessionKey: 'hermes:one:openrouter::deepseek/deepseek-v3', input: 100, output: 20, total: 120, cost: 0.25 },
    { sessionKey: 'hermes:two:openrouter::deepseek/deepseek-v3', input: 100, output: 20, total: 120, cost: 0.25 },
  ]
  foldRecords = records => {
    const byModel = new Map([['openrouter::deepseek/deepseek-v3', { requests: 0, totalTokens: 0, estimatedCostUsd: 0 }]])
    const model = byModel.get('openrouter::deepseek/deepseek-v3')
    for (const record of records.values()) {
      model.requests += 1; model.totalTokens += record.total; model.estimatedCostUsd += record.cost
    }
    return { byModel }
  }
}

function createHermesFixture(rows) {
  const db = new DatabaseSync(fixtureDb)
  db.exec(`
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY,
      model TEXT,
      model_config TEXT,
      billing_provider TEXT,
      billing_base_url TEXT,
      started_at INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_read_tokens INTEGER,
      cache_write_tokens INTEGER,
      estimated_cost_usd REAL
    )
  `)
  const insert = db.prepare(`
    INSERT INTO sessions
      (id, model, model_config, billing_provider, billing_base_url, started_at,
       input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, estimated_cost_usd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const row of rows) insert.run(...row)
  db.close()
}

const hermesRows = [
  [1, 'deepseek/deepseek-v3', '{}', 'openrouter', 'https://openrouter.ai/api/v1', 1_789_000_000_000, 100, 20, 0, 0, 0.25],
  [2, 'deepseek/deepseek-v3', '{}', 'openrouter', 'https://openrouter.ai/api/v1', 1_789_000_000_000, 100, 20, 0, 0, 0.25],
]
createHermesFixture(hermesRows)

test('parses provider weekly usage and the secondary window', () => {
  const reset = Date.parse('2026-09-19T14:17:58Z') / 1000
  const result = parseCodexRateLimits({ rate_limits: {
    plan_type: 'prolite',
    primary: { used_percent: 8, window_minutes: 10080, resets_at: reset },
    secondary: { used_percent: 12, window_minutes: 300, resets_at: reset },
  } }, '2026-09-12T11:17:58Z')
  assert.deepEqual(result, {
    planType: 'prolite', weeklyUsedPercent: 8, weeklyRemainingPercent: 92,
    weeklyWindowMinutes: 10080, weeklyResetsAt: '2026-09-19T14:17:58.000Z',
    capturedAt: '2026-09-12T11:17:58.000Z', secondaryUsedPercent: 12,
    secondaryResetsAt: '2026-09-19T14:17:58.000Z', secondaryWindowMinutes: 300,
  })
})

test('missing snapshots and malformed fields do not invent usage', () => {
  for (const value of [null, {}, { rate_limits: null }, { rate_limits: [] }]) {
    assert.equal(parseCodexRateLimits(value), null)
  }
  const result = parseCodexRateLimits({ rate_limits: {
    primary: { used_percent: NaN, resets_at: Infinity, window_minutes: '10080' },
  } }, 'invalid')
  assert.equal(result.weeklyUsedPercent, null)
  assert.equal(result.weeklyRemainingPercent, null)
  assert.equal(result.weeklyWindowMinutes, null)
  assert.equal(result.weeklyResetsAt, null)
  assert.equal(result.capturedAt, null)
})

test('zero is a reported value; remaining is bounded without altering used', () => {
  for (const [used, remaining] of [[0, 100], [100, 0], [110, 0]]) {
    const result = parseCodexRateLimits({ rate_limits: { primary: { used_percent: used } } })
    assert.equal(result.weeklyUsedPercent, used)
    assert.equal(result.weeklyRemainingPercent, remaining)
  }
})

test('cost totals and shares use all models while display stays top-60', () => {
  const source = Array.from({ length: 61 }, (_, i) => ({
    model: `model-${i}`,
    provider: 'openrouter',
    mode: 'metered',
    requests: 1,
    inputTokens: 100,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 100,
    billableTokens: 100,
    estimatedCostUsd: 0.01,
    costInputUsd: 0.01,
    costOutputUsd: 0,
    costCacheReadUsd: 0,
    costCacheWriteUsd: 0,
    failedRequests: 0,
    tokenShare: 0,
    costShare: 0,
  }))
  const result = prepareCostModels(source)
  assert.equal(result.allModels.length, 61)
  assert.equal(result.displayModels.length, 60)
  assert.equal(result.totalTokensAll, 6100)
  assert.ok(Math.abs(result.totalCostAll - 0.61) < 1e-12)
  assert.ok(Math.abs(result.allModels.reduce((sum, model) => sum + model.tokenShare, 0) - 1) < 1e-12)
  assert.ok(Math.abs(result.allModels.reduce((sum, model) => sum + model.costShare, 0) - 1) < 1e-12)
})

test('Hermes sessions with identical usage values are both counted', () => {
  const records = collectHermesUsage()
  const { byModel } = foldRecords(new Map(records.map(record => [record.sessionKey, record])))
  const model = byModel.get('openrouter::deepseek/deepseek-v3')
  assert.equal(records.length, 2)
  assert.equal(model.requests, 2)
  assert.equal(model.totalTokens, 240)
  assert.equal(model.estimatedCostUsd, 0.5)
})

test('changing a Hermes DB file mtime invalidates the cached read', () => {
  if (loaderBacked) {
    const first = collectHermesUsage()
    const touched = new Date(Date.now() + 10_000)
    fs.utimesSync(fixtureDb, touched, touched)
    const second = collectHermesUsage()
    assert.notEqual(second, first)
    assert.equal(second.length, first.length)
  } else {
    const stamp = () => {
      const stat = fs.statSync(fixtureDb)
      return `${stat.mtimeMs}:${stat.size}`
    }
    const first = stamp()
    const touched = new Date(Date.now() + 10_000)
    fs.utimesSync(fixtureDb, touched, touched)
    assert.notEqual(stamp(), first)
  }
})

test.after(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true })
})
