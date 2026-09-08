import os from 'node:os'
import fs from 'node:fs'
import { herdr, HerdrError, validateSpawn } from './herdr-bridge'
import { DISPATCHABLE_STATUSES, isValidTaskId, isLocalOrigin, validateWorkspace, kanbanWorkspaceRoots } from './kanban-dispatch'
import { claimTask, commentTask, reclaimTask, unblockTask, reopenReviewTask } from './kanban-actions'
import { getConfig } from './config'
import type { HermesTaskDetail } from './types'

const defaults = { herdr, claimTask, commentTask, reclaimTask, unblockTask, reopenReviewTask }
export function createHerdrDispatcher(deps = defaults) {
 const pending = new Set<string>()
 return async function dispatchAgent(id: string, detail: HermesTaskDetail | null, input: Record<string, unknown>) {
  if (!isValidTaskId(id) || !detail) throw new HerdrError('Task not found', 404)
  if (pending.has(id)) throw new HerdrError('This task is already being dispatched', 409)
  if (!DISPATCHABLE_STATUSES.has(detail.status)) throw new HerdrError('Task is not dispatchable in its current status', 409)
  if (!isLocalOrigin(detail.origin, os.hostname())) throw new HerdrError('Remote tasks cannot start agents on this machine', 400)
  // The DB-recorded workspace is authoritative. Do not allow HTTP callers to redirect a task.
  const roots = kanbanWorkspaceRoots(getConfig().homeDir)
  let cwd = validateWorkspace(detail.workspacePath, roots)
  try {
    if (!cwd) throw new Error()
    cwd = fs.realpathSync(cwd)
    const canonicalRoots = roots.map(root => { try { return fs.realpathSync(root) } catch { return root } })
    if (!validateWorkspace(cwd, canonicalRoots) || !fs.statSync(cwd).isDirectory()) throw new Error()
  } catch { throw new HerdrError('Task needs an existing workspace under an allowed kanban workspace root', 400) }
  if (input.workdir !== undefined && input.workdir !== cwd) throw new HerdrError('Use the task’s recorded workspace', 400)
  const spawn = validateSpawn({ kind: input.kind, model: input.model, cwd, name: `task-${id}`.slice(0, 80), prompt: [
    'You are an interactive worker dispatched from Mission Control for one Hermes kanban task.',
    `Task: ${id}`, `Title: ${detail.title}`, `Workspace: ${cwd}`, '', detail.body || '(No additional brief)', '',
    'Implement only this task; preserve unrelated changes and follow workspace instructions.',
    'Do not read or expose credentials or secrets. Verify the requested result.',
    `When verified complete, run: hermes kanban complete ${id} --result "<summary and verification>"`,
    `If blocked, leave a comment with: hermes kanban comment ${id} "<reason>"`,
  ].join('\n') })
  if (!(await deps.herdr.snapshot()).available) throw new HerdrError('Herdr is unavailable; task was not claimed')
  pending.add(id)
  let claimed = false
  try {
    if (detail.status === 'blocked' || detail.status === 'failed') {
      const r = deps.unblockTask(id, 'dispatch-agent: preparing interactive worker', detail.origin)
      if (!r.ok) throw new HerdrError('Could not unblock task', 409)
    } else if (detail.status === 'review') {
      const r = deps.reopenReviewTask(id, 'dispatch-agent: preparing interactive worker', detail.origin)
      if (!r.ok) throw new HerdrError('Could not reopen task', 409)
    }
    const claim = deps.claimTask(id, 1800, detail.origin)
    if (!claim.ok) throw new HerdrError('Could not claim task; another worker may own it', 409)
    claimed = true
    const result = await deps.herdr.spawn(spawn)
    const linked = deps.commentTask(id, `Herdr ${spawn.kind} agent ${result.name}; pane ${result.target}. Open /kanban?agent=${encodeURIComponent(result.target)} to inspect this run.${result.warning ? ` ${result.warning}` : ''}`, 'mission-control', detail.origin)
    return { ...result, warning: [result.warning, linked.ok ? '' : 'Agent started, but the task link comment could not be saved.'].filter(Boolean).join(' ') || undefined }
  } catch (e) {
    if (claimed) {
      if (e instanceof HerdrError && e.target) {
        deps.commentTask(id, `Herdr startup uncertain in pane ${e.target}. Inspect /kanban?agent=${encodeURIComponent(e.target)} before retrying. Claim retained to prevent duplicate work.`, 'mission-control', detail.origin)
      } else {
        deps.reclaimTask(id, 'dispatch-agent failed before confirmed agent startup', detail.origin)
      }
    }
    throw e
  } finally { pending.delete(id) }
 }
}
export const dispatchAgent = createHerdrDispatcher()
