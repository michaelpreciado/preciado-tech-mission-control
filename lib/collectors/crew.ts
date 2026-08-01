import type { CrewId, CrewMember, KanbanActivity, MissionCron, MissionTask } from '../types'
import { CREW } from './shared'

export function collectCrew(tasks: MissionTask[], cron: MissionCron[], kanban: KanbanActivity): CrewMember[] {
  const FRESH_MS = 1000 * 60 * 90
  return (Object.keys(CREW) as CrewId[]).map(id => {
    const memberTasks = tasks.filter(t => t.owner === id && t.status !== 'done')
    const memberCron = cron.filter(c => c.owner === id)
    const kb = kanban.byAssignee[id]
    const last = memberCron.map(c => c.lastRunAt).filter(Boolean).sort().at(-1)
    const next = memberCron.map(c => c.nextRunAt).filter(Boolean).sort().at(0)

    // Live kanban state is the strongest signal: a running task means the agent
    // is actually doing something right now, not merely scheduled to.
    if (kb && kb.lastEventAt && Date.now() - Date.parse(kb.lastEventAt) < FRESH_MS) {
      const status: CrewMember['status'] = kb.failed > 0 ? 'attention' : kb.running > 0 ? 'active' : 'standby'
      return {
        ...CREW[id],
        status,
        lastRun: kb.lastEventAt,
        nextRun: next,
        signal: `kanban: ${kb.running} running · ${kb.open} open${kb.failed ? ` · ${kb.failed} failed` : ''}`,
      }
    }

    // Attention should mean a real runtime/scheduler problem, not just a queued task that contains words like "fix" or "risk".
    const attention = memberCron.some(c => c.enabled && c.lastRunStatus === 'error')
    // Visual "active" should mean the agent actually ran recently, not merely that it owns an active-looking task.
    const active = memberCron.some(c => c.lastRunAt && Date.now() - Date.parse(c.lastRunAt) < FRESH_MS)
    const status: CrewMember['status'] = attention ? 'attention' : active ? 'active' : memberCron.length ? 'standby' : memberTasks.length ? 'on-demand' : 'sleeping'
    return {
      ...CREW[id],
      status,
      lastRun: last,
      nextRun: next,
      signal: `${memberTasks.length} open tasks · ${memberCron.length} scheduled systems`,
    }
  })
}
