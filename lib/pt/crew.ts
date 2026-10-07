/** The sole crew fact projection. Pure and shared with flight-strip consumers.
 * Identity/roles never establish presence, a model, or a worker. */
import { CADENCE, evaluateFreshness, type Freshness } from './contract'
import type { AgentHeartbeat, HermesTask } from '../types'

export type CrewKind = 'confirmed-worker' | 'tracked-only' | 'presence-reported' | 'unknown'
export type DatedFact = { sourceAt: string | null; freshness: Freshness; reason: string | null }
export type CrewTaskInput = Pick<HermesTask, 'id' | 'title' | 'status' | 'assignee' | 'currentRunId' | 'startedAt' | 'lastHeartbeatAt'>
export type WorkerFact = DatedFact & { kind: 'confirmed-worker' | 'tracked-only' | 'unknown'; runId: number | null; evidence: 'task-heartbeat' | 'startedAt' | null }
export type CrewTask = { id: string; title: string; status: string; assignee: string | null; worker: WorkerFact; needsIntervention: boolean }
export type ProfileObservation = { id: string; gateway?: { status: string; sourceAt: string | null; needsAttention: boolean }; model?: { value: string | null; sourceAt: string | null }; lastMessageAt?: string | null }
export type CrewRow = {
  id: string; name: string; kind: CrewKind; worker: WorkerFact
  presence: DatedFact & { kind: 'presence-reported' | 'unknown'; reportedStatus: string | null; reportedTask: string | null }
  gateway: DatedFact & { status: string; needsAttention: boolean }
  model: DatedFact & { value: string | null }
  lastMessageAt: string | null
  currentTask: CrewTask | null; tasks: CrewTask[]; needsIntervention: boolean
}
export type CrewProjection = {
  members: CrewRow[]; tasks: CrewTask[] | null
  counts: { members: number; active: number | null; confirmedWorkers: number | null; trackedOnly: number | null; presenceReported: number | null; unknown: number; needsIntervention: number | null; interventionTasks: number | null; runningTasks: number | null; unassignedTasks: number | null }
}
// Roster membership only; no default roles/models/status are projected.
export const CREW_IDENTITIES = ['jarvis', 'friday', 'pepper', 'edith', 'scout', 'sage', 'forge', 'ticker', 'echo', 'crypto'] as const
export const crewId = (id: string | null | undefined) => (id ?? '').trim().toLowerCase()
export const isCrewUnassigned = (id: string | null | undefined) => ['', 'none', 'unassigned'].includes(crewId(id))
export const isRunningTask = (status: string) => status === 'running' || status === 'in_progress'
export const needsIntervention = (status: string) => ['blocked', 'failed', 'review'].includes(status)

export function datedFact(sourceAt: string | null | undefined, now: string, cadenceMs: number = CADENCE.crew.workerWindowMs): DatedFact {
  return { sourceAt: sourceAt ?? null, ...evaluateFreshness({ read: 'success', hasSnapshot: sourceAt != null, evidenceAt: sourceAt ?? null, now, cadenceMs }) }
}
export function classifyWorker(task: Pick<CrewTaskInput, 'status' | 'currentRunId' | 'lastHeartbeatAt' | 'startedAt'>, now: string): WorkerFact {
  const runId = typeof task.currentRunId === 'number' && Number.isSafeInteger(task.currentRunId) && task.currentRunId > 0 ? task.currentRunId : null
  const heartbeat = task.lastHeartbeatAt != null
  const fact = datedFact(heartbeat ? task.lastHeartbeatAt : task.startedAt, now)
  if (!isRunningTask(task.status)) return { kind: 'unknown', runId, evidence: null, ...fact, reason: 'not_running' }
  const confirmed = heartbeat && runId !== null && fact.freshness === 'fresh'
  return { kind: confirmed ? 'confirmed-worker' : 'tracked-only', runId, evidence: heartbeat ? 'task-heartbeat' : task.startedAt ? 'startedAt' : null,
    ...fact, reason: confirmed ? null : fact.reason ?? (runId === null ? 'no_run_id' : 'no_task_heartbeat') }
}

