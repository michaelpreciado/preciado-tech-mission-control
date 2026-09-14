import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCodexRateLimits } from '../lib/collectors/codex-usage.ts'

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
