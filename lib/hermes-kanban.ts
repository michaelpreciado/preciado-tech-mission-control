/**
 * Multi-source view of the Hermes kanban DB(s) — the live multi-agent task
 * store. Reads the LOCAL board (~/.hermes/kanban.db) directly with node:sqlite
 * (readOnly, WAL-safe for concurrent readers), plus any REMOTE Hermes boards
 * (e.g. the MacBook's own kanban.db) pulled read-only over SSH and cached.
 * Never writes to the DBs — task actions go through the `hermes kanban` CLI
 * (see lib/kanban-actions.ts), keeping the DB the single source of truth.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { getConfig } from './config'
import { logger } from './logger'
import { isRemoteCacheFresh } from './kanban-ttl'
import type {
  HermesKanbanSnapshot,
  HermesTask,
  HermesTaskDetail,
  HermesTaskRun,
  HermesTaskComment,
  HermesTaskEvent,
} from './types'
import type { FridayKanbanRemote } from './config'

// Resolved per call so config edits (via /setup) apply without a restart.
function dbPath(): string {
  return getConfig().paths.kanbanDbFile
}

// Epoch columns are INTEGER; tolerate seconds or milliseconds.
function toIso(epoch: unknown): string | undefined {
  if (typeof epoch !== 'number' || !Number.isFinite(epoch) || epoch <= 0) return undefined
  const ms = epoch > 1e12 ? epoch : epoch * 1000
  return new Date(ms).toISOString()
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToTask(r: any, origin?: string, parentIds?: string[]): HermesTask {
  return {
    id: String(r.id),
    title: r.title ?? '(untitled)',
    status: r.status ?? 'unknown',
    assignee: r.assignee ?? undefined,
    priority: typeof r.priority === 'number' ? r.priority : 0,
    createdBy: r.created_by ?? undefined,
    createdAt: toIso(r.created_at),
    startedAt: toIso(r.started_at),
    completedAt: toIso(r.completed_at),
    consecutiveFailures: typeof r.consecutive_failures === 'number' ? r.consecutive_failures : 0,
    lastFailureError: r.last_failure_error ?? undefined,
    lastHeartbeatAt: toIso(r.last_heartbeat_at),
    currentRunId: typeof r.current_run_id === 'number' ? r.current_run_id : undefined,
    sessionId: r.session_id ?? undefined,
    origin,
    parentIds: parentIds && parentIds.length > 0 ? parentIds : undefined,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function withDbFile<T>(file: string, fn: (db: DatabaseSync) => T): T | null {
  if (!file || !fs.existsSync(file)) return null
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(file, { readOnly: true })
    return db ? fn(db) : null
  } catch (err) {
    logger.error('hermes-kanban', err)
    return null
  } finally {
    try { db?.close() } catch { /* already closed */ }
  }
}

const TASK_COLS = `id, title, assignee, status, priority, created_by, created_at,
  started_at, completed_at, consecutive_failures, last_failure_error,
  last_heartbeat_at, current_run_id, session_id`

interface DbRead {
  counts: Record<string, number>
  tasks: HermesTask[]
  available: boolean
}

