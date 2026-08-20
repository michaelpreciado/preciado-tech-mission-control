import test from 'node:test'
import assert from 'node:assert/strict'
import { usageFromObject, isLocalModel, isCloudRoutedModel, usageIdentity, throughputIdentity, billingMode, billableOf } from '../lib/collectors/costs-usage.ts'

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

/* ── local vs cloud-routed classification ───────────────────────────── */

test('isLocalModel accepts genuinely local ollama models', () => {
  assert.equal(isLocalModel('ollama', 'gemma4:26b'), true)
  assert.equal(isLocalModel('ollama', 'qwen3.6:27b'), true)
  assert.equal(isLocalModel('OLLAMA', 'friday-code'), true)
})

test('isLocalModel rejects ollama cloud-routed models', () => {
  // `:cloud` is Ollama's suffix for models executed on their hosted hardware.
  // They are neither free nor local, so counting them as avoided cost lies.
  assert.equal(isLocalModel('ollama', 'minimax-m2.5:cloud'), false)
  assert.equal(isLocalModel('ollama', 'gpt-oss:120b-cloud'), false)
  assert.equal(isLocalModel('ollama', 'SOMETHING:CLOUD'), false)
})

test('isLocalModel rejects every non-ollama provider', () => {
  assert.equal(isLocalModel('openrouter', 'moonshotai/kimi-k2.6'), false)
  assert.equal(isLocalModel('anthropic', 'sonnet-5'), false)
  assert.equal(isLocalModel('', 'gemma4:26b'), false)
})

test('isCloudRoutedModel only flags the cloud suffix, not the word in a name', () => {
  assert.equal(isCloudRoutedModel('minimax-m2.5:cloud'), true)
  assert.equal(isCloudRoutedModel('gpt-oss:120b-cloud'), true)
  assert.equal(isCloudRoutedModel('cloudy-llama:7b'), false)
  assert.equal(isCloudRoutedModel('gemma4:26b'), false)
})

/* ── usageIdentity: duplicate collapsing ──────────────────────────────── */

test('usageIdentity prefers the provider responseId', () => {
  const u = { model: 'gpt-5.5', input: 10, output: 2, cacheRead: 0, cacheWrite: 0, timestamp: '2026-04-28T23:33:19.971Z' }
  const a = usageIdentity({ message: { responseId: 'resp_abc' } }, u)
  // Same call replayed into a checkpoint file: different envelope timestamp and
  // different envelope id, same responseId — must collapse to one record.
  const b = usageIdentity({ message: { responseId: 'resp_abc' } }, { ...u, timestamp: '2026-04-28T23:33:20.080Z' })
  assert.equal(a, b)
})

test('usageIdentity keeps distinct responseIds apart', () => {
  const u = { model: 'gpt-5.5', input: 10, output: 2, cacheRead: 0, cacheWrite: 0, timestamp: 't' }
  assert.notEqual(usageIdentity({ message: { responseId: 'a' } }, u), usageIdentity({ message: { responseId: 'b' } }, u))
})

test('usageIdentity falls back to a content key when there is no responseId', () => {
  const u = { model: 'gemma4:26b', input: 10, output: 2, cacheRead: 0, cacheWrite: 0, timestamp: '2026-08-01T00:00:00.000Z' }
  const a = usageIdentity({}, u)
  assert.equal(a, usageIdentity({}, { ...u }))
  // Two real calls a millisecond apart are different calls, not duplicates.
  assert.notEqual(a, usageIdentity({}, { ...u, timestamp: '2026-08-01T00:00:00.001Z' }))
  // Same instant but different token counts is likewise two records.
  assert.notEqual(a, usageIdentity({}, { ...u, output: 3 }))
})

test('throughputIdentity collapses a turn re-emitted by later snapshots', () => {
  const s = { model: 'gemma4:26b', timestamp: '2026-08-01T00:00:00.000Z', outputTokens: 128 }
  assert.equal(throughputIdentity(s), throughputIdentity({ ...s }))
  assert.notEqual(throughputIdentity(s), throughputIdentity({ ...s, timestamp: '2026-08-01T00:00:05.000Z' }))
})


/* ── billingMode: never sum across payment models ─────────────────────── */

test('billingMode routes ollama to local and :cloud to cloud-routed', () => {
  assert.equal(billingMode('ollama', 'gemma4:26b'), 'local')
  assert.equal(billingMode('ollama', 'minimax-m2.5:cloud'), 'cloud-routed')
})

test('billingMode treats flat-plan providers as subscription', () => {
  assert.equal(billingMode('openai', 'gpt-5.5'), 'subscription')
  assert.equal(billingMode('openai-codex', 'gpt-5.5'), 'subscription')
  assert.equal(billingMode('anthropic', 'claude-opus-5'), 'subscription')
})

test('billingMode keeps a subscription vendor metered when reached via a paid gateway', () => {
  // The model is Anthropic's, but it was bought from OpenRouter by the token.
  // Classifying on the vendor rather than the provider would zero out real spend.
  assert.equal(billingMode('openrouter', 'anthropic/claude-sonnet-4-5'), 'metered')
  assert.equal(billingMode('openrouter', 'openai/gpt-5.5'), 'metered')
})

test('billingMode accepts an override list', () => {
  assert.equal(billingMode('openai', 'gpt-5.5', ['anthropic']), 'metered')
})

test('billableOf excludes cache reads', () => {
  // 837M cache reads against 30M of real input/output: including reads made
  // this model outrank everything by 27x for the same amount of work.
  assert.equal(billableOf({ input: 29_900_000, output: 540_000, cacheWrite: 0 }), 30_440_000)
  assert.equal(billableOf({ input: 10, output: 5, cacheWrite: 2 }), 17)
})
