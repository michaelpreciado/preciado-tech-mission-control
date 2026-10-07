import test from 'node:test'
import assert from 'node:assert/strict'
import { heroHeadline, countWord } from '../lib/aurora-copy.ts'
import { clusterSpans, spansToHours } from '../lib/agent-timeline.ts'

test('heroHeadline pluralizes from real counts', () => {
  assert.equal(heroHeadline({ waiting: 0, broken: [] }), 'Nothing is waiting on you, and nothing is broken.')
  assert.equal(heroHeadline({ waiting: 1, broken: [] }), 'One card is waiting on you, and nothing is broken.')
  assert.equal(heroHeadline({ waiting: 3, broken: ['the scout gateway is down'] }), 'Three cards are waiting on you, and the scout gateway is down.')
  assert.equal(heroHeadline({ waiting: 72, broken: ['a', 'b'] }), '72 cards are waiting on you, and two things are broken.')
  assert.equal(heroHeadline({ waiting: null, broken: [] }), 'Checking the task board…')
  assert.equal(heroHeadline({ waiting: null, broken: [], boardError: true }), 'The task board is unavailable right now.')
  assert.equal(countWord(13), '13')
})

test('clusterSpans splits on gaps and floors single messages', () => {
  const spans = clusterSpans([1000, 1100, 1200, 5000])
  assert.deepEqual(spans, [[1000, 1300], [5000, 5300]])
  assert.deepEqual(clusterSpans([]), [])
})

test('spansToHours clips to the day', () => {
  const out = spansToHours([[-1800, 3600], [86400 - 600, 86400 + 600], [200000, 201000]], 0)
  assert.deepEqual(out, [{ start: 0, end: 1 }, { start: 24 - 600 / 3600, end: 24 }])
})
