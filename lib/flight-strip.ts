import type { HermesTask } from './types'
import { CADENCE } from './pt/contract'
import { classifyWorker, isCrewUnassigned, type CrewProjection } from './pt/crew'

/* Pure derivation for the Home brief, Kanban lanes and Crew roster.
   Nothing here fetches or mutates; every function takes the data it needs. */

export type LaneId = 'needs_you' | 'running' | 'up_next' | 'done'
export type StripTone = 'run' | 'you' | 'fail' | 'next' | 'done'
export type WorkerState = 'live' | 'no-worker' | 'not-running'

export const LANE_ORDER: LaneId[] = ['needs_you', 'running', 'up_next', 'done']
export const LANE_LABEL: Record<LaneId, string> = {
  needs_you: 'Needs you',
  running: 'Running',
  up_next: 'Up next',
  done: 'Done',
}

/** A worker counts as live only if it heartbeated inside this window. */
export const WORKER_FRESH_MS = CADENCE.crew.workerWindowMs

const LANE_BY_STATUS: Record<string, LaneId> = {
  review: 'needs_you',
  failed: 'needs_you',
  blocked: 'needs_you',
  running: 'running',
  in_progress: 'running',
  ready: 'up_next',
  todo: 'up_next',
  scheduled: 'up_next',
  triage: 'up_next',
  done: 'done',
  archived: 'done',
}

const STATE_WORD: Record<string, string> = {
  review: 'In review',
  failed: 'Failed',
  blocked: 'Blocked',
  running: 'Running',
  in_progress: 'Running',
  ready: 'Ready',
  todo: 'To do',
  scheduled: 'Scheduled',
  triage: 'Triage',
  done: 'Done',
  archived: 'Archived',
}

export function laneFor(status: string): LaneId {
  return LANE_BY_STATUS[status] ?? 'up_next'
}

export function isUnassigned(assignee: string | null | undefined): boolean {
  return isCrewUnassigned(assignee)
}

const isRunningStatus = (status: string) => status === 'running' || status === 'in_progress'

export function workerState(task: HermesTask, now: number): WorkerState {
  if (!isRunningStatus(task.status)) return 'not-running'
  return classifyWorker(task, new Date(now).toISOString()).kind === 'confirmed-worker' ? 'live' : 'no-worker'
}

export function toneFor(task: HermesTask, now: number): StripTone {
  switch (task.status) {
    case 'failed': return 'fail'
    case 'blocked':
    case 'review': return 'you'
    case 'done': return 'done'
    default: return workerState(task, now) === 'live' ? 'run' : 'next'
  }
}

export function stateWord(task: HermesTask, now: number): string {
  if (isRunningStatus(task.status)) {
    return workerState(task, now) === 'live' ? 'Running' : 'Marked running · no live worker'
  }
  return STATE_WORD[task.status] ?? task.status.replace(/_/g, ' ')
}

export type KanbanSummary = {
  needsYou: number
  runningLive: number
  trackingOnly: number
  upNext: number
  done: number
  /** Non-terminal tasks: everything except done and archived. */
  open: number
}

export function summarizeKanban(tasks: HermesTask[], now: number): KanbanSummary {
  const s: KanbanSummary = { needsYou: 0, runningLive: 0, trackingOnly: 0, upNext: 0, done: 0, open: 0 }
  for (const t of tasks) {
    const lane = laneFor(t.status)
    if (lane === 'needs_you') s.needsYou++
    else if (lane === 'up_next') s.upNext++
    else if (lane === 'done') s.done++
    else if (workerState(t, now) === 'live') s.runningLive++
    else s.trackingOnly++
    if (lane !== 'done') s.open++
  }
  return s
}

export type BriefKind = 'loading' | 'unavailable' | 'stale' | 'ok'

export function briefSentence(
  summary: KanbanSummary | null,
  opts: { loading?: boolean; error?: string | null },
): { kind: BriefKind; text: string } {
  if (!summary) {
    if (opts.error && !opts.loading) return { kind: 'unavailable', text: 'The task board is unavailable right now.' }
    return { kind: 'loading', text: 'Checking the task board…' }
  }
  const run = summary.runningLive
  const need = summary.needsYou
  const runPart = run === 0 ? 'Nothing is running' : run === 1 ? '1 is running' : `${run} are running`
  const needPart = need === 0 ? 'nothing needs you' : need === 1 ? '1 is waiting on you' : `${need} are waiting on you`
  const text = run === 0 && need === 0 ? `${runPart} and ${needPart}.` : `${runPart}, and ${needPart}.`
  return opts.error
    ? { kind: 'stale', text: `${text} (Last known. The latest refresh failed.)` }
    : { kind: 'ok', text }
}

