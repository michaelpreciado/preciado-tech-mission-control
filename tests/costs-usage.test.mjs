import test from 'node:test'
import assert from 'node:assert/strict'
import { usageFromObject } from '../lib/collectors/costs-usage.ts'

test('usageFromObject parses the legacy Claude shape (message.usage)', () => {
  const r = usageFromObject({
    timestamp: 1710000000000,
    message: {
      usage: {
        input_tokens: 120,
        output_tokens: 40,
        cache_write_tokens: 10,
        cache_read_tokens: 5,
      },
      model: 'claude-sonnet-20240620',
    },
  })
  assert.equal(r.input, 120)
  assert.equal(r.output, 40)
  assert.equal(r.cacheRead, 5)
  assert.equal(r.cacheWrite, 10)
  assert.equal(r.total, 175)
  assert.equal(r.billableTokens, 170) // input + output + cacheWrite only
  assert.equal(r.model, 'claude-sonnet-20240620')
  assert.equal(r.failed, false)
})

test('usageFromObject parses the current OpenClaw model.completed shape (data.usage)', () => {
  const r = usageFromObject({
    data: {
      usage: { prompt_tokens: 200, completion_tokens: 30 },
      model: 'openai/gpt-4o-mini',
      ts: 1710000000000,
    },
  })
  assert.equal(r.input, 200)
  assert.equal(r.output, 30)
  assert.equal(r.total, 230)
  assert.equal(r.provider, 'openai') // derived from 'model' containing '/'
})

test('usageFromObject returns null when no usage is present', () => {
  assert.equal(usageFromObject({ message: { role: 'assistant', content: 'hi' } }), null)
  assert.equal(usageFromObject({ timestamp: 1 }), null)
  assert.equal(usageFromObject(null), null)
})

test('usageFromObject from object with no message key (flat shape)', () => {
  const r = usageFromObject({ usage: { input: 10, output: 2, model: 'm' } })
  assert.equal(r.input, 10)
  assert.equal(r.output, 2)
})

test('usageFromObject clamps negative cost placeholders to zero', () => {
  const r = usageFromObject({ usage: { input_tokens: 1, output_tokens: 1, cost: { total: -1.5 } } })
  assert.equal(r.cost, 0)
  // positive cost survives
  const ok = usageFromObject({ usage: { input_tokens: 1, output_tokens: 1, cost: { total: 0.05 } } })
  assert.equal(ok.cost, 0.05)
})

test('usageFromObject flags errored traces', () => {
  const r = usageFromObject({ message: { errorMessage: 'boom', usage: { input_tokens: 1 } } })
  assert.equal(r.failed, true)
  const e = usageFromObject({ data: { error: 'x', usage: { input_tokens: 1 } } })
  assert.equal(e.failed, true)
})

test('usageFromObject normalizes numeric timestamps to ISO', () => {
  const r = usageFromObject({ timestamp: 1710000000000, usage: { input_tokens: 1 } })
  assert.match(r.timestamp, /^2024-03-09T/)
})