export function projectCrew(input: { tasks: CrewTaskInput[] | null; heartbeats: AgentHeartbeat[] | null; profiles?: ProfileObservation[]; identities?: readonly string[] }, now: string): CrewProjection {
  if (!Number.isFinite(Date.parse(now))) throw new RangeError('Invalid evaluation time')
  const tasks = input.tasks?.map((t): CrewTask => ({ id: t.id, title: t.title, status: t.status, assignee: isCrewUnassigned(t.assignee) ? null : crewId(t.assignee), worker: classifyWorker(t, now), needsIntervention: needsIntervention(t.status) })).sort((a,b) => a.id.localeCompare(b.id)) ?? null
  const open = (tasks ?? []).filter(t => !['done', 'archived'].includes(t.status))
  const profiles = new Map((input.profiles ?? []).map(p => [crewId(p.id), p]))
  const reports = new Map<string, AgentHeartbeat>()
  for (const hb of input.heartbeats ?? []) {
    const id = crewId(hb.id), previous = reports.get(id)
    if (!previous || hb.receivedAt > previous.receivedAt) reports.set(id, hb)
  }
  const ids = new Set([...(input.identities ?? CREW_IDENTITIES).map(crewId), ...profiles.keys(), ...reports.keys(), ...open.flatMap(t => t.assignee ? [t.assignee] : [])])
  const members: CrewRow[] = [...ids].filter(id => !isCrewUnassigned(id)).sort().map(id => {
    const owned = open.filter(t => t.assignee === id)
    const confirmed = owned.filter(t => t.worker.kind === 'confirmed-worker')
    const tracked = owned.filter(t => t.worker.kind === 'tracked-only')
    const currentTask = [...confirmed, ...tracked].sort((a,b) => Number(b.worker.kind === 'confirmed-worker') - Number(a.worker.kind === 'confirmed-worker') || (b.worker.sourceAt ?? '').localeCompare(a.worker.sourceAt ?? '') || a.id.localeCompare(b.id))[0] ?? null
    const worker = currentTask?.worker ?? { kind: 'unknown' as const, runId: null, evidence: null, ...datedFact(null, now) }
    const hb = reports.get(id), profile = profiles.get(id)
    const received = hb && Number.isFinite(hb.receivedAt) && Math.abs(hb.receivedAt) <= 8640000000000000 ? new Date(hb.receivedAt).toISOString() : null
    const presence = { kind: hb ? 'presence-reported' as const : 'unknown' as const, reportedStatus: hb?.status ?? null, reportedTask: hb?.currentTask ?? null, ...datedFact(received, now, CADENCE.crew.heartbeatTtlMs) }
    const gateway = { status: profile?.gateway?.status ?? 'unknown', needsAttention: profile?.gateway?.needsAttention ?? false, ...datedFact(profile?.gateway?.sourceAt, now, CADENCE.crew.validityMs) }
    return { id, name: id, kind: worker.kind !== 'unknown' ? worker.kind : presence.kind, worker, presence, gateway,
      model: { value: profile?.model?.value ?? null, ...datedFact(profile?.model?.sourceAt, now) }, lastMessageAt: profile?.lastMessageAt ?? null,
      currentTask, tasks: owned, needsIntervention: owned.some(t => t.needsIntervention) || gateway.needsAttention }
  })
  return { members, tasks, counts: {
    members: members.length, active: tasks === null ? null : members.filter(m => m.worker.kind === 'confirmed-worker').length,
    confirmedWorkers: tasks === null ? null : tasks.filter(t => t.worker.kind === 'confirmed-worker').length,
    trackedOnly: tasks === null ? null : tasks.filter(t => t.worker.kind === 'tracked-only').length,
    presenceReported: input.heartbeats === null ? null : members.filter(m => m.presence.kind === 'presence-reported').length,
    unknown: members.filter(m => m.kind === 'unknown').length,
    needsIntervention: tasks === null ? null : members.filter(m => m.needsIntervention).length,
    interventionTasks: tasks === null ? null : tasks.filter(t => t.needsIntervention).length,
    runningTasks: tasks === null ? null : tasks.filter(t => isRunningTask(t.status)).length,
    unassignedTasks: tasks === null ? null : open.filter(t => t.assignee === null).length,
  } }
}
