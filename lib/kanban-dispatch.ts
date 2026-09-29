/**
 * "Dispatch Claude Code" — start a headless Claude Code worker on one Hermes
 * kanban task, inside that task's own isolated workspace.
 *
 * Safety model:
 *   - Only pending statuses (todo/ready/blocked/failed/review) can be dispatched.
 *   - blocked/failed/review are first returned to a claimable state through the
 *     Hermes CLI, then the task is claimed atomically via `hermes kanban claim`.
 *     We never write the kanban SQLite DB directly.
 *   - Remote-origin tasks are rejected — this machine cannot safely run Claude
 *     in a workspace that lives on another host.
 *   - The cwd is the task's DB-recorded workspace, validated to be an absolute
 *     path under the local Hermes kanban workspaces root. Nothing about the
 *     command or cwd comes from the HTTP request body.
 *   - Claude is spawned detached; stdout/stderr go to a mode-0600 log file.
 *   - The prompt contains no secrets and instructs Claude not to touch any.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { getConfig } from './config'
import { logger } from './logger'
import { claimTask, reclaimTask, reopenReviewTask, unblockTask } from './kanban-actions'
import type { HermesTaskDetail } from './types'

/** The mise shim hangs on this host, so target the resolved binary directly. */
export const DIRECT_CLAUDE_BIN =
  '/home/mp/.local/share/mise/installs/claude/2.1.241/claude'

