import test from 'node:test'
import assert from 'node:assert/strict'
import { isRemoteCacheFresh } from '../lib/kanban-ttl.ts'

test('isRemoteCacheFresh honors the default 30s TTL', () => {
  const t0 = 1_000_000
  assert.equal(isRemoteCacheFresh(t0, t0 + 29_999), true)
  assert.equal(isRemoteCacheFresh(t0, t0 + 30_000), false)
  assert.equal(isRemoteCacheFresh(t0, t0 + 60_000), false)
})

test('isRemoteCacheFresh honors an explicit cacheMs override', () => {
  const t0 = 5_000_000
  assert.equal(isRemoteCacheFresh(t0, t0 + 59_999, 60_000), true)
  assert.equal(isRemoteCacheFresh(t0, t0 + 60_000, 60_000), false)
})

test('isRemoteCacheFresh is edge-exclusive (boundary is expired)', () => {
  // exactly at the window edge -> not fresh
  assert.equal(isRemoteCacheFresh(100, 100 + 30_000, 30_000), false)
  // a zero cacheMs means nothing is ever fresh
  assert.equal(isRemoteCacheFresh(100, 100, 0), false)
})
