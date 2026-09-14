import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { continuityStore } from '../lib/chat-continuity.ts'
import { continueInHerdr, herdrPaneName } from '../lib/chat-herdr.ts'

const record = { mcConversationId: 'mc-test', hermesSession: 'native-id', sessionName: 'mc-named', profile: 'jarvis', selector: 'name' }
function fixture() {
  const dir = mkdtempSync(path.join(process.cwd(), '.mc-handoff-continuity-'))
  return { file: path.join(dir, 'continuity.sqlite'), close: () => rmSync(dir, { recursive: true, force: true }) }
}
test('persistent mapping keeps profile isolation and updates name aliases with pane', () => {
  const f = fixture()
  try {
    let store = continuityStore(f.file)
    store.save(record); store.alias('jarvis', 'mc-named', record); store.close()
    store = continuityStore(f.file)
    store.save({ ...record, herdrPane: 'w3:pA' })
    assert.equal(store.get('jarvis', 'mc-named').herdrPane, 'w3:pA')
    assert.equal(store.get('jarvis', 'native-id').mcConversationId, 'mc-test')
    assert.equal(store.get('default', 'native-id'), undefined)
    store.close()
  } finally { f.close() }
})
test('continuation spawns once, preserves profile/name argv, returns terminal text and reuses pane', async () => {
  const f = fixture(), calls = []
  const run = async args => {
    calls.push(args)
    if (args[0] === 'workspace') return { pane_id: 'w3:pA' }
    if (args[1] === 'list') return { agents: [{ pane_id: 'w3:pA', name: 'mc-chat-mc-test', agent: 'hermes', agent_status: 'idle' }] }
    if (args[1] === 'read') return { text: 'throwaway reply' }
    return {}
  }
  try {
    const first = await continueInHerdr(record, 'literal $(text)', run, f.file)
    assert.equal(first.terminalText, 'throwaway reply')
    assert.equal(first.continuity.herdrPane, 'w3:pA')
    assert.deepEqual(calls.find(a => a[1] === 'start').slice(-7), ['--profile', 'jarvis', 'chat', '--continue', 'mc-named', '--no-restore-cwd', '--cli'].slice(-7))
    await continueInHerdr(record, 'again', run, f.file)
    assert.equal(calls.filter(a => a[0] === 'workspace').length, 1)
    assert.equal(calls.find(a => a[1] === 'prompt')[3], 'literal $(text)')
  } finally { f.close() }
})
test('herdr pane names satisfy the herdr agent naming rules', () => {
  for (const id of ['mc-test', '8b30055b-3b48-4f7d-b667-db7419e74add', 'A'.repeat(64), '!!!', '']) {
    const name = herdrPaneName(id)
    assert.match(name, /^[a-z][a-z0-9_-]{0,31}$/, `invalid herdr name for ${id}: ${name}`)
  }
})
test('uncertain startup retains pane and refuses mismatched pane on retry', async () => {
  const f = fixture()
  try {
    await assert.rejects(continueInHerdr(record, 'hello', async args => {
      if (args[0] === 'workspace') return { pane_id: 'w3:pA' }
      throw new Error('timeout')
    }, f.file), /startup is unconfirmed/)
    const store = continuityStore(f.file)
    assert.equal(store.get('jarvis', 'native-id').herdrPane, 'w3:pA'); store.close()
    await assert.rejects(continueInHerdr(record, 'hello', async args => {
      assert.equal(args[1], 'list'); return { agents: [] }
    }, f.file), /missing or has changed/)
  } finally { f.close() }
})