const createdMs = (t: HermesTask) => {
  const ms = t.createdAt ? Date.parse(t.createdAt) : NaN
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY
}

const NEEDS_RANK: Record<string, number> = { failed: 0, blocked: 1, review: 2 }

export function needsYouTasks(tasks: HermesTask[], max = 6): HermesTask[] {
  return tasks
    .filter(t => laneFor(t.status) === 'needs_you')
    .sort((a, b) => (NEEDS_RANK[a.status] ?? 3) - (NEEDS_RANK[b.status] ?? 3) || createdMs(a) - createdMs(b))
    .slice(0, max)
}

export type MovedKind = 'done' | 'failed' | 'started' | 'created'
export type MovedEvent = { task: HermesTask; kind: MovedKind; at: number }
export const MOVED_WINDOW_MS = 24 * 60 * 60 * 1000

const isoMs = (v?: string) => { const ms = v ? Date.parse(v) : NaN; return Number.isFinite(ms) ? ms : null }

/** What moved on the board inside the window, newest first — one row per task, its latest
 *  move. Read only from the card's own timestamps (completedAt, startedAt, createdAt); a
 *  failed card's last start is reported as the failure. Nothing is inferred beyond that. */
export function movedTasks(tasks: HermesTask[], now: number, windowMs = MOVED_WINDOW_MS): MovedEvent[] {
  const from = now - windowMs
  const out: MovedEvent[] = []
  for (const task of tasks) {
    const marks: [MovedKind, number | null][] = [
      ['done', isoMs(task.completedAt)],
      [task.status === 'failed' ? 'failed' : 'started', isoMs(task.startedAt)],
      ['created', isoMs(task.createdAt)],
    ]
    let best: MovedEvent | null = null
    for (const [kind, at] of marks) {
      // A minute of clock skew between the board and this machine is not "the future".
      if (at == null || at < from || at > now + 60_000) continue
      if (!best || at > best.at) best = { task, kind, at }
    }
    if (best) out.push(best)
  }
  return out.sort((a, b) => b.at - a.at)
}

/** Count epoch-ms marks into `hours` hourly buckets ending at `now`, oldest first. */
export function hourBuckets(times: number[], now: number, hours = 24): number[] {
  const out = new Array<number>(hours).fill(0)
  for (const t of times) {
    const back = Math.floor((now - t) / 3_600_000)
    if (back >= 0 && back < hours) out[hours - 1 - back]++
  }
  return out
}

export function upNextTasks(tasks: HermesTask[], max = 3): HermesTask[] {
  return tasks
    .filter(t => laneFor(t.status) === 'up_next')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || createdMs(a) - createdMs(b))
    .slice(0, max)
}

/** Board ordering: pinned first, then blocked/failed, then repeat failures, then oldest. */
export function taskSort(a: HermesTask, b: HermesTask, pinned: Set<string>): number {
  const aPin = pinned.has(a.id) ? 0 : 1
  const bPin = pinned.has(b.id) ? 0 : 1
  if (aPin !== bPin) return aPin - bPin
  const aBad = a.status === 'blocked' || a.status === 'failed' ? 0 : 1
  const bBad = b.status === 'blocked' || b.status === 'failed' ? 0 : 1
  if (aBad !== bBad) return aBad - bBad
  const af = a.consecutiveFailures ?? 0
  const bf = b.consecutiveFailures ?? 0
  if (af !== bf) return bf - af
  const at = a.createdAt ? new Date(a.createdAt).getTime() : 0
  const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0
  return at - bt
}

/** Roster adapter accepts only the canonical projection, never role/cron guesses. */
export function buildRoster(projection: CrewProjection | null) {
  return { rows: projection?.members ?? [], unowned: { count: projection?.counts.unassignedTasks ?? null, tasks: projection?.tasks?.filter(t => t.assignee === null && !['done', 'archived'].includes(t.status)) ?? [] } }
}
