/** Count parity against the configured local kanban DB via sqlite3 -readonly. */
import { execFileSync } from 'node:child_process'
import { collectCrew, crewReadOptions } from '../lib/pt/crew-read.ts'
const options=crewReadOptions(), now=new Date().toISOString(), epoch=Date.parse(now)
const snapshot=collectCrew(now,options), counts=snapshot.data.counts
// Normalize both epoch units, using the same frozen evaluation time as the API.
const sql=`WITH facts AS (
 SELECT status, LOWER(TRIM(COALESCE(assignee,''))) AS owner,
 CASE WHEN status IN ('running','in_progress') AND typeof(current_run_id)='integer' AND current_run_id>0
 AND typeof(last_heartbeat_at) IN ('integer','real')
 AND (CASE WHEN last_heartbeat_at>1000000000000 THEN last_heartbeat_at ELSE last_heartbeat_at*1000 END) BETWEEN ${epoch-600000} AND ${epoch}
 THEN 1 ELSE 0 END AS confirmed FROM tasks
)
SELECT COUNT(*) AS totalTasks,
 SUM(status IN ('running','in_progress')) AS runningTasks,
 SUM(confirmed) AS confirmedWorkers,
 SUM(status IN ('running','in_progress') AND confirmed=0) AS trackedOnly,
 COUNT(DISTINCT CASE WHEN confirmed=1 AND owner NOT IN ('','none','unassigned') THEN owner END) AS active,
 SUM(status IN ('blocked','failed','review')) AS interventionTasks,
 COUNT(DISTINCT CASE WHEN status IN ('blocked','failed','review') AND owner NOT IN ('','none','unassigned') THEN owner END) AS membersWithInterventionTasks,
 SUM(status NOT IN ('done','archived') AND owner IN ('','none','unassigned')) AS unassignedTasks FROM facts;`
const raw=JSON.parse(execFileSync('sqlite3',['-readonly','-json',options.kanbanDb,sql],{encoding:'utf8'}))[0]
console.log(`Evaluation: ${now}\nConfigured DB: ${options.kanbanDb}\nReader: sqlite3 -readonly (no task writes)`)
console.log(`${'Metric'.padEnd(32)}${'Crew projection'.padStart(18)}${'Raw SQLite'.padStart(18)}`)
let match=true
for(const key of ['runningTasks','confirmedWorkers','trackedOnly','active','interventionTasks','unassignedTasks']) {
 const expected=raw[key]??0
 console.log(`${key.padEnd(32)}${String(counts[key]).padStart(18)}${String(expected).padStart(18)}`)
 if(counts[key]!==expected)match=false
}
const taskMembers=snapshot.data.members.filter(m=>m.tasks.some(t=>t.needsIntervention)).length
console.log(`${'membersWithInterventionTasks'.padEnd(32)}${String(taskMembers).padStart(18)}${String(raw.membersWithInterventionTasks).padStart(18)}`)
if(taskMembers!==raw.membersWithInterventionTasks)match=false
console.log(`Crew needsIntervention (task OR gateway flag): ${counts.needsIntervention}`)
console.log(`Reported presence observations: ${counts.presenceReported}; unknown members: ${counts.unknown}; database rows: ${raw.totalTasks}`)
console.log(`Evidence-free identity check: ${snapshot.data.members.filter(m=>['pepper','edith','scout','sage','forge','ticker','echo'].includes(m.id)).map(m=>m.id+'='+m.kind).join(', ')}`)
console.log(`Parity: ${match?'PASS':'CHANGED / MISMATCH (independent live reads)'}`)
if(!match)process.exitCode=1