/** Resolve once so dispatches do not shell out to mise for every task. */
const MISE_CLAUDE_BIN = (() => {
  try {
    const resolved = execFileSync('mise', ['which', 'claude'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return resolved && path.isAbsolute(resolved) ? resolved : null
  } catch {
    return null
  }
})()

/** Pending statuses a task may be in for a dispatch to be allowed. */
export const DISPATCHABLE_STATUSES = new Set(['todo', 'ready', 'blocked', 'failed', 'review'])

const TASK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

export type DispatchResult =
  | { ok: true; pid: number; logPath: string }
  | { ok: false; error: string }

export function isValidTaskId(id: unknown): id is string {
  return typeof id === 'string' && TASK_ID_RE.test(id)
}

/** Local iff the task carries no origin or its origin is this host's name. */
export function isLocalOrigin(origin: string | undefined, localHost: string): boolean {
  return !origin || origin === localHost
}

/**
 * Absolute roots a dispatch workspace is allowed to live under: the local
 * Hermes kanban workspaces dir, plus any colon-separated override roots.
 */
export function kanbanWorkspaceRoots(home: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const roots = [path.join(home, '.hermes', 'kanban', 'workspaces')]
  const extra = env.FRIDAY_KANBAN_WORKSPACE_ROOT || env.MC_KANBAN_WORKSPACE_ROOT
  if (extra) {
    for (const part of extra.split(':')) {
      const t = part.trim()
      if (t) roots.push(t)
    }
  }
  return roots
}

/**
 * Return the normalized workspace path iff it is an absolute, control-char-free
 * path strictly inside one of `roots` (a sibling that merely shares a prefix,
 * or a root itself, is rejected). Otherwise null.
 */
export function validateWorkspace(workspacePath: string | undefined, roots: string[]): string | null {
  if (!workspacePath || typeof workspacePath !== 'string') return null
  if (/[\x00-\x1f]/.test(workspacePath)) return null
  if (!path.isAbsolute(workspacePath)) return null
  const norm = path.normalize(workspacePath).replace(/[/\\]+$/, '')
  for (const r of roots) {
    if (!r || !path.isAbsolute(r)) continue
    const root = path.normalize(r).replace(/[/\\]+$/, '')
    if (norm === root) continue
    if (norm.startsWith(root + path.sep)) return norm
  }
  return null
}

function newestMiseClaudeBin(home: string, exists: (p: string) => boolean): string | null {
  const installRoot = path.join(home, '.local', 'share', 'mise', 'installs', 'claude')
  try {
    const versions = fs.readdirSync(installRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    for (const version of versions) {
      const candidate = path.join(installRoot, version, 'claude')
      if (exists(candidate)) return candidate
    }
  } catch {
    // Fall through to the fixed last-resort path below.
  }
  return null
}

/** Explicit override → cached mise resolution → newest mise install → PATH. */
export function resolveClaudeBin(
  env: NodeJS.ProcessEnv = process.env,
  exists: (p: string) => boolean = fs.existsSync,
): string {
  // CLAUDE_CODE_BIN is the worker's established override; retain the MC_ name
  // as a project-specific alias for existing deployments.
  const override = (env.CLAUDE_CODE_BIN || env.MC_CLAUDE_BIN)?.trim()
  if (override) return override
  if (MISE_CLAUDE_BIN && exists(MISE_CLAUDE_BIN)) return MISE_CLAUDE_BIN
  const newest = newestMiseClaudeBin(env.HOME?.trim() || os.homedir(), exists)
  if (newest) return newest
  if (exists(DIRECT_CLAUDE_BIN)) return DIRECT_CLAUDE_BIN
  return 'claude'
}

/** Fixed headless argv (everything but the binary). Prompt is passed as one arg. */
export function buildClaudeArgs(prompt: string): string[] {
  return [
    '-p', prompt,
    '--model', 'sonnet',
    '--allowedTools', 'Read,Edit,Write,Bash',
    '--max-turns', '30',
    '--dangerously-skip-permissions',
  ]
}

/** Self-contained task brief for the worker. Contains no secrets. */
export function buildClaudePrompt(t: { id: string; title: string; body?: string; workspacePath: string }): string {
  const brief = t.body && t.body.trim() ? t.body.trim() : '(no additional brief provided)'
  return [
    'You are a headless Claude Code worker dispatched from Mission Control to complete exactly one Hermes kanban task.',
    '',
    `Task id: ${t.id}`,
    `Title: ${t.title}`,
    `Workspace (your current working directory): ${t.workspacePath}`,
    '',
    'Brief:',
    brief,
    '',
    'Instructions:',
    '- Implement ONLY this task. Do not take on unrelated work, refactors, or cleanup.',
    '- Stay inside this workspace and preserve any unrelated changes already present in it.',
    '- Do not read, print, move, or modify secrets, credentials, .env files, tokens, or key material.',
    '- Run the verification relevant to your change (build / tests / typecheck as appropriate) and confirm it passes.',
    '- When the work is genuinely complete and verified, mark the task done:',
    `    hermes kanban complete ${t.id} --result "<concise summary of what changed and how you verified it>"`,
    `- If you cannot finish, run: hermes kanban comment ${t.id} "<what remains and why>" and do NOT mark it done.`,
  ].join('\n')
}

/** Safe, collision-resistant log filename for a dispatch run. */
export function logFileName(id: string, now: Date = new Date()): string {
  const safeId = id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64) || 'task'
  const ts = now.toISOString().replace(/[:.]/g, '-')
  return `dispatch-${safeId}-${ts}.log`
}

/** Best-effort release of a claim we made but then failed to hand to a worker. */
function releaseClaim(id: string, origin?: string): void {
  try {
    const r = reclaimTask(id, 'dispatch-claude: worker failed to start', origin)
    if (!r.ok) logger.warn('kanban-dispatch', `reclaim after failed dispatch did not succeed for ${id}: ${r.error}`)
  } catch (err) {
    logger.warn('kanban-dispatch', `reclaim after failed dispatch threw for ${id}: ${(err as Error).message}`)
  }
}

/**
 * Claim `id` and launch a detached Claude Code worker in its workspace.
 * Returns immediately with the worker pid + log path, or an error without
 * leaving a task stuck in a misleading claimed/running state.
 */
export async function dispatchClaude(
  id: string,
  detail: HermesTaskDetail | null,
  origin?: string,
): Promise<DispatchResult> {
  if (!isValidTaskId(id)) return { ok: false, error: 'invalid task id' }
  if (!detail) return { ok: false, error: 'task not found' }

  const status = String(detail.status ?? '')
  if (!DISPATCHABLE_STATUSES.has(status)) {
    return { ok: false, error: `task status '${status || 'unknown'}' cannot be dispatched` }
  }

  const localHost = os.hostname() || 'local'
  if (!isLocalOrigin(origin ?? detail.origin, localHost)) {
    return { ok: false, error: 'remote-origin tasks cannot run Claude Code from this machine' }
  }

  const home = getConfig().homeDir
  const workspace = validateWorkspace(detail.workspacePath, kanbanWorkspaceRoots(home))
  if (!workspace) {
    return { ok: false, error: 'task workspace is not an absolute path under the local Hermes kanban workspaces root' }
  }
  try {
    if (!fs.statSync(workspace).isDirectory()) return { ok: false, error: 'task workspace does not exist' }
  } catch {
    return { ok: false, error: 'task workspace does not exist' }
  }

  // 1. Return blocked/failed/review tasks to a claimable state first.
  if (status === 'blocked' || status === 'failed') {
    const pre = unblockTask(id, 'dispatch-claude: returning to ready for a Claude Code worker', origin)
    if (!pre.ok) return { ok: false, error: `could not unblock task: ${pre.error}` }
  } else if (status === 'review') {
    const pre = reopenReviewTask(id, 'dispatch-claude: reopening for a Claude Code worker', origin)
    if (!pre.ok) return { ok: false, error: `could not reopen review: ${pre.error}` }
  }

  // 2. Claim atomically through the Hermes board lifecycle.
  const claim = claimTask(id, 1800, origin)
  if (!claim.ok) return { ok: false, error: `could not claim task: ${claim.error}` }

  // 3. Open the 0600 dispatch log.
  const logDir = path.join(home, '.hermes', 'kanban', 'logs')
  let logPath: string
  let fd: number
  try {
    fs.mkdirSync(logDir, { recursive: true })
    logPath = path.join(logDir, logFileName(id))
    fd = fs.openSync(logPath, 'a', 0o600)
    try { fs.chmodSync(logPath, 0o600) } catch { /* best effort on odd filesystems */ }
  } catch (err) {
    releaseClaim(id, origin)
    return { ok: false, error: `could not open dispatch log: ${(err as Error).message}` }
  }

  const bin = resolveClaudeBin()
  const args = buildClaudeArgs(buildClaudePrompt({
    id, title: detail.title, body: detail.body, workspacePath: workspace,
  }))

  try {
    fs.writeSync(fd, `# dispatch-claude ${id} @ ${new Date().toISOString()}\n# bin ${bin}\n# cwd ${workspace}\n\n`)
  } catch { /* header is non-essential */ }

  // 4. Spawn detached; hand both stdout and stderr to the log fd.
  let child
  try {
    child = spawn(bin, args, { cwd: workspace, detached: true, stdio: ['ignore', fd, fd], env: process.env })
  } catch (err) {
    try { fs.closeSync(fd) } catch { /* ignore */ }
    releaseClaim(id, origin)
    return { ok: false, error: `could not start Claude Code: ${(err as Error).message}` }
  }

  // Catch an immediate spawn failure (e.g. ENOENT) before we report success.
  const spawnErr = await new Promise<Error | null>(resolve => {
    let settled = false
    child.once('error', e => { if (!settled) { settled = true; resolve(e as Error) } })
    setTimeout(() => { if (!settled) { settled = true; resolve(null) } }, 300)
  })

  try { fs.closeSync(fd) } catch { /* child holds its own dup */ }

  if (spawnErr) {
    releaseClaim(id, origin)
    return { ok: false, error: `Claude Code failed to start: ${spawnErr.message}` }
  }

  const pid = child.pid ?? 0
  child.unref()
  logger.info('kanban-dispatch', `claude dispatched task=${id} pid=${pid} log=${logPath}`)
  return { ok: true, pid, logPath }
}