/** Read one task's full detail (runs/comments/events) from an OPEN connection. */
function readDetailFromDb(db: DatabaseSync, id: string, origin?: string): HermesTaskDetail | null {
  const row = db.prepare(`SELECT ${TASK_COLS}, body, workspace_path FROM tasks WHERE id = ?`).get(id) as Record<string, unknown> | undefined
  if (!row) return null
  const runs = db.prepare(`SELECT id, status, outcome, profile, step_key, started_at, ended_at, summary, error
    FROM task_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT 10`).all(id) as Record<string, unknown>[]
  const comments = db.prepare(`SELECT id, author, body, created_at
    FROM task_comments WHERE task_id = ? ORDER BY created_at DESC LIMIT 20`).all(id) as Record<string, unknown>[]
  const events = db.prepare(`SELECT id, run_id, kind, payload, created_at
    FROM task_events WHERE task_id = ? ORDER BY created_at DESC LIMIT 30`).all(id) as Record<string, unknown>[]
  return {
    ...rowToTask(row, origin),
    body: (row.body as string) ?? undefined,
    workspacePath: (row.workspace_path as string) ?? undefined,
    runs: runs.map((r): HermesTaskRun => ({
      id: r.id as number,
      status: String(r.status ?? 'unknown'),
      outcome: (r.outcome as string) ?? undefined,
      profile: (r.profile as string) ?? undefined,
      stepKey: (r.step_key as string) ?? undefined,
      startedAt: toIso(r.started_at),
      endedAt: toIso(r.ended_at),
      summary: (r.summary as string) ?? undefined,
      error: (r.error as string) ?? undefined,
    })),
    comments: comments.map((c): HermesTaskComment => ({
      id: c.id as number,
      author: String(c.author ?? '?'),
      body: String(c.body ?? ''),
      createdAt: toIso(c.created_at),
    })),
    events: events.map((e): HermesTaskEvent => ({
      id: e.id as number,
      runId: (e.run_id as number) ?? undefined,
      kind: String(e.kind ?? 'event'),
      payload: typeof e.payload === 'string' ? e.payload.slice(0, 400) : undefined,
      createdAt: toIso(e.created_at),
    })),
  }
}

function readBoard(file: string, origin?: string): DbRead {
  const result = withDbFile(file, db => {
    const counts: Record<string, number> = {}
    for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM tasks GROUP BY status').all() as { status: string; n: number }[]) {
      counts[row.status] = row.n
    }
    // Parent dependencies: task_links(parent_id, child_id) → map of child id → parent ids.
    const parentMap = new Map<string, string[]>()
    for (const link of db.prepare('SELECT parent_id, child_id FROM task_links').all() as { parent_id: string; child_id: string }[]) {
      const arr = parentMap.get(link.child_id) ?? []
      arr.push(link.parent_id)
      parentMap.set(link.child_id, arr)
    }
    const rows = db.prepare(`SELECT ${TASK_COLS} FROM tasks ORDER BY created_at DESC LIMIT 500`).all() as any[]
    return { counts, tasks: rows.map(r => rowToTask(r, origin, parentMap.get(String(r.id)))), available: true }
  })
  return result ?? { counts: {}, tasks: [], available: false }
}

/* ── Remote (SSH) pull with TTL cache ─────────────────────────────── */

interface CachedRemote {
  read: DbRead
  fetchedAt: number
}

const remoteCache = new Map<string, CachedRemote>()

function expandHome(p: string): string {
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p
}

/**
 * Pull a remote Hermes kanban.db over SSH to a temp file, open it read-only,
 * then delete the temp file. Uses a synchronous scp (short timeout + cache) so
 * the dashboard API stays sync like the local reader. A remote that sleeps or
 * fails to auth yields available:false rather than throwing — the board simply
 * shows as offline.
 */
