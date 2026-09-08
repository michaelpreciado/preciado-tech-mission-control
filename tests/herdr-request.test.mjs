import test from 'node:test'
import assert from 'node:assert/strict'
import { readHerdrRequest } from '../lib/herdr-request.ts'

test('bounded request parser accepts structured input and rejects invalid JSON or shapes', async () => {
  const request = body => new Request('http://localhost', { method: 'POST', body })
  assert.deepEqual(await readHerdrRequest(request('{"op":"focus"}')), { op: 'focus' })
  for (const body of ['no json', '[]', 'null']) await assert.rejects(readHerdrRequest(request(body)), { status: 400 })
  await assert.rejects(readHerdrRequest(request(' '.repeat(40_001))), { status: 413 })
})
