import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkRateLimit,
  getClientIpFromHeaders,
  isLoopbackIp,
  normalizeStream,
  streamPayload,
} from '../lib/mission-api.ts'

const fixture = {
  generatedAt: '2026-04-30T00:00:00.000Z',
  crew: [{ id: 'friday', status: 'standby' }],
  cron: [{ id: 'job-1' }],
  operations: { recentFiles: [] },
}

test('streamPayload returns full dashboard when stream is omitted', () => {
  const result = streamPayload(fixture, null)
  assert.equal(result.ok, true)
  assert.equal(result.status, 200)
  assert.equal(result.body, fixture)
})

test('streamPayload returns a small happy-path stream payload', () => {
  const result = streamPayload(fixture, 'crew')
  assert.equal(result.ok, true)
  assert.deepEqual(result.body, {
    crew: fixture.crew,
    generatedAt: fixture.generatedAt,
  })
})

test('streamPayload normalizes aliases and whitespace', () => {
  assert.equal(normalizeStream(' Calendar '), 'cron')
  assert.deepEqual(streamPayload(fixture, 'activity').body, {
    operations: fixture.operations,
    generatedAt: fixture.generatedAt,
  })
})

test('streamPayload rejects unknown or hostile stream names before data collection', () => {
  const result = streamPayload(fixture, '💥<script>alert(1)</script>')
  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
  assert.match(result.body.error, /Unknown mission-control stream/)
  assert.match(result.body.hint, /crew/)
})

test('getClientIpFromHeaders prefers the first forwarded IP and trims whitespace', () => {
  const headers = new Headers({
    'x-forwarded-for': ' 203.0.113.9, 10.0.0.2 ',
    'x-real-ip': '198.51.100.7',
  })
  assert.equal(getClientIpFromHeaders(headers), '203.0.113.9')
})

test('getClientIpFromHeaders falls back safely when no proxy headers exist', () => {
  assert.equal(getClientIpFromHeaders(new Headers()), 'unknown')
})

test('isLoopbackIp recognizes IPv4 and IPv6 localhost only', () => {
  assert.equal(isLoopbackIp('127.0.0.1'), true)
  assert.equal(isLoopbackIp('::1'), true)
  assert.equal(isLoopbackIp('127.evil.example'), false)
  assert.equal(isLoopbackIp('203.0.113.1'), false)
})

test('checkRateLimit allows the happy path then returns retry-after on abuse', () => {
  const bucket = new Map()
  assert.deepEqual(checkRateLimit(bucket, '203.0.113.1', 1000, 2, 10_000), { allowed: true, retryAfter: 0 })
  assert.deepEqual(checkRateLimit(bucket, '203.0.113.1', 1001, 2, 10_000), { allowed: true, retryAfter: 0 })
  assert.deepEqual(checkRateLimit(bucket, '203.0.113.1', 1002, 2, 10_000), { allowed: false, retryAfter: 10 })
})

test('checkRateLimit resets after the window expires', () => {
  const bucket = new Map()
  checkRateLimit(bucket, 'unknown', 0, 1, 100)
  assert.equal(checkRateLimit(bucket, 'unknown', 50, 1, 100).allowed, false)
  assert.equal(checkRateLimit(bucket, 'unknown', 101, 1, 100).allowed, true)
})
