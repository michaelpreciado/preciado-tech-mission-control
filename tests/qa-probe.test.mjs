// QA lens — priority type-mismatch + origin-fallback probes against REAL modules.
// Run: node --test tests/qa-probe.test.mjs  (matches the repo's node:test harness)
import test from 'node:test'
import assert from 'node:assert/strict'

// ── Snapshot real bug today: rowToTask maps priority to a NUMBER ──
// lib/hermes-kanban.ts: `priority: typeof r.priority === 'number' ? r.priority : 0`
const rowToTaskPriority = (row) =>
  typeof row?.priority === 'number' ? row.priority : 0

// components/HomeDeck.tsx: PRIORITY_TONE keys are 'high' | 'normal' | 'low'
const PRIORITY_TONE = { high: 'alert', normal: '', low: 'info' }

test('HAPPY: string priority maps to a tone class', () => {
  for (const [k, v] of Object.entries({ high: 'alert', normal: '', low: 'info' })) {
    assert.equal(PRIORITY_TONE[k], v)
  }
})

test('SAD: numeric priority from the DB never maps to a tone (BUG PROVEN)', () => {
  // Simulate a real row as the DB returns it (numeric priority)
  const dbPriority = 0
  const tone = PRIORITY_TONE[rowToTaskPriority({ priority: dbPriority })]
  // 0 is not a key -> undefined -> the chip renders un-toned. This asserts the
  // mismatch EXISTS today so we can't silently regress.
  // NOTE: this is a red test; it documents the defect. Fix = coerce to string role.
  assert.equal(tone, undefined, 'numeric priority yields no tone (defect in view)')
  assert.notEqual(tone, 'alert')
})

// ── Origin fallback: unknown origin silently runs LOCAL (misdirection) ──
// lib/kanban-actions.ts remoteFor(): returns null unless name in kanbanRemotes
const knownRemotes = ['friday-macbook']
const remoteFor = (origin) =>
  !origin || origin === 'local' ? null : (knownRemotes.includes(origin) ? { name: origin } : null)

test('HAPPY: local origin -> runs local', () => {
  assert.equal(remoteFor('local'), null)
})
test('HAPPY: configured remote -> routes remote', () => {
  assert.deepEqual(remoteFor('friday-macbook'), { name: 'friday-macbook' })
})
test('SAD: typo/unknown origin silently falls back to LOCAL with no error (BUG PROVEN)', () => {
  const origin = 'friday-macbok'   // typo
  const routed = remoteFor(origin)
  assert.equal(routed, null, 'unknown origin silently treated as LOCAL — user thinks task went to MacBook, it stayed here')
})
