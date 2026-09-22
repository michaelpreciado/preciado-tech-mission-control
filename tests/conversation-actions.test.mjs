import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from '../lib/conversation-actions.ts'

test('conversation SSE argv carries a selected model and provider without changing the default lane', () => {
  assert.deepEqual(
    build(['--resume', 'session-1', '-z', 'hello', '--cli'], {
      profile: 'default', model: 'gemma4:12b', provider: 'ollama',
    }).argv,
    ['hermes', '-m', 'gemma4:12b', '--provider', 'ollama', '--resume', 'session-1', '-z', 'hello', '--cli'],
  )
  assert.deepEqual(
    build(['--resume', 'session-1', '-z', 'hello', '--cli'], { profile: 'default' }).argv,
    ['hermes', '--resume', 'session-1', '-z', 'hello', '--cli'],
  )
})
