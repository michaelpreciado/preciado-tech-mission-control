import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { deliverablesFixture } from './helpers/deliverables-fixture.mjs'
import { collectDeliverables, readDeliverable, artifactId } from '../lib/pt/deliverables.ts'
import { readArtifactFile, sha256 } from '../lib/pt/artifact-files.ts'
import { deliverablesDisplay, contentPath } from '../lib/pt/deliverables-display.mjs'
import { obsidianLink } from '../lib/vault-links.ts'
import { displaySnapshot } from '../../desktop/mp.preciadoTech.deliverables/collector.mjs'
const fixture = await deliverablesFixture()
const { options, envelope, write, report, temp } = fixture
after(() => fs.rm(temp, { recursive: true, force: true }))
const row = file => envelope.data.items.find(item => item.path === file)
const content = item => readDeliverable(item.id, item.artifactRevision, item.evidenceRevision, options)
const status = code => err => err.status === code

test('six states are distinct; coordinator rejection defeats VERIFIED worker report and tracker', () => {
  assert.equal(row('verified note.md').reviewState, 'verified')
  assert.equal(row('draft.txt').reviewState, 'draft')
  assert.equal(row('awaiting.md').reviewState, 'awaiting-verification')
  assert.equal(row('prototype/REPORT.md').reviewState, 'not-accepted')
  assert.equal(row('held/offer.html').reviewState, 'approval-held')
  assert.equal(row('bom.md').reviewState, 'unknown')
  assert.ok(envelope.data.items.some(i => i.kind === 'gate' && i.gateIds.includes('publish') && i.reviewState === 'approval-held'))
  console.log('FIXTURE INDEX COUNT', envelope.data.count)
  for (const item of envelope.data.items) console.log(`${item.path ?? item.title}: ${item.reviewState} | tracker ${item.trackerStates.map(t => t.id + '=' + t.status).join(', ') || 'none'}`)
})
test('artifact bytes, shared vault metadata, client association and space-safe Obsidian URI agree', async () => {
  const item = row('verified note.md'), body = await content(item)
  assert.equal(body.data.artifactRevision, sha256(await fs.readFile(path.join(report, item.path))))
  assert.deepEqual(item.leadIds, ['fixture-lead'])
  const note = envelope.data.items.find(i => i.kind === 'vault')
  assert.equal(note.title, 'Terms with spaces'); assert.equal(note.vault.metadata.updated, '2026-10-03')
  assert.deepEqual(note.leadIds, ['fixture-lead'])
  const native = displaySnapshot(envelope, Date.parse(options.now)).rows.find(i => i.id === note.id)
  assert.equal(native.obsidianUri, obsidianLink(note.vault.name, note.vault.path))
  assert.match(native.obsidianUri, /Vault%20with%20spaces/); assert.match(native.obsidianUri, /A%20%26%20B/)
  const bom = await content(row('bom.md'))
  assert.equal(sha256(bom.data.text), row('bom.md').artifactRevision)
})
test('both surfaces keep identical states, IDs, hashes and transport expiration', async () => {
  for (const [now, failed, error] of [[Date.parse(options.now),false,null], [Date.parse(envelope.validUntil),false,null], [Date.parse(options.now),true,'transport_failed'], [Date.parse(options.now),true,'access_denied']]) {
    const browser = deliverablesDisplay(envelope, now, failed, error), native = displaySnapshot(envelope, now, failed, error)
    assert.deepEqual(native.rows.map(({ obsidianUri, ...rest }) => rest), browser.rows)
    for (const key of ['count','canRead','lastKnown','freshness','label','dataRevision']) assert.equal(native[key],browser[key])
    if (error || now === Date.parse(envelope.validUntil)) assert.equal(native.canRead, false)
  }
  for (const file of ['deliverables-display.mjs','presentation-state.mjs']) assert.equal(await fs.readFile(new URL('../lib/pt/' + file, import.meta.url), 'utf8'), await fs.readFile(new URL('../../desktop/mp.preciadoTech.deliverables/' + file, import.meta.url), 'utf8'))
})
test('traversal, hidden paths, file symlinks, parent symlinks and root symlinks cannot read private bytes', async () => {
  for (const value of ['../private.txt', 'escape.txt', 'escape-directory/private.txt', '/etc/passwd', './draft.txt', '.secret', 'a/../../private.txt', 'a\\..\\private.txt']) await assert.rejects(readArtifactFile(report, value), status(404))
  await fs.symlink(report, path.join(temp,'linked-root'))
  await assert.rejects(readArtifactFile(path.join(temp,'linked-root'),'draft.txt'), status(404))
  await assert.rejects(readDeliverable('../private.txt',null,null,options),status(404))
  await assert.rejects(readDeliverable(artifactId('reports','../private.txt'),null,null,options),status(404))
  assert.doesNotMatch(JSON.stringify(envelope), /OUTSIDE_PRIVATE_CANARY/)
  assert.ok(!envelope.data.items.some(i => i.path === '../private.txt'))
  await assert.rejects(content(row('escape.txt')),status(404))
})
test('unsupported binary/format and oversized files are bounded, HTML is inert source', async () => {
  for (const file of ['unsupported.pdf','binary.md']) await assert.rejects(content(row(file)),status(415))
  await assert.rejects(content(row('large.txt')),status(413))
  const html = await content(row('held/offer.html'))
  assert.equal(html.data.mediaType, 'text/html-source'); assert.match(html.data.text, /<script>/)
})
test('directory replacement between path check and open cannot read an escaped fd', async () => {
  await fs.mkdir(path.join(report,'race'))
  await fs.writeFile(path.join(report,'race/private.txt'),'INSIDE')
  const open = fs.open
  let reads = 0, swapped = false
  fs.open = async (file,...args) => {
    if (String(file) === path.join(report,'race/private.txt')) {
      await fs.rename(path.join(report,'race'),path.join(report,'race-saved'))
      await fs.symlink(temp,path.join(report,'race')); swapped = true
      const handle = await open(file,...args)
      const read = handle.read.bind(handle)
      handle.read = (...values) => { reads++; return read(...values) }
      return handle
    }
    return open(file,...args)
  }
  try { await assert.rejects(readArtifactFile(report,'race/private.txt'),status(404)); assert.equal(reads,0) }
  finally {
    fs.open = open
    if (swapped) { await fs.unlink(path.join(report,'race')); await fs.rename(path.join(report,'race-saved'),path.join(report,'race')) }
  }
})
test('missing revision fails closed; evidence revision is also pinned', async () => {
  const item = row('verified note.md')
  await assert.rejects(readDeliverable(item.id,null,item.evidenceRevision,options),status(409))
  await assert.rejects(readDeliverable(item.id,item.artifactRevision,'0'.repeat(64),options),status(409))
  assert.match(contentPath(item), /evidenceRevision=/)
})
test('verified-then-edited revokes verified and rejects stale detail read', async () => {
  const item = row('verified note.md'), original = await fs.readFile(path.join(report,item.path))
  try {
    await write(item.path,'# Edited after verification\n')
    const current = (await collectDeliverables(options)).data.items.find(i => i.id === item.id)
    assert.equal(current.reviewState,'awaiting-verification'); assert.notEqual(current.artifactRevision,item.artifactRevision)
    await assert.rejects(content(item),status(409))
  } finally { await write(item.path,original) }
})
test('evidence bytes, tracker bytes, coordinator evidence edits all invalidate verification', async () => {
  const item = row('verified note.md')
  for (const file of ['evidence.txt','tracker.json','coordinator.md']) {
    const original = await fs.readFile(path.join(report,file))
    try {
      await write(file,Buffer.concat([original,Buffer.from('\n ')]))
      const current = (await collectDeliverables(options)).data.items.find(i => i.id === item.id)
      assert.equal(current.reviewState,'awaiting-verification',file); assert.notEqual(current.evidenceRevision,item.evidenceRevision,file)
      await assert.rejects(content(item),status(409))
    } finally { await write(file,original) }
  }
})
test('editing acceptance to rejection overrides valid hashes', async () => {
  const original = await fs.readFile(path.join(report,'acceptance.json'))
  try {
    const receipt = structuredClone(fixture.receipt); receipt.decisions[0].state = 'not-accepted'
    await write('acceptance.json',JSON.stringify(receipt))
    assert.equal((await collectDeliverables(options)).data.items.find(i => i.path === 'verified note.md').reviewState,'not-accepted')
  } finally { await write('acceptance.json',original) }
})
test('moved referenced and discovered files retain unavailable rows and return 404', async () => {
  for (const name of ['moved.md','untracked.md']) {
    const item = row(name)
    await fs.rename(path.join(report,name),path.join(temp,name))
    const current = (await collectDeliverables(options)).data.items.find(i => i.id === item.id)
    assert.equal(current.available,false); assert.equal(current.artifactRevision,null)
    await assert.rejects(content(item),status(404))
  }
})
test('missing tracker cannot leave a verified badge', async () => {
  await fs.rename(path.join(report,'tracker.json'),path.join(temp,'tracker.json'))
  const index = await collectDeliverables(options)
  assert.notEqual(index.data.items.find(i => i.path === 'verified note.md').reviewState,'verified')
  assert.ok(index.errors.some(e => e.code === 'tracker_unavailable'))
})
