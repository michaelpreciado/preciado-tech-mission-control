import './helpers/ts-resolve.mjs'
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { resetConfigCache } from '../lib/config.ts'
import { scanVaultDocs, collectVaultClientDocs, PIPELINE_VAULT_PATH } from '../lib/vault-docs.ts'
import { obsidianLink } from '../lib/vault-links.ts'

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context)
  if (specifier === 'next/server') return nextResolve('next/server.js', context)
  return nextResolve(specifier, context)
} })
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-vault-test-'))
after(() => fs.rm(temp, { recursive: true, force: true }))
process.env.MC_PIPELINE_DIR = temp
process.env.INTERNAL_API_SECRET = 'vault-test-only'
const { GET } = await import('../app/api/vault/route.ts')
const { NextRequest } = await import('next/server.js')
async function fixture(name) {
  const vault = path.join(temp, name)
  process.env.MC_VAULT_DIR = vault
  resetConfigCache()
  await fs.mkdir(path.join(vault, PIPELINE_VAULT_PATH), { recursive: true })
  return { vault, root: path.join(vault, PIPELINE_VAULT_PATH) }
}

test('scanner reads headings, YAML dates, bytes, nested groups and filename fallback', async () => {
  const { root } = await fixture('metadata')
  await fs.mkdir(path.join(root, 'Clients/Client/Communications'), { recursive: true })
  const source = '---\nupdated: "2026-09-12" # checked\n---\n```md\n# Example heading\n```\n# Actual title ###\nUnicode café\n'
  await fs.writeFile(path.join(root, 'pricing.md'), source)
  await fs.writeFile(path.join(root, 'Clients/Client/Communications/Note.md'), 'No heading')
  await fs.writeFile(path.join(root, 'Setext.md'), 'Setext title\n=====\n')
  await fs.writeFile(path.join(root, 'ignored.txt'), '# Not a note')
  const docs = await scanVaultDocs()
  assert.equal(docs.length, 3)
  const pricing = docs.find(d => d.path.endsWith('/pricing.md'))
  assert.deepEqual(pricing, { path: `${PIPELINE_VAULT_PATH}/pricing.md`, title: 'Actual title', updated: '2026-09-12', bytes: Buffer.byteLength(source), group: 'Root', isClientDoc: false })
  const note = docs.find(d => d.title === 'Note')
  assert.equal(note.group, 'Clients')
  assert.equal(note.isClientDoc, true)
  assert.equal(note.updated, undefined)
  assert.ok(docs.some(d => d.title === 'Setext title'))
})

test('scanner caches for 60 seconds and refreshes after expiry', async () => {
  const { root } = await fixture('cache')
  const realNow = Date.now
  let now = realNow()
  Date.now = () => now
  try {
    await fs.writeFile(path.join(root, 'one.md'), '# One')
    const first = await scanVaultDocs()
    await fs.writeFile(path.join(root, 'two.md'), '# Two')
    now += 59_999
    assert.strictEqual(await scanVaultDocs(), first)
    now += 1
    assert.equal((await scanVaultDocs()).length, 2)
  } finally { Date.now = realNow }
})

test('missing vault returns an empty list and changing configured vault invalidates cache', async () => {
  process.env.MC_VAULT_DIR = path.join(temp, 'does-not-exist')
  resetConfigCache()
  assert.deepEqual(await scanVaultDocs(), [])
  const { root } = await fixture('restored')
  await fs.writeFile(path.join(root, 'restored.md'), '# Restored')
  assert.equal((await scanVaultDocs())[0].title, 'Restored')
})

test('scanner skips unreadable files and symlinks without losing readable notes', async () => {
  const { root } = await fixture('unreadable')
  await fs.writeFile(path.join(root, 'good.md'), '# Good')
  await fs.writeFile(path.join(root, 'bad.md'), '# Private')
  await fs.symlink(root, path.join(root, 'cycle'))
  await fs.symlink(path.join(root, 'good.md'), path.join(root, 'linked.md'))
  const readFile = fs.readFile
  fs.readFile = async (file, ...args) => {
    if (String(file).endsWith('/bad.md')) throw Object.assign(new Error('Denied'), { code: 'EACCES' })
    return readFile(file, ...args)
  }
  try { assert.deepEqual((await scanVaultDocs()).map(d => d.title), ['Good']) }
  finally { fs.readFile = readFile }
})

test('client metadata joins raw docs_path by id, counts descendants and excludes neighboring folders', async () => {
  const { vault, root } = await fixture('clients')
  for (const folder of ['Clients/A/Nested', 'Clients/AB']) await fs.mkdir(path.join(root, folder), { recursive: true })
  for (const file of ['Clients/A/one.md', 'Clients/A/Nested/two.md', 'Clients/AB/three.md']) await fs.writeFile(path.join(root, file), '# Note')
  const folder = `${PIPELINE_VAULT_PATH}/Clients/A`
  const original = JSON.stringify({ leads: [
    { id: 'a', docs_path: folder }, { lead_id: 'absolute', docs_path: path.join(vault, folder) },
    { id: 'none' }, { id: 'outside', docs_path: '../other-vault' }, { id: 'missing', docs_path: `${PIPELINE_VAULT_PATH}/Clients/Missing` },
  ] })
  await fs.writeFile(path.join(temp, 'pipeline.json'), original)
  assert.deepEqual(await collectVaultClientDocs(await scanVaultDocs()), [
    { leadId: 'a', path: folder, count: 2 }, { leadId: 'absolute', path: folder, count: 2 },
    { leadId: 'missing', path: `${PIPELINE_VAULT_PATH}/Clients/Missing`, count: 0 },
  ])
  assert.equal(await fs.readFile(path.join(temp, 'pipeline.json'), 'utf8'), original)
})

test('Obsidian links encode vault, spaces, ampersands and hashes; folder suffix stays intact', () => {
  assert.equal(obsidianLink('/home/mp/Documents/Preciado Tech', 'a/Pricing & Terms #1.md'), 'obsidian://open?vault=Preciado%20Tech&file=a%2FPricing%20%26%20Terms%20%231')
  assert.equal(obsidianLink('/tmp/Other Vault/', 'Clients/A.md', true), 'obsidian://open?vault=Other%20Vault&file=Clients%2FA.md')
})

test('vault GET enforces pipeline authorization, returns metadata, and handles missing directory', async () => {
  const request = headers => new NextRequest('http://localhost/api/vault', { headers })
  const denied = await GET(request({ 'x-forwarded-for': '192.0.2.1' }))
  assert.equal(denied.status, 401)
  assert.equal(denied.headers.get('cache-control'), 'no-store')
  const allowed = await GET(request({ 'x-forwarded-for': '192.0.2.1', authorization: 'Bearer vault-test-only' }))
  assert.equal(allowed.status, 200)
  assert.equal((await allowed.json()).docs.length, 3)
  process.env.MC_VAULT_DIR = path.join(temp, 'missing-api')
  resetConfigCache()
  const empty = await GET(request({}))
  assert.equal(empty.status, 200)
  const data = await empty.json()
  assert.equal(data.vaultDir, process.env.MC_VAULT_DIR)
  assert.deepEqual(data.docs, [])
  assert.deepEqual(data.groups, [])
})
