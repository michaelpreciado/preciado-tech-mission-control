import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { COMMAND_CATALOG, COMMAND_ACTION_IDS, PRACTICE_AREAS, paletteSnapshot } from '../lib/pt/catalog.ts'
import { CADENCE } from '../lib/pt/contract.ts'
import { commandsEnvelope } from '../lib/pt/commands.ts'
import { compatibleCommands } from '../lib/pt/command-display.mjs'
import { COMMAND_NAV } from '../lib/nav-tabs.ts'
import { displaySnapshot } from '../../desktop/mp.preciadoTech.command/collector.mjs'
const read = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8'))
const cases = read('./pt-parity/command-envelopes.json')
const nativeFixture = read('../../desktop/mp.preciadoTech.command/fixture.json')
const packaged = read('../../desktop/mp.preciadoTech.command/catalog.json')
const ids = rows => rows.map(c => c.id).sort()
const expectedIds = ['command','crew','deliverables','pipeline']

test('catalog, API, palette, nav and frozen desktop have exactly the same four IDs', () => {
  assert.deepEqual(packaged, { commands: COMMAND_CATALOG, practiceAreas: PRACTICE_AREAS })
  const mc = paletteSnapshot(cases[0].envelope, Date.parse(cases[0].now))
  for (const rows of [COMMAND_CATALOG, cases[0].envelope.data.commands, mc.commands, nativeFixture.commands]) assert.deepEqual(ids(rows), expectedIds)
  assert.deepEqual(COMMAND_NAV.flatMap(g => g.items.map(c => c.destinationId)).sort(), expectedIds)
  assert.deepEqual(COMMAND_NAV.map(g => g.section), PRACTICE_AREAS)
  assert.deepEqual(mc.groups.map(g => g.practiceArea), PRACTICE_AREAS)
  assert.deepEqual(displaySnapshot(cases[0].envelope, Date.parse(cases[0].now)), nativeFixture)
  console.log('MC palette catalog IDs:', mc.commands.map(c => c.id).join(', '))
  console.log('Desktop fixture catalog IDs:', nativeFixture.commands.map(c => c.id).join(', '))
  console.log('Disabled:', nativeFixture.commands.filter(c => !c.enabled).map(c => `${c.id} (${c.blockedReason})`).join(', '))
})

test('packaged transport and command display modules are byte-identical', () => {
  for (const file of ['command-display.mjs','presentation-state.mjs']) assert.equal(
    fs.readFileSync(new URL('../lib/pt/' + file, import.meta.url), 'utf8'),
    fs.readFileSync(new URL('../../desktop/mp.preciadoTech.command/' + file, import.meta.url), 'utf8'))
})

for (const row of cases) test(`command parity and disabled reasons: ${row.id}`, () => {
  const mc = paletteSnapshot(row.envelope, Date.parse(row.now), row.failed, row.error)
  const native = displaySnapshot(row.envelope, Date.parse(row.now), row.failed, row.error)
  assert.deepEqual(native.commands, mc.commands)
  assert.deepEqual(native.groups, mc.groups)
  for (const c of mc.commands) {
    assert.equal(c.blockedReason, row.expected[c.id], c.id)
    assert.equal(c.enabled, row.expected[c.id] === null)
    assert.ok(COMMAND_ACTION_IDS.includes(c.desktopActionId))
  }
})

test('badge references preserve owner facts, snapshot IDs, source states and independent evidence expiry', () => {
  const pipeline = read('./pt-parity/radar-envelopes.json')[0].envelope
  const crew = read('./pt-parity/crew-envelopes.json')[0].envelope
  const { envelope, now } = cases[0]
  assert.deepEqual(commandsEnvelope({ pipeline, crew }, now), envelope)
  for (const [id, owner] of Object.entries({ pipeline, crew })) {
    const ref = envelope.data.referencedSnapshots[id]
    for (const key of ['snapshotId','dataRevision','generatedAt','validUntil','sources','errors']) assert.deepEqual(ref[key], owner[key])
  }
  assert.equal(envelope.data.referencedSnapshots.pipeline.data.facts.pendingDecisionCount, pipeline.data.pendingDecisionCount)
  assert.equal(envelope.data.referencedSnapshots.crew.data.facts['counts.needsIntervention'], crew.data.counts.needsIntervention)
  assert.equal(Date.parse(envelope.validUntil) - Date.parse(now), CADENCE.command.validityMs)
  const later = commandsEnvelope({ pipeline, crew }, '2026-10-03T16:00:01.000Z')
  assert.equal(envelope.dataRevision, later.dataRevision)
  assert.notEqual(envelope.snapshotId, later.snapshotId)
  assert.equal(Date.parse(later.validUntil) - Date.parse(envelope.validUntil), 1000)
  const expired = paletteSnapshot(envelope, Date.parse(crew.validUntil))
  assert.equal(expired.commands.find(c => c.id === 'crew').badge.freshness, 'stale')
  assert.equal(expired.commands.find(c => c.id === 'crew').badge.value, crew.data.counts.needsIntervention)
  const missing = paletteSnapshot(cases.at(-1).envelope, Date.parse(now)).commands[0].badge
  assert.equal(missing.value, null); assert.equal(missing.freshness, 'unknown')
})

