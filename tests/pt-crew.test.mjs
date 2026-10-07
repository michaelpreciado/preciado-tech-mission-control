import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { projectCrew, classifyWorker } from '../lib/pt/crew.ts'
import { crewEnvelope, collectCrew, deniedCrewEnvelope } from '../lib/pt/crew-read.ts'
import { readHeartbeatObservations, getHeartbeats } from '../lib/heartbeats.ts'
import { crewDisplay } from '../lib/pt/crew-display.mjs'
import { displaySnapshot, collect } from '../../desktop/mp.preciadoTech.crew/collector.mjs'
import { workerState } from '../lib/flight-strip.ts'
import { legacyCrew } from '../lib/collectors/crew.ts'
const fixture = JSON.parse(fs.readFileSync(new URL('./pt-parity/crew.json', import.meta.url)))
const now = fixture.evaluatedAt, ms = Date.parse(now)
const source = { id:'fixture',revision:'fixture-revision',sourceAt:null,observedAt:now,lastSuccessAt:now,freshness:'fresh',blocked:false,reason:null }
const envelope = input => crewEnvelope(projectCrew(input, now), [source], now)
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')

for (const row of fixture.cases) test(`crew parity: ${row.id}`, () => {
  const snapshot = envelope(row.input), mc = crewDisplay(snapshot, ms), native = displaySnapshot(snapshot, ms)
  assert.deepEqual(native.rows, mc.rows)
  assert.deepEqual(native.counts, mc.counts)
  const member = mc.rows.find(m => m.id === 'friday')
  assert.deepEqual({kind:member.kind,worker:member.worker.kind,workerFreshness:member.worker.freshness,presence:member.presence.kind,presenceFreshness:member.presence.freshness,active:mc.active,needsIntervention:mc.needsIntervention},row.expected)
  for(const id of ['pepper','edith','sage']) assert.equal(mc.rows.find(m=>m.id===id).kind,'unknown')
  for(const task of row.input.tasks ?? []) assert.equal(workerState(task,ms)==='live',classifyWorker(task,now).kind==='confirmed-worker')
})
test('needs intervention is orthogonal to active; unassigned confirmed runs do not create members', () => {
  const tasks = [{id:'a',title:'a',assignee:'friday',status:'running',currentRunId:1,lastHeartbeatAt:now},{id:'b',title:'b',assignee:'friday',status:'blocked'},{id:'c',title:'c',assignee:'none',status:'running',currentRunId:2,lastHeartbeatAt:now}]
  const projection = projectCrew({tasks,heartbeats:[]},now)
  assert.equal(projection.counts.active,1); assert.equal(projection.counts.confirmedWorkers,2);assert.equal(projection.counts.needsIntervention,1)
  assert.equal(projection.counts.unassignedTasks,1)
  assert.equal(legacyCrew(crewEnvelope(projection,[source],now)).find(m=>m.id==='sage').status,'unknown')
  assert.equal(legacyCrew(crewEnvelope(projection,[source],now)).find(m=>m.id==='sage').model,undefined)
})
test('denied-auth: no snapshot, and failed refresh with retained snapshot', () => {
  const denied=deniedCrewEnvelope(now)
  for(const snap of [null,denied,envelope(fixture.cases[0].input)]) {
    const mc=crewDisplay(snap,ms,true,'access_denied'), native=displaySnapshot(snap,ms,true,'access_denied')
    assert.deepEqual(native.rows,mc.rows);assert.equal(mc.blocked,true)
    assert.equal(mc.freshness,snap?.data ? 'stale':'unknown')
    if(snap?.data) assert.equal(mc.rows.find(m=>m.id==='friday').worker.freshness,'stale')
    else assert.equal(mc.active,null)
  }
})
test('idle SSE / unchanged polls cannot extend producer evidence or retained transport', () => {
  const input=fixture.cases.find(c=>c.id==='idle-SSE').input
  const a=envelope(input), later=new Date(ms+600001).toISOString()
  const b=crewEnvelope(projectCrew(input,later),[{...source,observedAt:later,lastSuccessAt:later}],later)
  assert.equal(a.dataRevision,b.dataRevision);assert.notEqual(a.snapshotId,b.snapshotId)
  assert.equal(b.data.members.find(m=>m.id==='friday').presence.freshness,'stale')
  assert.equal(b.data.counts.active,0)
  for(const t of [ms+45000,ms+90000]) {
    assert.deepEqual(displaySnapshot(a,t).rows,crewDisplay(a,t).rows)
    assert.equal(crewDisplay(a,t).lastKnown,true)
  }
  assert.equal(crewDisplay(a,ms-1).error,'future_snapshot')
})
test('packaged browser/collector adapters are byte-identical; actual fixture CLI matches', () => {
  for(const file of ['crew-display.mjs','presentation-state.mjs']) assert.equal(hash(`lib/pt/${file}`),hash(`../desktop/mp.preciadoTech.crew/${file}`))
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crew-cli-'))
  try {
    const file=path.join(dir,'fixture.json'),snap=envelope(fixture.cases[0].input)
    fs.writeFileSync(file,JSON.stringify(snap))
    const run=spawnSync(process.execPath,['../desktop/mp.preciadoTech.crew/collector.mjs','--fixture',file,now],{encoding:'utf8'})
    assert.equal(run.error,undefined)
    assert.equal(run.status,0,run.stderr)
    assert.deepEqual(JSON.parse(run.stdout),displaySnapshot(snap,ms))
  } finally { fs.rmSync(dir,{recursive:true,force:true}) }
})
test('read adapters use configured DB, retain expired reports, expose failures, and never read credentials', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crew-read-')), profiles=path.join(dir,'profiles'), friday=path.join(profiles,'friday'), pepper=path.join(profiles,'pepper')
  fs.mkdirSync(friday,{recursive:true});fs.mkdirSync(pepper)
  const board=path.join(dir,'kanban.db'), hb=path.join(dir,'heartbeats.json'), state=path.join(friday,'state.db')
  let db=new DatabaseSync(board)
  db.exec('CREATE TABLE tasks (id TEXT, title TEXT, status TEXT, assignee TEXT, current_run_id INTEGER, started_at REAL, last_heartbeat_at REAL, session_id TEXT, priority INTEGER, created_by TEXT, created_at REAL, completed_at REAL, consecutive_failures INTEGER, last_failure_error TEXT); CREATE TABLE task_links (parent_id TEXT, child_id TEXT);')
  const insert=db.prepare('INSERT INTO tasks (id, title, status, assignee, current_run_id, started_at, last_heartbeat_at, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  for(let i=0;i<550;i++) insert.run(`t${i}`,'Fixture','running','friday',i+1,ms/1000-5,ms/1000-1,'session-sentinel')
  db.close();db=new DatabaseSync(state)
  db.exec("CREATE TABLE sessions (id TEXT, archived INTEGER, model TEXT, started_at REAL);CREATE TABLE messages (session_id TEXT, timestamp REAL);")
  db.prepare('INSERT INTO sessions VALUES (?,0,?,?)').run('session-sentinel','fixture/model',ms/1000-5)
  db.prepare('INSERT INTO messages VALUES (?,?)').run('session-sentinel',ms/1000-1);db.close()
  fs.writeFileSync(path.join(friday,'gateway_state.json'),JSON.stringify({gateway_state:'running',updated_at:now,token:'credential-sentinel'}))
  fs.writeFileSync(path.join(pepper,'gateway_state.json'),JSON.stringify({gateway_state:'running',updated_at:now}))
  fs.writeFileSync(hb,JSON.stringify([{id:'friday',status:'working',receivedAt:ms-300001,telegramToken:'credential-sentinel'}]))
  fs.writeFileSync(path.join(friday,'.env'),'TOKEN=credential-sentinel')
  const options={kanbanDb:board,heartbeatsFile:hb,gatewayFile:path.join(friday,'gateway_state.json')}
  const before=[hash(board),hash(state),hash(hb)], original=fs.readFileSync
  let credentials=0
  fs.readFileSync=function(file,...args) { if(String(file).endsWith('.env')) { credentials++;throw Error('forbidden') };return original.call(this,file,...args) }
  try {
    const result=collectCrew(now,options), row=result.data.members.find(m=>m.id==='friday')
    assert.equal(result.data.counts.confirmedWorkers,550);assert.equal(result.data.counts.active,1)
    assert.equal(row.model.value,'fixture/model');assert.equal(row.presence.freshness,'stale')
    assert.equal(result.data.members.find(m=>m.id==='pepper').kind,'unknown')
    assert.ok(!result.sources.some(s=>s.id==='gateway:default'))
    assert.equal(credentials,0);assert.doesNotMatch(JSON.stringify(result),/session-sentinel|credential-sentinel|telegramToken|session_id|canonicalSessionId/)
    assert.deepEqual([hash(board),hash(state),hash(hb)],before)
    getHeartbeats();assert.equal(readHeartbeatObservations(hb).observations.length,1)
    const missing=collectCrew(now,{...options,kanbanDb:path.join(dir,'absent')})
    assert.equal(missing.data.counts.active,null);assert.equal(missing.sources.find(s=>s.id==='kanban').freshness,'unknown')
    fs.writeFileSync(path.join(dir,'broken.db'),'bad sqlite')
    assert.equal(collectCrew(now,{...options,kanbanDb:path.join(dir,'broken.db')}).sources.find(s=>s.id==='kanban').freshness,'error')
    fs.writeFileSync(hb,'not json');const brokenPresence=collectCrew(now,options);assert.equal(brokenPresence.sources.find(s=>s.id==='presence').freshness,'error');assert.equal(brokenPresence.data.counts.presenceReported,null)
  } finally { fs.readFileSync=original;fs.rmSync(dir,{recursive:true,force:true}) }
})
test('collector passes synthetic bearer over curl stdin only and distinguishes denied auth', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crew-curl-'))
  const envFile=path.join(dir,'auth.env'), bin=path.join(dir,'curl'), capture=path.join(dir,'capture.json'), snap=envelope(fixture.cases[0].input)
  const envBefore={...process.env}
  fs.writeFileSync(envFile,'MC_CREW_ORIGIN=http://127.0.0.1:4176\nINTERNAL_API_SECRET=synthetic-fixture-only\n',{mode:0o600})
  fs.writeFileSync(bin,`#!${process.execPath}\nconst fs=require('fs');let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify({args:process.argv.slice(2),input,secret:process.env.INTERNAL_API_SECRET,mcSecret:process.env.MC_INTERNAL_API_SECRET}));process.stdout.write(${JSON.stringify(JSON.stringify(snap)+'\n200')});});`,{mode:0o700})
  process.env.PATH=dir+':'+process.env.PATH;process.env.MC_CREW_ENV_FILE=envFile
  process.env.INTERNAL_API_SECRET='synthetic-fixture-only';process.env.MC_INTERNAL_API_SECRET='synthetic-mc-fixture-only'
  try {
    assert.deepEqual(await collect(),snap)
    const captured=JSON.parse(fs.readFileSync(capture))
    assert.equal(captured.args[0],'-q');assert.equal(captured.args.at(-1),'http://127.0.0.1:4176/api/crew')
    assert.ok(!captured.args.join(' ').includes('synthetic-fixture-only'));assert.equal(captured.secret,undefined);assert.equal(captured.mcSecret,undefined)
    assert.equal(captured.input,'header = "Authorization: Bearer synthetic-fixture-only"\n')
    fs.writeFileSync(bin,`#!${process.execPath}\nprocess.stdin.resume();process.stdin.on('end',()=>process.stdout.write('denied\\n401'));`,{mode:0o700})
    await assert.rejects(collect(),/access_denied/)
  } finally { for(const key of Object.keys(process.env)) if(!(key in envBefore)) delete process.env[key];Object.assign(process.env,envBefore);fs.rmSync(dir,{recursive:true,force:true}) }
})
test('malformed/incompatible snapshots are rejected without crashing either view', () => {
  const valid=envelope(fixture.cases[0].input)
  for(const snap of [{...valid,contractRevision:'future'}, {...valid,data:{...valid.data,members:[null]}}, {...valid,data:{...valid.data,members:[{id:'x'}]}}, {...valid,data:{...valid.data,counts:{active:'1'}}}]) {
    const mc=crewDisplay(snap,ms),native=displaySnapshot(snap,ms)
    assert.equal(mc.active,null);assert.equal(mc.freshness,'unknown');assert.deepEqual(native.rows,mc.rows)
  }
  const withExtra=structuredClone(valid)
  withExtra.data.counts.telegramToken='credential-sentinel'
  withExtra.data.members[0].sessionId='session-sentinel'
  assert.doesNotMatch(JSON.stringify(displaySnapshot(withExtra,ms)),/credential-sentinel|session-sentinel|telegramToken|sessionId/)
})
