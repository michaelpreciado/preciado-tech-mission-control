import test from 'node:test'
import assert from 'node:assert/strict'
import { COMMAND_CATALOG } from '../lib/pt/catalog.ts'
import { BLOCKED_REASON_LABELS, blockedLabelFor } from '../lib/pt/blocked-labels.mjs'

test('blocked reasons render human copy, never the raw enum', () => {
  for (const command of COMMAND_CATALOG) {
    const label = blockedLabelFor(command.blockedReason)
    if (command.blockedReason === null) { assert.equal(label, null); continue }
    assert.ok(label && label.length > 0, command.id)
    // The operator-facing string must not be the machine id, and must not look
    // like one (no snake_case leaking through).
    assert.notEqual(label, command.blockedReason)
    assert.ok(!/^[a-z]+(_[a-z]+)+$/.test(label), `${command.id}: "${label}" looks like a raw enum`)
  }
  assert.equal(blockedLabelFor('destination_not_implemented'), 'Not shipped yet')
  assert.equal(blockedLabelFor('catalog_unavailable'), 'Catalog unavailable')
})

test('an unknown reason still degrades to readable copy, not the enum', () => {
  assert.equal(blockedLabelFor('some_future_reason'), 'some future reason')
  assert.equal(blockedLabelFor(null), null)
  assert.equal(blockedLabelFor(undefined), null)
})

test('every label mapping is itself human copy', () => {
  for (const [reason, label] of Object.entries(BLOCKED_REASON_LABELS)) {
    assert.ok(label.length > 0, reason)
    assert.notEqual(label, reason)
  }
})