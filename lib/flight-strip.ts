import type { HermesTask, CrewMember } from './types'
import type { Bot } from './collectors/bots'

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
export const WORKER_FRESH_MS = 10 * 60_000
const CLOCK_SKEW_MS = 60_000

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
  const v = (assignee ?? '').trim().toLowerCase()
  return v === '' || v === 'none' || v === 'unassigned'
}

const isRunningStatus = (status: string) => status === 'running' || status === 'in_progress'

export function workerState(task: HermesTask, now: number): WorkerState {
  if (!isRunningStatus(task.status)) return 'not-running'
  if (task.currentRunId == null) return 'no-worker'
  const stamp = task.lastHeartbeatAt ?? task.startedAt
  const at = stamp ? Date.parse(stamp) : NaN
  if (!Number.isFinite(at)) return 'no-worker'
  const age = now - at
  return age >= -CLOCK_SKEW_MS && age <= WORKER_FRESH_MS ? 'live' : 'no-worker'
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

/* ── Crew roster ─────────────────────────────────────────────────── */

export type RosterState = 'working' | 'attention' | 'degraded' | 'idle' | 'offline'

export type RosterRow = {
  name: string
  role: string | null
  model: string | null
  state: RosterState
  stateLabel: string
  detail: string
  /** Only present when the gateway actually reported a status. */
  gateway: { status: 'running' | 'degraded' | 'stopped'; detail: string } | null
  /** The task a live worker is on right now. */
  task: HermesTask | null
  counts: { live: number; tracked: number; blocked: number; failed: number; review: number; queued: number }
  lastActiveAt: number | null
}

export type Roster = {
  rows: RosterRow[]
  unowned: { count: number; tasks: HermesTask[] }
}

const STATE_ORDER: Record<RosterState, number> = { working: 0, attention: 1, degraded: 2, idle: 3, offline: 4 }
const STATE_LABEL: Record<RosterState, string> = {
  working: 'Working',
  attention: 'Needs you',
  degraded: 'Degraded',
  idle: 'Idle',
  offline: 'Offline',
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/* Copies only display-safe fields. Bot records also carry a Telegram token and
   session ids, which must never reach a rendered row. */
export function buildRoster(input: {
  bots: Bot[]
  crew: CrewMember[]
  tasks: HermesTask[]
  now: number
}): Roster {
  const { bots, crew, tasks, now } = input

  type Identity = { name: string; role: string | null; model: string | null; bot: Bot | null; crew: CrewMember | null }
  const identities = new Map<string, Identity>()

  for (const bot of bots) {
    identities.set(norm(bot.name), { name: bot.name, role: null, model: bot.model ?? null, bot, crew: null })
  }
  for (const member of crew) {
    const key = [norm(member.id), norm(member.name)].find(k => identities.has(k)) ?? norm(member.id)
    const existing = identities.get(key)
    if (existing) {
      existing.role = member.role || existing.role
      existing.model = existing.model ?? member.model ?? null
      existing.crew = member
    } else {
      identities.set(key, { name: String(member.id), role: member.role || null, model: member.model ?? null, bot: null, crew: member })
    }
  }

  const tasksByOwner = new Map<string, HermesTask[]>()
  const unownedTasks: HermesTask[] = []
  for (const t of tasks) {
    if (laneFor(t.status) === 'done') continue
    if (isUnassigned(t.assignee)) { unownedTasks.push(t); continue }
    const key = norm(t.assignee)
    const list = tasksByOwner.get(key)
    if (list) list.push(t)
    else tasksByOwner.set(key, [t])
  }
  for (const [key, list] of tasksByOwner) {
    if (!identities.has(key)) {
      identities.set(key, { name: (list[0].assignee ?? key).trim(), role: null, model: null, bot: null, crew: null })
    }
  }

  const rows: RosterRow[] = []
  for (const [key, id] of identities) {
    const owned = tasksByOwner.get(key) ?? []
    const live = owned.filter(t => workerState(t, now) === 'live')
    const counts = {
      live: live.length,
      tracked: owned.filter(t => isRunningStatus(t.status) && workerState(t, now) !== 'live').length,
      blocked: owned.filter(t => t.status === 'blocked').length,
      failed: owned.filter(t => t.status === 'failed').length,
      review: owned.filter(t => t.status === 'review').length,
      queued: owned.filter(t => laneFor(t.status) === 'up_next').length,
    }
    const needs = counts.blocked + counts.failed + counts.review

    const reported = id.bot?.gateway.status
    const gateway = reported && reported !== 'unknown'
      ? { status: reported, detail: id.bot!.gateway.detail }
      : null

    let state: RosterState
    if (live.length > 0) state = 'working'
    else if (gateway?.status === 'degraded') state = 'degraded'
    else if (needs > 0) state = 'attention'
    else if (gateway?.status === 'stopped' || id.crew?.status === 'offline') state = 'offline'
    else if (id.crew?.status === 'attention') state = 'attention'
    else state = 'idle'

    const bits: string[] = []
    if (live.length) bits.push(`${plural(live.length, 'live worker', 'live workers')}`)
    if (needs) bits.push(`${needs} waiting on you`)
    if (counts.tracked) bits.push(`${counts.tracked} marked running · no live worker`)
    if (counts.queued) bits.push(`${counts.queued} queued`)
    if (state === 'degraded' && gateway) bits.unshift(gateway.detail)
    const detail = bits.length ? bits.join(' · ') : 'No open tasks'

    rows.push({
      name: id.name,
      role: id.role,
      model: id.model,
      state,
      stateLabel: STATE_LABEL[state],
      detail,
      gateway,
      task: live[0] ?? null,
      counts,
      lastActiveAt: id.bot?.lastActiveAt ?? null,
    })
  }

  rows.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.name.localeCompare(b.name))

  const noPins = new Set<string>()
  return {
    rows,
    unowned: {
      count: unownedTasks.length,
      tasks: unownedTasks.sort((a, b) => taskSort(a, b, noPins)),
    },
  }
}
