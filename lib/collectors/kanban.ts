import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { KanbanActivity } from '../types'
import { logger } from '../logger'
import { ROOTS, exists, rel } from './shared'

const execFileAsync = promisify(execFile)

/** Live multi-agent task state from the Hermes kanban DB (read-only via sqlite3 CLI). */
export async function collectKanbanActivity(): Promise<KanbanActivity> {
  const empty: KanbanActivity = { available: false, source: rel(ROOTS.kanbanDb), openTasks: 0, runningTasks: 0, lastEventAt: null, byAssignee: {} }
  if (!(await exists(ROOTS.kanbanDb))) return empty
  const query = async <T>(sql: string): Promise<T[]> => {
    const { stdout } = await execFileAsync('sqlite3', ['-readonly', '-json', ROOTS.kanbanDb, sql], { timeout: 5000 })
    return stdout.trim() ? JSON.parse(stdout) as T[] : []
  }
  try {
    type TaskRow = { assignee: string | null; status: string; n: number; last_ts: number | null }
    type EventRow = { kind: string; assignee: string | null; created_at: number }
    const [taskRows, eventRows] = await Promise.all([
      query<TaskRow>("SELECT assignee, status, COUNT(*) AS n, MAX(COALESCE(last_heartbeat_at, started_at, created_at)) AS last_ts FROM tasks GROUP BY assignee, status"),
      query<EventRow>("SELECT e.kind, t.assignee, e.created_at FROM task_events e LEFT JOIN tasks t ON t.id = e.task_id ORDER BY e.id DESC LIMIT 100"),
    ])
    const byAssignee: KanbanActivity['byAssignee'] = {}
    const touch = (who: string | null) => {
      const key = (who || 'unassigned').toLowerCase()
      return byAssignee[key] ?? (byAssignee[key] = { open: 0, running: 0, failed: 0, lastEventAt: null })
    }
    let openTasks = 0
    let runningTasks = 0
    for (const row of taskRows) {
      const slot = touch(row.assignee)
      const done = ['done', 'completed', 'closed'].includes(row.status)
      if (!done) { slot.open += row.n; openTasks += row.n }
      if (['running', 'in_progress', 'claimed'].includes(row.status)) { slot.running += row.n; runningTasks += row.n }
      if (row.last_ts) {
        const iso = new Date(row.last_ts * 1000).toISOString()
        if (!slot.lastEventAt || iso > slot.lastEventAt) slot.lastEventAt = iso
      }
    }
    let lastEventAt: string | null = null
    for (const ev of eventRows) {
      const iso = new Date(ev.created_at * 1000).toISOString()
      if (!lastEventAt || iso > lastEventAt) lastEventAt = iso
      const slot = touch(ev.assignee)
      if (!slot.lastEventAt || iso > slot.lastEventAt) slot.lastEventAt = iso
      if (['blocked', 'timed_out', 'crashed', 'gave_up', 'protocol_violation'].includes(ev.kind)) slot.failed += 1
    }
    return { available: true, source: rel(ROOTS.kanbanDb), openTasks, runningTasks, lastEventAt, byAssignee }
  } catch (err) {
    logger.error('kanban', err)
    return empty
  }
}