function fetchRemote(remote: FridayKanbanRemote): DbRead {
  const now = Date.now()
  const hit = remoteCache.get(remote.name)
  if (hit && isRemoteCacheFresh(hit.fetchedAt, now, remote.cacheMs)) return hit.read

  // Remote path keeps its literal '~' so the REMOTE shell expands it (scp
  // otherwise treats /home/mp/... as a literal remote path that doesn't exist).
  const remotePath = remote.dbPath ?? '~/.hermes/kanban.db'
  const keyFile = expandHome(remote.keyFile ?? '~/.ssh/id_ed25519')
  const tmp = path.join(os.tmpdir(), `mc-kanban-${remote.name}-${crypto.randomBytes(4).toString('hex')}.db`)
  const target = `${remote.user}@${remote.host}:${remotePath}`

  let read: DbRead
  try {
    execFileSync(
      'scp',
      ['-q', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=6', '-i', keyFile, target, tmp],
      { timeout: remote.timeoutMs ?? 8000, stdio: 'pipe' },
    )
    read = fs.existsSync(tmp) ? readBoard(tmp, remote.name) : { counts: {}, tasks: [], available: false }
    read.available = read.available && fs.existsSync(tmp)
    try { fs.unlinkSync(tmp) } catch { /* best effort */ }
  } catch (err) {
    logger.warn('hermes-kanban-remote', `${remote.name}: scp failed — ${(err as Error).message}`)
    read = { counts: {}, tasks: [], available: false }
  }

  remoteCache.set(remote.name, { read, fetchedAt: now })
  return read
}

/* ── Public API ───────────────────────────────────────────────────── */

export type KanbanSourceStatus = {
  name: string
  origin: string
  available: boolean
  counts: Record<string, number>
}

export type KanbanMultiSnapshot = HermesKanbanSnapshot & {
  sources: KanbanSourceStatus[]
  tasks: HermesTask[]
}

export function getKanbanSnapshot(status?: string, limit = 100): KanbanMultiSnapshot {
  const localHost = os.hostname() || 'local'
  const local = readBoard(dbPath(), localHost)
  const remotes = getConfig().kanbanRemotes.map(fetchRemote)

  // Tag the local board with the local hostname; remote tasks keep their name.
  const all = [...local.tasks, ...remotes.flatMap(r => r.tasks)]
    .filter((t, i, arr) => arr.findIndex(x => x.id === t.id && x.origin === t.origin) === i) // de-dup
    .slice(0, limit ?? 100)

  const counts: Record<string, number> = { ...local.counts }
  for (const r of remotes) {
    for (const [k, v] of Object.entries(r.counts)) counts[k] = (counts[k] ?? 0) + v
  }

  const sources: KanbanSourceStatus[] = [
    { name: localHost, origin: localHost, available: local.available, counts: local.counts },
    ...getConfig().kanbanRemotes.map((r, i) => ({
      name: r.name,
      origin: r.name,
      available: remotes[i].available,
      counts: remotes[i].counts,
    })),
  ]

  return {
    generatedAt: new Date().toISOString(),
    available: local.available,
    counts,
    tasks: status ? all.filter(t => t.status === status) : all,
    sources,
  }
}

export function getBlockedTasks(limit = 20): HermesTask[] {
  const localHost = os.hostname() || 'local'
  const all = getKanbanSnapshot(undefined, 500).tasks
    .filter(t => t.status === 'blocked' || t.status === 'failed' || t.consecutiveFailures > 0)
    .slice(0, limit)
  return all.map(t => ({ ...t, origin: t.origin ?? localHost }))
}

export function getTaskDetail(id: string): HermesTaskDetail | null {
  // Local first (most common), then remotes. Each lookup opens its own
  // read-only connection (the snapshot closure's DB is already closed).
  const localHost = os.hostname() || 'local'
  const localDet = withDbFile(dbPath(), db => readDetailFromDb(db, id, localHost))
  if (localDet) return localDet
  for (const remote of getConfig().kanbanRemotes) {
    const det = fetchRemoteDetail(remote, id)
    if (det) return det
  }
  return null
}

/** Pull a remote board fresh and read one task's detail from the temp copy. */
function fetchRemoteDetail(remote: FridayKanbanRemote, id: string): HermesTaskDetail | null {
  // Remote path keeps its literal '~' so the REMOTE shell expands it.
  const remotePath = remote.dbPath ?? '~/.hermes/kanban.db'
  const keyFile = expandHome(remote.keyFile ?? '~/.ssh/id_ed25519')
  const tmp = path.join(os.tmpdir(), `mc-kanban-detail-${remote.name}-${crypto.randomBytes(4).toString('hex')}.db`)
  const target = `${remote.user}@${remote.host}:${remotePath}`
  try {
    execFileSync(
      'scp',
      ['-q', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=6', '-i', keyFile, target, tmp],
      { timeout: remote.timeoutMs ?? 8000, stdio: 'pipe' },
    )
    const det = withDbFile(tmp, db => readDetailFromDb(db, id, remote.name))
    try { fs.unlinkSync(tmp) } catch { /* best effort */ }
    return det
  } catch {
    return null
  }
}
