import test from 'node:test'
import assert from 'node:assert/strict'
import { herdrGate } from '../lib/herdr-auth.ts'

test('herdr private reads and writes require bearer when configured', () => {
  const previous = process.env.INTERNAL_API_SECRET
  try {
    process.env.INTERNAL_API_SECRET = 'test-only-secret'
    for (const write of [false, true]) {
      assert.equal(herdrGate({ headers: new Headers({ 'x-forwarded-for': '127.0.0.1' }) }, write).status, 401)
      assert.equal(herdrGate({ headers: new Headers({ authorization: 'Bearer wrong' }) }, write).status, 401)
      assert.equal(herdrGate({ headers: new Headers({ authorization: 'Bearer test-only-secret' }) }, write), null)
    }
    assert.equal(herdrGate({ headers: new Headers({ authorization: 'Bearer test-only-secret', origin: 'https://foreign.example', host: 'localhost' }) }, true).status, 403)
  } finally { if (previous === undefined) delete process.env.INTERNAL_API_SECRET; else process.env.INTERNAL_API_SECRET = previous }
})

test('without secret missing IP denied and loopback allowed', () => {
  const previous = process.env.INTERNAL_API_SECRET
  try {
    delete process.env.INTERNAL_API_SECRET
    assert.equal(herdrGate({ headers: new Headers() }).status, 401)
    assert.equal(herdrGate({ headers: new Headers({ 'x-forwarded-for': '127.0.0.1' }) }), null)
  } finally { if (previous === undefined) delete process.env.INTERNAL_API_SECRET; else process.env.INTERNAL_API_SECRET = previous }
})

test('locked mode admits only an allowlisted Tailscale login arriving through tailscale serve', () => {
  const prev = { s: process.env.INTERNAL_API_SECRET, l: process.env.MC_TAILSCALE_ALLOWED_LOGINS }
  try {
    process.env.INTERNAL_API_SECRET = 'test-only-secret'
    process.env.MC_TAILSCALE_ALLOWED_LOGINS = 'owner@example.com'
    const host = 'box.tail0000.ts.net:8443'
    const proxied = extra => ({ headers: new Headers({ host, 'x-forwarded-for': '100.101.102.103', ...extra }) })
    assert.equal(herdrGate(proxied({ 'tailscale-user-login': 'owner@example.com', origin: `https://${host}` }), true), null)
    assert.equal(herdrGate(proxied({ 'tailscale-user-login': 'Owner@Example.com' })), null)
    // another tailnet user, a tagged node (no identity), or a bare tailnet peer
    assert.equal(herdrGate(proxied({ 'tailscale-user-login': 'someone-else@example.com' }), true).status, 401)
    assert.equal(herdrGate(proxied({}), true).status, 401)
    // a DNS-rebound page or direct loopback caller forging the identity header
    assert.equal(herdrGate({ headers: new Headers({ host: 'evil.example:4176', 'x-forwarded-for': '100.101.102.103', 'tailscale-user-login': 'owner@example.com' }) }, true).status, 401)
    assert.equal(herdrGate({ headers: new Headers({ host, 'x-forwarded-for': '127.0.0.1', 'tailscale-user-login': 'owner@example.com' }) }, true).status, 401)
    delete process.env.MC_TAILSCALE_ALLOWED_LOGINS
    assert.equal(herdrGate(proxied({ 'tailscale-user-login': 'owner@example.com' }), true).status, 401)
  } finally {
    for (const [k, v] of [['INTERNAL_API_SECRET', prev.s], ['MC_TAILSCALE_ALLOWED_LOGINS', prev.l]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v
    }
  }
})
