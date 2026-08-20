import test from 'node:test'
import assert from 'node:assert/strict'
import { extractThroughputSamples } from '../lib/collectors/ollama-throughput.ts'

function event(overrides = {}) {
  return {
    type: 'model.completed',
    provider: 'ollama',
    modelId: 'gemma4:26b',
    data: {
      messagesSnapshot: [
        { role: 'user', timestamp: 1000 },
        { role: 'assistant', timestamp: 3000, usage: { input: 50, output: 40, totalTokens: 90 } },
      ],
    },
    ...overrides,
  }
}

test('extractThroughputSamples computes tokens/sec from a well-formed ollama completion', () => {
  const samples = extractThroughputSamples(event())
  assert.equal(samples.length, 1)
  assert.equal(samples[0].model, 'gemma4:26b')
  assert.equal(samples[0].outputTokens, 40)
  assert.equal(samples[0].elapsedSec, 2)
  assert.equal(samples[0].tokensPerSec, 20)
})

test('extractThroughputSamples returns [] for a non-ollama provider', () => {
  const samples = extractThroughputSamples(event({ provider: 'openrouter' }))
  assert.deepEqual(samples, [])
})

test('extractThroughputSamples returns [] for a non-model.completed event', () => {
  const samples = extractThroughputSamples(event({ type: 'session.started' }))
  assert.deepEqual(samples, [])
})

test('extractThroughputSamples skips assistant turns with zero output tokens', () => {
  const samples = extractThroughputSamples(event({
    data: {
      messagesSnapshot: [
        { role: 'user', timestamp: 1000 },
        { role: 'assistant', timestamp: 3000, usage: { input: 50, output: 0, totalTokens: 50 } },
      ],
    },
  }))
  assert.deepEqual(samples, [])
})

test('extractThroughputSamples discards elapsed times outside the plausible inference window', () => {
  const tooFast = extractThroughputSamples(event({
    data: {
      messagesSnapshot: [
        { role: 'user', timestamp: 1000 },
        { role: 'assistant', timestamp: 1050, usage: { output: 40 } }, // 0.05s
      ],
    },
  }))
  assert.deepEqual(tooFast, [])

  const tooSlow = extractThroughputSamples(event({
    data: {
      messagesSnapshot: [
        { role: 'user', timestamp: 1000 },
        { role: 'assistant', timestamp: 1000 + 130_000, usage: { output: 40 } }, // 130s — idle gap, not inference
      ],
    },
  }))
  assert.deepEqual(tooSlow, [])
})

test('extractThroughputSamples produces one sample per assistant turn across a multi-turn snapshot', () => {
  const samples = extractThroughputSamples(event({
    data: {
      messagesSnapshot: [
        { role: 'user', timestamp: 1000 },
        { role: 'assistant', timestamp: 3000, usage: { output: 40 } },
        { role: 'tool', timestamp: 3500 },
        { role: 'assistant', timestamp: 5500, usage: { output: 60 } },
      ],
    },
  }))
  assert.equal(samples.length, 2)
  assert.equal(samples[0].tokensPerSec, 20)
  assert.equal(samples[1].tokensPerSec, 30)
})

test('extractThroughputSamples returns [] when messagesSnapshot is missing or too short', () => {
  assert.deepEqual(extractThroughputSamples(event({ data: {} })), [])
  assert.deepEqual(extractThroughputSamples(event({ data: { messagesSnapshot: [{ role: 'user', timestamp: 1 }] } })), [])
})
