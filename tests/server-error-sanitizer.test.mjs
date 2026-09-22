import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeCliFailure, sanitizeServerError } from '../lib/server-error-sanitizer.ts'

test('server sanitizer redacts single-component absolute paths at diagnostic boundaries', () => {
  for (const path of ['/secret', '/.env', '/private-key.json', '/secret/', '/var/lib/state.db']) {
    assert.equal(sanitizeServerError(path), '[path redacted]')
    assert.equal(sanitizeServerError(`Error: cannot read ${path}`), 'Error: cannot read [path redacted]')
    assert.equal(sanitizeServerError(`Error: open ("${path}") failed`), 'Error: open ("[path redacted]") failed')
    assert.equal(sanitizeServerError(`Error: path=${path}`), 'Error: path=[path redacted]')
  }
})

test('single-component path redaction preserves URL, credential and environment sanitization', () => {
  assert.equal(
    sanitizeServerError('Error: /secret https://example.invalid/private token=private CONFIG_PATH=/private'),
    'Error: [path redacted] [url] [credential redacted] [environment value redacted]',
  )
  assert.equal(sanitizeCliFailure('Error: access denied /secret', ''), 'Error: access denied [path redacted]')
})

test('server sanitizer retains other path redaction and ordinary slash text', () => {
  for (const path of ['~/private', './private', '../private', 'C:\\private\\file', 'C:/private/file']) {
    assert.equal(sanitizeServerError(`Error: ${path}`), 'Error: [path redacted]')
  }
  assert.equal(sanitizeServerError('Error: input/output failed'), 'Error: input/output failed')
})

test('CLI failure sanitizer prefers a failure line in stderr', () => {
  const result = sanitizeCliFailure(
    'Warning: startup notice\nError: provider refused https://provider.invalid/v1 /home/mp/private.json API_KEY=secret issue #42',
    'stdout fallback',
  )
  assert.match(result, /Error: provider refused/)
  assert.doesNotMatch(result, /https?:|\/home\/mp|secret|API_KEY|#42/)
})

test('CLI failure sanitizer falls back to stdout when stderr has no failure signature', () => {
  assert.equal(
    sanitizeCliFailure('Warning: startup notice', 'notice\nfailed to connect to /tmp/provider.sock'),
    'failed to connect to [path redacted]',
  )
})

test('general server sanitizer removes internal issue numbers and sensitive values', () => {
  const result = sanitizeServerError('fatal token=secret https://example.invalid/x /var/lib/hermes/state.db internal issue #9001')
  assert.doesNotMatch(result, /secret|https?:|\/var\/lib|#9001/)
  assert.match(result, /credential redacted/)
  assert.match(result, /internal issue redacted/)
})
