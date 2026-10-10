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

test('clusterSpansCounted keeps message counts; spansToHours carries them through', async () => {
  const { clusterSpansCounted } = await import('../lib/agent-timeline.ts')
  assert.deepEqual(clusterSpansCounted([1000, 1100, 1200, 5000]), [[1000, 1300, 3], [5000, 5300, 1]])
  assert.deepEqual(spansToHours([[0, 3600, 12]], 0), [{ start: 0, end: 1, n: 12 }])
})

test('sky geometry: lane stats, density levels, caps and failure folding stay honest', async () => {
  const g = await import('../lib/sky-geometry.ts')
  const row = { agent: 'a', spans: [{ start: 1, end: 2, n: 60 }, { start: 5, end: 5.5, n: 3 }, { start: 3, end: 3, failed: true }] }
  const st = g.laneStats(row, 6)
  assert.equal(st.bursts, 2)
  assert.equal(st.busyHours, 1.5)
  assert.equal(st.share, 0.25)
  assert.equal(st.fails, 1)
  assert.equal(st.live, false)
  assert.equal(g.laneStats({ agent: 'b', spans: [{ start: 5.9, end: 6 }] }, 6).live, true)
  // a lane with only failures reports zero work, never invented bursts
  assert.deepEqual(g.laneStats({ agent: 'c', spans: [{ start: 2, end: 2, failed: true }] }, 6), { bursts: 0, busyHours: 0, share: 0, fails: 1, live: false })

  const level = g.spanLevels([row])
  assert.equal(level(row.spans[0]), 2) // the densest span is hot
  assert.equal(level(row.spans[1]), 0) // 0.1 msg/min vs 1 msg/min is quiet
  assert.equal(level({ start: 0, end: 1 }), 1) // no count: middle, not a guess either way

  const many = Array.from({ length: 10 }, (_, i) => ({ start: i, end: i + 0.5, n: 1 }))
  many[3] = { start: 3, end: 3.9, n: 1 } // closest gap is 3.9 -> 4
  const capped = g.capSpans(many, 9)
  assert.equal(capped.length, 9)
  assert.deepEqual(capped[3], { start: 3, end: 4.5, n: 2 })

  assert.deepEqual(g.failMarks([{ start: 1, end: 1, failed: true }, { start: 1.1, end: 1.1, failed: true }, { start: 4, end: 4, failed: true }]), [{ at: 1, count: 2 }, { at: 4, count: 1 }])

  const d = g.strandPaths([{ start: 1, end: 2, n: 60 }, { start: 5, end: 5, n: 1 }], level, h => h * 10, 7, 3)
  assert.equal(d.length, g.LEVELS)
  assert.equal(d[2], 'M10.00 7H20.00')
  assert.equal(d[1], 'M50.00 7H53.00') // a zero-length burst still draws a minW tick (5-min rate floor puts it mid)

  assert.equal(g.clock(13 + 41 / 60), '13:41')
  assert.equal(g.clock(13 + 41.9 / 60), '13:41') // truncates like toLocaleTimeString
  assert.equal(g.span(2.0833), '2h 05m')
  assert.equal(g.span(0.5), '30m')
})
