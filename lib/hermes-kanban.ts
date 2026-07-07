/**
 * Read-only view of the Hermes kanban DB (~/.hermes/kanban.db) — the live
 * multi-agent task store the hermes-eventbus also tails. Uses node:sqlite
 * (readOnly, WAL-safe for concurrent readers) so the gateway is never
 * blocked. Never writes.
 */
import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { getConfig } from './config'
import { logger } from './logger'
import type { HermesKanbanSnapshot, HermesTask, HermesTaskDetail } from './types'

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
function rowToTask(r: any): HermesTask {
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
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function withDb<T>(fn: (db: DatabaseSync) => T): T | null {
  const file = dbPath()
  if (!file || !fs.existsSync(file)) return null
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(file, { readOnly: true })
    return fn(db)
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

export function getKanbanSnapshot(status?: string, limit = 100): HermesKanbanSnapshot {
  const result = withDb(db => {
    const counts: Record<string, number> = {}
    for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM tasks GROUP BY status').all() as { status: string; n: number }[]) {
      counts[row.status] = row.n
    }
    const rows = status
      ? db.prepare(`SELECT ${TASK_COLS} FROM tasks WHERE status = ? ORDER BY created_at DESC LIMIT ?`).all(status, limit)
      : db.prepare(`SELECT ${TASK_COLS} FROM tasks ORDER BY created_at DESC LIMIT ?`).all(limit)
    return { counts, tasks: rows.map(rowToTask) }
  })
  return {
    generatedAt: new Date().toISOString(),
    available: result !== null,
    counts: result?.counts ?? {},
    tasks: result?.tasks ?? [],
  }
}

export function getBlockedTasks(limit = 20): HermesTask[] {
  const result = withDb(db =>
    db.prepare(`SELECT ${TASK_COLS} FROM tasks
      WHERE status IN ('blocked', 'failed') OR consecutive_failures > 0
      ORDER BY created_at DESC LIMIT ?`).all(limit).map(rowToTask))
  return result ?? []
}

export function getTaskDetail(id: string): HermesTaskDetail | null {
  return withDb(db => {
    const row = db.prepare(`SELECT ${TASK_COLS}, body, workspace_path FROM tasks WHERE id = ?`).get(id) as Record<string, unknown> | undefined
    if (!row) return null
    const runs = db.prepare(`SELECT id, status, outcome, profile, step_key, started_at, ended_at, summary, error
      FROM task_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT 10`).all(id) as Record<string, unknown>[]
    const comments = db.prepare(`SELECT id, author, body, created_at
      FROM task_comments WHERE task_id = ? ORDER BY created_at DESC LIMIT 20`).all(id) as Record<string, unknown>[]
    const events = db.prepare(`SELECT id, run_id, kind, payload, created_at
      FROM task_events WHERE task_id = ? ORDER BY created_at DESC LIMIT 30`).all(id) as Record<string, unknown>[]
    return {
      ...rowToTask(row),
      body: (row.body as string) ?? undefined,
      workspacePath: (row.workspace_path as string) ?? undefined,
      runs: runs.map(r => ({
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
      comments: comments.map(c => ({
        id: c.id as number,
        author: String(c.author ?? '?'),
        body: String(c.body ?? ''),
        createdAt: toIso(c.created_at),
      })),
      events: events.map(e => ({
        id: e.id as number,
        runId: (e.run_id as number) ?? undefined,
        kind: String(e.kind ?? 'event'),
        payload: typeof e.payload === 'string' ? e.payload.slice(0, 400) : undefined,
        createdAt: toIso(e.created_at),
      })),
    }
  })
}
