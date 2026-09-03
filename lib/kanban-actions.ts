/**
 * Write actions against the Hermes kanban board(s), routed through the
 * `hermes kanban` CLI so the SQLite DB stays the single source of truth and
 * the dispatcher/claim machinery is never bypassed.
 *
 * Actions target a task by its ORIGIN: local tasks run on this machine, remote
 * tasks run over SSH on the host that owns the board (`hermes kanban …` there).
 * Every action shells out synchronously (short timeout) and returns a
 * {ok, result|error} shape for the API route to turn into JSON.
 */
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { getConfig } from './config'
import { logger } from './logger'
import type { FridayKanbanRemote } from './config'

export type ActionOutcome =
  | { ok: true; result: string }
  | { ok: false; error: string }

function expandHome(p: string): string {
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p
}

/** Find the remote config whose board owns `origin`; null = local board. */
function remoteFor(origin?: string): FridayKanbanRemote | null {
  if (!origin) return null
  const localHost = os.hostname() || 'local'
  if (origin === localHost) return null
  return getConfig().kanbanRemotes.find(r => r.name === origin) ?? null
}

/** Build the argv + exec context for a `hermes kanban …` invocation. */
function build(args: string[], origin?: string): { argv: string[]; opts: object } {
  const remote = remoteFor(origin)
  if (!remote) {
    return { argv: ['hermes', 'kanban', ...args], opts: { timeout: 15000, stdio: 'pipe' } }
  }
  const keyFile = expandHome(remote.keyFile ?? '~/.ssh/id_ed25519')
  const remoteCmd = ['hermes', 'kanban', ...args].map(a => `'${String(a).replace(/'/g, `'\\''`)}'`).join(' ')
  // Batch = true so auth prompts never hang the dashboard; key must already be authorized.
  return {
    argv: ['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ConnectTimeout=6', '-i', keyFile,
      `${remote.user}@${remote.host}`, remoteCmd],
    opts: { timeout: 15000, stdio: 'pipe' },
  }
}

function run(args: string[], origin?: string): ActionOutcome {
  const { argv, opts } = build(args, origin)
  try {
    const out = execFileSync(argv[0], argv.slice(1), opts as object).toString().trim()
    return { ok: true, result: out || '(done)' }
  } catch (err) {
    const e = err as { stderr?: Buffer; stdout?: Buffer; message: string }
    const detail = (e.stderr ? e.stderr.toString() : '') || (e.stdout ? e.stdout.toString() : '') || e.message
    logger.warn('kanban-action', detail)
    return { ok: false, error: detail.trim().slice(0, 500) }
  }
}

export function completeTask(id: string, result?: string, origin?: string): ActionOutcome {
  const args = ['complete', id]
  if (result) args.push('--result', result)
  return run(args, origin)
}

export function commentTask(id: string, body: string, author: string, origin?: string): ActionOutcome {
  if (!body || !body.trim()) return { ok: false, error: 'comment body is empty' }
  const args = ['comment', ...(author ? ['--author', author] : []), id, body]
  return run(args, origin)
}

export function unblockTask(id: string, reason?: string, origin?: string): ActionOutcome {
  const args = ['unblock', ...(reason ? ['--reason', reason] : []), id]
  return run(args, origin)
}

/** Send a task in `review` back to ready/todo so it can be claimed again. */
export function reopenReviewTask(id: string, reason?: string, origin?: string): ActionOutcome {
  const args = ['reopen-review', ...(reason ? ['--reason', reason] : []), id]
  return run(args, origin)
}

/** Atomically claim a ready task with a TTL (seconds). Never touches SQLite directly. */
export function claimTask(id: string, ttlSeconds = 1800, origin?: string): ActionOutcome {
  const ttl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? Math.floor(ttlSeconds) : 1800
  return run(['claim', id, '--ttl', String(ttl)], origin)
}

/** Release an active worker claim (used to undo a claim when a dispatch fails to start). */
export function reclaimTask(id: string, reason?: string, origin?: string): ActionOutcome {
  const args = ['reclaim', ...(reason ? ['--reason', reason] : []), id]
  return run(args, origin)
}

export function createTask(
  title: string,
  opts: { body?: string; assignee?: string; priority?: string; workspace?: string; origin?: string },
): ActionOutcome {
  if (!title || !title.trim()) return { ok: false, error: 'title is required' }
  const args = ['create', ...(opts.body ? ['--body', opts.body] : []), ...(opts.assignee ? ['--assignee', opts.assignee] : [])]
  if (opts.priority) args.push('--priority', opts.priority)
  if (opts.workspace) args.push('--workspace', opts.workspace)
  args.push('--json', title)
  const res = run(args, opts.origin)
  if (!res.ok) return res
  // --json prints the created task; extract the id if present.
  try {
    const parsed = JSON.parse(res.result)
    return { ok: true, result: parsed.id ?? res.result }
  } catch {
    return res
  }
}
