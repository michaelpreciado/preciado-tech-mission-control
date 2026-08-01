import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkRateLimit,
  getClientIpFromHeaders,
  isLoopbackIp,
  isTrustedIp,
  normalizeStream,
  parseTrustedIps,
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

test('parseTrustedIps parses CIDRs and plain IPs, ignoring junk', () => {
  assert.deepEqual(parseTrustedIps(''), [])
  assert.deepEqual(parseTrustedIps('  '), [])
  assert.deepEqual(parseTrustedIps('10.0.0.5'), [{ base: 167772165, bits: 32 }])
  assert.deepEqual(parseTrustedIps('100.64.0.0/10'), [{ base: 1681915904, bits: 10 }])
  // whitespace, empty segments, malformed entries and bad prefixes are dropped
  assert.deepEqual(parseTrustedIps('nonsense, 10.0.0.5 ,, 1.2.3.4/99, 300.1.1.1'), [{ base: 167772165, bits: 32 }])
})

test('isTrustedIp always trusts loopback regardless of allowlist', () => {
  assert.equal(isTrustedIp('127.0.0.1', []), true)
  assert.equal(isTrustedIp('::1', []), true)
  // Next.js always sets x-forwarded-for, so 'unknown' should NOT be auto-trusted
  assert.equal(isTrustedIp('unknown', []), false)
})

test('isTrustedIp honors the configured allowlist', () => {
  const tailnet = parseTrustedIps('100.64.0.0/10')
  // an address inside the tailnet CGNAT range is trusted
  assert.equal(isTrustedIp('100.64.0.2', tailnet), true)
  assert.equal(isTrustedIp('100.64.0.0', tailnet), true)
  assert.equal(isTrustedIp('100.127.255.255', tailnet), true)
  // just outside the CGNAT range, and the public internet
  assert.equal(isTrustedIp('100.128.0.1', tailnet), false)
  assert.equal(isTrustedIp('8.8.8.8', tailnet), false)
  assert.equal(isTrustedIp('203.0.113.1', tailnet), false)
  // an empty allowlist trusts nothing beyond loopback
  assert.equal(isTrustedIp('100.64.0.2', []), false)
})
