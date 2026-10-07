import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { registerHooks } from 'node:module'
let remoteAttempts = 0, boardCalls = [], scanCalls = [], afterScan = null
// No remote subprocess can execute, even if local-only handling regresses.
globalThis.__lane07Remote = () => { remoteAttempts++; throw Error('remote forbidden') }
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith('/lib/hermes-kanban.ts') && specifier === 'node:child_process') return { url: 'data:text/javascript,export const execFileSync=globalThis.__lane07Remote;', shortCircuit: true }
  return nextResolve(specifier, context)
} })
const { getKanbanSnapshot } = await import('../lib/hermes-kanban.ts')
const vaultOwner = await import('../lib/vault-docs.ts')
const { getConfig } = await import('../lib/config.ts')
globalThis.__lane07Readers = {
  getKanbanSnapshot: (...args) => { boardCalls.push(args); return getKanbanSnapshot(...args) },
  scanVaultDocs: async options => { scanCalls.push(options); const result = await vaultOwner.scanVaultDocs(options); if (afterScan) await afterScan(); return result },
  PIPELINE_VAULT_PATH: vaultOwner.PIPELINE_VAULT_PATH,
}
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith('/lib/pt/crew-read.ts') && specifier === '../hermes-kanban') return { url: 'data:text/javascript,export const {getKanbanSnapshot}=globalThis.__lane07Readers;', shortCircuit: true }
  if (context.parentURL?.endsWith('/lib/pt/deliverables.ts') && specifier === '../vault-docs') return { url: 'data:text/javascript,export const {scanVaultDocs}=globalThis.__lane07Readers;', shortCircuit: true }
  return nextResolve(specifier, context)
} })
const { readCrewKanban, collectCrew } = await import('../lib/pt/crew-read.ts')
const { collectDeliverables, readDeliverable } = await import('../lib/pt/deliverables.ts')
const { normalizePipeline } = await import('../lib/pt/pipeline.ts')
const now = '2026-10-03T16:00:00.000Z', ms = Date.parse(now)

test('crew delegates to local Kanban owner, keeps all tasks and never fetches configured remotes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-reader-crew-')), file = path.join(dir, 'kanban.db')
  const db = new DatabaseSync(file)
  db.exec('CREATE TABLE tasks (id TEXT, title TEXT, status TEXT, assignee TEXT, priority INTEGER, created_by TEXT, created_at REAL, started_at REAL, completed_at REAL, consecutive_failures INTEGER, last_failure_error TEXT, last_heartbeat_at REAL, current_run_id INTEGER, session_id TEXT); CREATE TABLE task_links (parent_id TEXT, child_id TEXT);')
  const insert = db.prepare('INSERT INTO tasks (id,title,status,assignee,created_at,started_at,last_heartbeat_at,current_run_id,session_id) VALUES (?,?,?,?,?,?,?,?,?)')
  for (let i = 0; i < 550; i++) insert.run(`task-${i}`, 'Fixture', 'running', 'friday', ms/1000, ms/1000, ms/1000, i + 1, 'private-session-canary')
  insert.run('invalid', 'Invalid date', 'running', 'friday', ms/1000, ms/1000, 'malformed', 1000, 'private-session-canary')
  db.close()
  const hash = () => createHash('sha256').update(fs.readFileSync(file)).digest('hex'), before = hash()
  const config = getConfig(), saved = config.kanbanRemotes
  config.kanbanRemotes = [{ name: 'fake-remote', user: 'fixture', host: 'fixture.invalid' }]
  try {
    const tasks = readCrewKanban(file)
    assert.equal(tasks.length, 551); assert.equal(tasks.find(t => t.id === 'invalid').lastHeartbeatAt, 'invalid')
    assert.doesNotMatch(JSON.stringify(tasks), /private-session-canary|sessionId|origin/)
    const result = collectCrew(now, { kanbanDb: file, heartbeatsFile: path.join(dir, 'missing.json'), gatewayFile: path.join(dir, 'gateway_state.json') })
    assert.equal(result.data.counts.confirmedWorkers, 550)
    assert.equal(result.sources.find(s => s.id === 'kanban').freshnessBasis, 'inventory')
    assert.equal(result.sources.find(s => s.id === 'kanban').freshness, 'fresh')
    assert.equal(boardCalls.length, 2)
    for (const args of boardCalls) assert.deepEqual(args, [undefined, Infinity, { scope: 'local', localDbFile: file }])
    assert.equal(remoteAttempts, 0); assert.equal(hash(), before)
  } finally { config.kanbanRemotes = saved; fs.rmSync(dir, { recursive: true, force: true }) }
})

test('deliverables uses fresh vault metadata, retains missing paths and binds metadata to revision', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pt-reader-vault-'))
  const root = path.join(dir, vaultOwner.PIPELINE_VAULT_PATH), relative = 'Clients/Fixture/Terms.md', file = path.join(root, relative)
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, '# First title\n')
  const registry = { workspaceDir: dir, roots: [{ id: 'vault', directory: root, kind: 'vault', vaultPrefix: vaultOwner.PIPELINE_VAULT_PATH, vaultName: 'Fixture' }], trackers: [] }
  const options = { registry, pipeline: { ok: true, store: normalizePipeline({ leads: [] }) }, now }
  const cached = await vaultOwner.scanVaultDocs({ root })
  try {
    const first = (await collectDeliverables(options)).data.items[0]
    assert.equal(first.title, 'First title'); assert.deepEqual(first.vault.metadata, cached[0])
    await fsp.writeFile(file, '# Second title\n')
    assert.equal((await vaultOwner.scanVaultDocs({ root }))[0].title, 'First title')
    const second = (await collectDeliverables(options)).data.items[0]
    assert.equal(second.title, 'Second title'); assert.notEqual(first.artifactRevision, second.artifactRevision)
    await assert.rejects(readDeliverable(first.id, first.artifactRevision, first.evidenceRevision, options), /revision_mismatch/)
    afterScan = () => fsp.writeFile(file, '# Concurrent change\n')
    const raced = (await collectDeliverables(options)).data.items[0]
    assert.equal(raced.available, false); assert.equal(raced.unavailableReason, 'revision_mismatch'); assert.equal(raced.vault, null)
    afterScan = null
    await fsp.rename(file, path.join(root, 'Moved.md'))
    const moved = (await collectDeliverables(options)).data.items
    assert.equal(moved.find(i => i.id === first.id).available, false)
    assert.ok(moved.some(i => i.path === 'Moved.md' && i.title === 'Concurrent change'))
    await fsp.writeFile(path.join(dir, 'outside.md'), '# Private canary')
    await fsp.symlink(path.join(dir, 'outside.md'), path.join(root, 'escape.md'))
    assert.ok(!(await collectDeliverables(options)).data.items.some(i => i.path === 'escape.md'))
    assert.ok(scanCalls.length >= 5)
    for (const call of scanCalls) assert.deepEqual(call, { root, vaultPrefix: vaultOwner.PIPELINE_VAULT_PATH, fresh: true, inventory: true })
  } finally { afterScan = null; await fsp.rm(dir, { recursive: true, force: true }) }
})
