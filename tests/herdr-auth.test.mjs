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
