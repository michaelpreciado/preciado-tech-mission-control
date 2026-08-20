import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanTitle, dayBucket, sourceGlyph, isJunk } from '../lib/conv-format.ts'

/* ── titles ─────────────────────────────────────────────────────────── */

test('cleanTitle passes a good title through untouched', () => {
  assert.equal(cleanTitle('Speed up SO 101 arm training with JEPA 2'), 'Speed up SO 101 arm training with JEPA 2')
})

test('cleanTitle strips a leading bracketed Note/System marker', () => {
  assert.equal(cleanTitle('[Note: model was just switched from qwen3.8:27b] fix the build'), 'fix the build')
  assert.equal(cleanTitle('[System: reminder] do the thing'), 'do the thing')
})

test('cleanTitle keeps the note text when nothing follows the marker', () => {
  assert.equal(cleanTitle('[Note: model was just switched from qwen3.8:27b]'),
    'model was just switched from qwen3.8:27b')
})

test('cleanTitle strips a Note marker whose closing bracket was truncated away', () => {
  // Hermes truncates long titles mid-string, so the ] is frequently missing.
  assert.equal(cleanTitle('[Note: model was just switched from qwen3.8:27b'),
    'model was just switched from qwen3.8:27b')
  assert.equal(cleanTitle('[System: reminder about the thing'), 'reminder about the thing')
})

test('cleanTitle unwraps control-token noise like < | DSML | tool_calls>', () => {
  assert.equal(cleanTitle('< | DSML | tool_calls>'), 'DSML tool_calls')
})

test('cleanTitle strips markdown emphasis and backticks', () => {
  assert.equal(cleanTitle('**Bold** and `code` title'), 'Bold and code title')
})

test('cleanTitle collapses whitespace and newlines', () => {
  assert.equal(cleanTitle('too   many\n\nspaces\there'), 'too many spaces here')
})

test('cleanTitle strips surrounding quotes', () => {
  assert.equal(cleanTitle('"quoted title"'), 'quoted title')
})

test('cleanTitle truncates long titles on a word boundary', () => {
  const long = 'word '.repeat(40).trim()
  const out = cleanTitle(long)
  assert.ok(out.length <= 81, `got ${out.length}`)
  assert.ok(out.endsWith('…'))
  assert.ok(!out.endsWith(' …'))
})

test('cleanTitle returns null for empty, untitled or punctuation-only input', () => {
  for (const v of ['', '   ', null, undefined, '(untitled)', 'untitled', '---', '**']) {
    assert.equal(cleanTitle(v), null, `expected null for ${JSON.stringify(v)}`)
  }
})

/* ── junk detection ─────────────────────────────────────────────────── */

test('isJunk flags a titleless single-message stub', () => {
  assert.equal(isJunk({ title: '(untitled)', messageCount: 0, preview: '' }), true)
  assert.equal(isJunk({ title: '', messageCount: 1, preview: '' }), true)
})

test('isJunk keeps anything with real content', () => {
  assert.equal(isJunk({ title: 'Real thread', messageCount: 1, preview: 'hi' }), false)
  assert.equal(isJunk({ title: '(untitled)', messageCount: 12, preview: 'lots' }), false)
})

/* ── day bucketing ──────────────────────────────────────────────────── */

const NOW = new Date('2026-08-19T15:00:00').getTime()
const day = 86400000

test('dayBucket labels today, yesterday and the current week', () => {
  assert.equal(dayBucket(NOW - 3600_000, NOW), 'TODAY')
  assert.equal(dayBucket(NOW - day, NOW), 'YESTERDAY')
  assert.equal(dayBucket(NOW - day * 4, NOW), 'THIS WEEK')
})

test('dayBucket falls back to month then older', () => {
  assert.equal(dayBucket(NOW - day * 20, NOW), 'THIS MONTH')
  assert.equal(dayBucket(NOW - day * 200, NOW), 'OLDER')
})

test('dayBucket uses calendar days, not 24-hour windows', () => {
  // 00:30 today vs 23:30 yesterday is 1 hour apart but two calendar days.
  const justAfterMidnight = new Date('2026-08-19T00:30:00').getTime()
  const lateYesterday = new Date('2026-08-18T23:30:00').getTime()
  assert.equal(dayBucket(justAfterMidnight, NOW), 'TODAY')
  assert.equal(dayBucket(lateYesterday, NOW), 'YESTERDAY')
})

/* ── source glyphs ──────────────────────────────────────────────────── */

test('sourceGlyph maps known sources and falls back for unknown ones', () => {
  assert.equal(sourceGlyph('telegram'), '✈')
  assert.equal(sourceGlyph('cli'), '▶')
  assert.equal(sourceGlyph('cron'), '○')
  assert.equal(sourceGlyph('WhoKnows'), '·')
  assert.equal(sourceGlyph(''), '·')
})
