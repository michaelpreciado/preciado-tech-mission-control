import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { normalizePipeline } from '../../lib/pt/pipeline.ts'
import { collectDeliverables } from '../../lib/pt/deliverables.ts'
import { PIPELINE_VAULT_PATH } from '../../lib/vault-docs.ts'

export async function deliverablesFixture() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pt-deliverables-'))
  const report = path.join(temp, 'reports'), vault = path.join(temp, 'Vault with spaces', PIPELINE_VAULT_PATH)
  await fs.mkdir(report, { recursive: true }); await fs.mkdir(vault, { recursive: true })
  const write = async (name, text) => { await fs.mkdir(path.dirname(path.join(report, name)), { recursive: true }); await fs.writeFile(path.join(report, name), text) }
  await write('verified note.md', '# Verified café\nFixture bytes.\n')
  await write('draft.txt', 'Draft only.\n')
  await write('awaiting.md', '# Worker says VERIFIED\nNo coordinator receipt.\n')
  await write('prototype/REPORT.md', '# VERIFIED\nWorker exit 0, every check PASS.\n')
  await write('prototype/review.md', '# Coordinator review\nStatus: NOT ACCEPTED.\n')
  await write('held/offer.html', '<!doctype html><script>window.__artifactExecuted = true</script><h1>Held offer</h1>')
  await write('coordinator.md', '# Coordinator evidence\nReceipt required.\n')
  await write('evidence.txt', 'Independent fixture check A.\n')
  await write('moved.md', '# Move me\n')
  await write('untracked.md', '# Untracked inventory item\n')
  await write('unsupported.pdf', '%PDF-1.7 fixture only')
  await write('binary.md', Buffer.from([0, 255, 128]))
  await write('bom.md', '\uFEFF# Preserve BOM\n')
  await write('large.txt', 'x'.repeat(256 * 1024 + 1))
  await fs.writeFile(path.join(temp, 'private.txt'), 'OUTSIDE_PRIVATE_CANARY')
  await fs.symlink(path.join(temp, 'private.txt'), path.join(report, 'escape.txt'))
  await fs.symlink(temp, path.join(report, 'escape-directory'))
  await fs.mkdir(path.join(vault, 'Clients/A & B'), { recursive: true })
  await fs.writeFile(path.join(vault, 'Clients/A & B/Terms #1.md'), '---\nupdated: "2026-10-03"\n---\n# Terms with spaces\nHello.\n')
  const task = (id, status, evidence, gate = null) => ({ id, title: id, status, evidence, gate })
  const tracker = { tasks: [
    task('verified-task', 'verified', ['verified note.md', 'evidence.txt']),
    task('draft-task', 'draft', ['draft.txt']), task('awaiting-task', 'awaiting-verification', ['awaiting.md']),
    task('prototype-task', 'verified', ['prototype/REPORT.md']),
    task('held-task', 'verified', ['held/offer.html']), task('publish', 'approval-held', [], 'Explicit publication approval required'),
    task('moved-task', 'awaiting-verification', ['moved.md']),
    task('escape-task', 'verified', ['escape.txt', 'escape-directory/private.txt', '../private.txt']),
  ] }
  await write('tracker.json', JSON.stringify(tracker))
  const registry = { workspaceDir: temp,
    roots: [{ id: 'reports', directory: report, kind: 'report' }, { id: 'vault', directory: vault, kind: 'vault', vaultName: 'Vault with spaces', vaultPrefix: PIPELINE_VAULT_PATH }],
    trackers: [{ rootId: 'reports', path: 'tracker.json', receiptPath: 'acceptance.json', reviews: [
      { path: 'coordinator.md', prefix: 'verified note.md', taskIds: ['verified-task'] },
      { path: 'prototype/review.md', prefix: 'prototype/', taskIds: ['prototype-task'] },
    ], scopes: [{ prefix: 'held/', taskIds: ['held-task'], gateIds: ['publish'] }] }],
  }
  const pipeline = { ok: true, store: normalizePipeline({ leads: [
    { id: 'fixture-lead', business_name: 'Fixture Lead', stage: 'in_development', preview_file: path.join(report, 'held/offer.html'), artifacts: [{ path: path.join(report, 'verified note.md') }], docs_path: `${PIPELINE_VAULT_PATH}/Clients/A & B` },
    { id: 'untrusted-path', business_name: 'Escape', stage: 'completed', artifacts: [path.join(temp, 'private.txt'), `${report}/../private.txt`, 'https://example.invalid/remote.html', `${report}/%2e%2e/private.txt`] },
  ] }) }
  const options = { registry, pipeline, now: '2026-10-03T16:00:00.000Z' }
  const first = await collectDeliverables(options)
  const verified = first.data.items.find(row => row.path === 'verified note.md')
  const receipt = { schemaVersion: 1, decisions: [{ path: verified.path, state: 'accepted', artifactRevision: verified.artifactRevision, evidenceRevision: verified.evidenceRevision }] }
  await write('acceptance.json', JSON.stringify(receipt)) // SYNTHETIC fixture authority only.
  const envelope = await collectDeliverables(options)
  return { temp, report, vault, write, tracker, receipt, registry, pipeline, options, envelope }
}
