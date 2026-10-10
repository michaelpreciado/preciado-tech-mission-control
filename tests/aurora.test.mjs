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

test('hourCoverage is the busy share of each hour; failures never count as work', async () => {
  const { hourCoverage } = await import('../lib/glyph-series.ts')
  const cover = hourCoverage([{ start: 1.5, end: 3 }, { start: 5, end: 5.25 }, { start: 7, end: 7, failed: true }], 8)
  assert.deepEqual(cover, [0, 0.5, 1, 0, 0, 0.25, 0, 0])
  assert.deepEqual(hourCoverage([], 3), [0, 0, 0])
  // overlapping spans cap at a full hour
  assert.deepEqual(hourCoverage([{ start: 0, end: 1 }, { start: 0.5, end: 1 }], 1), [1])
})

test('sparkGlyphs is zero-anchored and never draws a zero as a bar', async () => {
  const { sparkGlyphs } = await import('../lib/glyph-series.ts')
  assert.equal(sparkGlyphs([0, 1, 2, 4, 8]), '·▁▂▄█')
  assert.equal(sparkGlyphs([0, 0, 0]), '···')
  assert.equal(sparkGlyphs([]), '')
  assert.equal(sparkGlyphs([5, NaN, 5]), '█·█')
})