for (const [field,value] of [['id','ticker'],['webPath','//evil.invalid'],['webPath','/pipeline; touch /tmp/should-not-exist'],['desktopActionId','omarchy.clock'],['practiceArea','Untrusted']]) test(`reject unallowlisted API ${field}: ${value}`, () => {
  const envelope = structuredClone(cases[0].envelope)
  envelope.data.commands[0][field] = value
  assert.equal(compatibleCommands(envelope, COMMAND_CATALOG), false)
  assert.ok(paletteSnapshot(envelope, Date.parse(cases[0].now)).commands.every(c => !c.enabled))
})

test('native activation is gated by packaged action/path, readiness and expiry', () => {
  const context = vm.createContext({})
  const source = fs.readFileSync(new URL('../../desktop/mp.preciadoTech.command/ActionMap.js', import.meta.url), 'utf8')
  vm.runInContext(source.replace('.pragma library', ''), context)
  const now = Date.parse(cases[0].now), until = cases[0].envelope.validUntil, origin = 'http://127.0.0.1:4176'
  for (const c of COMMAND_CATALOG) assert.equal(context.target(c.desktopActionId,c.webPath,origin,true,until,now), c.enabled ? origin+c.webPath : '')
  assert.equal(context.target('omarchy.clock','/pipeline',origin,true,until,now),'')
  assert.equal(context.target('mp.preciadoTech.pipeline','//evil.invalid',origin,true,until,now),'')
  assert.equal(context.target('mp.preciadoTech.pipeline','/pipeline',origin,false,until,now),'')
  assert.equal(context.target('mp.preciadoTech.pipeline','/pipeline',origin,true,until,Date.parse(until)),'')
  assert.equal(context.target('mp.preciadoTech.pipeline','/pipeline','javascript:alert(1)',true,until,now),'')
})

test('collector fetches only /api/commands and keeps credentials out of argv, environment and display', async () => {
  const fsp = await import('node:fs/promises')
  const path = await import('node:path')
  const os = await import('node:os')
  const { collect } = await import('../../desktop/mp.preciadoTech.command/collector.mjs')
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(),'pt-command-collector-'))
  const audit = path.join(temp,'audit.json')
  const token = 'fixture-command-collector-only'
  const envelope = cases[0].envelope
  await fsp.writeFile(path.join(temp,'curl'), `#!/usr/bin/env python3
import os, sys, json
header = sys.stdin.read()
token = ${JSON.stringify(token)}
with open(${JSON.stringify(audit)}, 'w') as f:
 json.dump({'args':sys.argv[1:], 'tokenInArgs':any(token in arg for arg in sys.argv), 'tokenInEnv':any(token in value for value in os.environ.values()), 'secretNamesPresent':any(n in os.environ for n in ['INTERNAL_API_SECRET','MC_INTERNAL_API_SECRET']), 'headerMatches':header == ${JSON.stringify('header = "Authorization: Bearer '+token+'"\n')}}, f)
sys.stdout.write(${JSON.stringify(JSON.stringify(envelope)+'\n200')})
`, {mode:0o700})
  const credential = path.join(temp,'credential.env')
  await fsp.writeFile(credential,`MC_COMMAND_ORIGIN=http://127.0.0.1:4176\nINTERNAL_API_SECRET=${token}\n`,{mode:0o600})
  const saved = Object.fromEntries(['PATH','MC_COMMAND_ENV_FILE','INTERNAL_API_SECRET','MC_INTERNAL_API_SECRET'].map(key => [key,process.env[key]]))
  process.env.PATH = temp + path.delimiter + process.env.PATH
  process.env.MC_COMMAND_ENV_FILE = credential
  process.env.INTERNAL_API_SECRET = token
  process.env.MC_INTERNAL_API_SECRET = token
  try {
    const result = await collect()
    assert.deepEqual(result,{envelope,portalOrigin:'http://127.0.0.1:4176'})
    const log = JSON.parse(await fsp.readFile(audit,'utf8'))
    assert.equal(log.args.at(-1),'http://127.0.0.1:4176/api/commands')
    assert.equal(log.args[0],'-q'); assert.equal(log.tokenInArgs,false); assert.equal(log.tokenInEnv,false); assert.equal(log.secretNamesPresent,false); assert.equal(log.headerMatches,true)
    assert.ok(!log.args.includes('--location'))
    assert.ok(!JSON.stringify(displaySnapshot(result.envelope)).includes(token))
    await fsp.chmod(credential,0o644)
    await assert.rejects(collect(),/credential_file_unavailable/)
    await fsp.chmod(credential,0o600)
    const symlink = path.join(temp,'symlink.env')
    await fsp.symlink(credential,symlink); process.env.MC_COMMAND_ENV_FILE = symlink
    await assert.rejects(collect(),/credential_file_unavailable/)
  } finally {
    for (const [key,value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
})
