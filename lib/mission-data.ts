/**
 * Dashboard orchestrator. Every collector lives in ./collectors and is wrapped
 * in safeCollect() so a single failing source degrades to an empty panel rather
 * than blanking the whole board.
 */
import path from 'node:path'
import type { CostDashboard, GitHubActivity, KanbanActivity, MissionData, OperationsDashboard } from './types'
import { logger } from './logger'
import { getConfig } from './config'
import { ROOTS, rel, walk } from './collectors/shared'
import { collectTasks, taskScanRoots } from './collectors/tasks'
import { collectCron } from './collectors/cron'
import { collectKanbanActivity } from './collectors/kanban'
import { collectGithub } from './collectors/github'
import { collectProjects } from './collectors/projects'
import { collectMemory } from './collectors/memory'
import { collectCrew } from './collectors/crew'
import { collectCosts } from './collectors/costs'
import { collectOperations } from './collectors/operations'
import { getCalendarEvents, type CalendarResult } from './collectors/calendar'
import { integrations, collectIdeas, collectMissions, type IdeasResult, type MissionsResult } from './collectors/workspace'

export { taskScanRoots }

/** Wrap a collector so one failure doesn't take down the whole dashboard. */
async function safeCollect<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    logger.error('collector', err, { collector: name })
    return fallback
  }
}

export async function getMissionData(): Promise<MissionData> {
  const emptyGithub: GitHubActivity = { username: getConfig().github.username, weeks: [], repos: [], recentEvents: [], source: 'unavailable' }
  const emptyCosts: CostDashboard = { source: 'unavailable', totalRequests: 0, totalTokens: 0, totalBillableTokens: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCacheReadTokens: 0, totalCacheWriteTokens: 0, estimatedCostUsd: 0, models: [], openRouterModels: [], daily: [], warnings: ['Cost collection failed'] }
  const emptyOps: OperationsDashboard = { source: 'unavailable', recentFiles: [], inbox: [], hotspots: [] }
  const emptyCalendar: CalendarResult = { events: [], status: { configured: false, ok: false, syncedAt: null, detail: 'Calendar collection failed' } }
  const emptyIdeas: IdeasResult = { ideas: [], status: { path: rel(path.join(ROOTS.workspace, 'ideas.json')), exists: false } }
  const emptyMissions: MissionsResult = { missions: [], status: { path: null, updatedAt: null, stale: true } }
  const emptyKanban: KanbanActivity = { available: false, source: rel(ROOTS.kanbanDb), openTasks: 0, runningTasks: 0, lastEventAt: null, byAssignee: {} }

  const [tasks, cron, memory, integrationStates, github, costs, operations, calendarResult, ideasResult, missionsResult, kanban] = await Promise.all([
    safeCollect('tasks', collectTasks, []),
    safeCollect('cron', collectCron, []),
    safeCollect('memory', collectMemory, []),
    safeCollect('integrations', integrations, []),
    safeCollect('github', collectGithub, emptyGithub),
    safeCollect('costs', collectCosts, emptyCosts),
    safeCollect('operations', collectOperations, emptyOps),
    safeCollect('calendar', getCalendarEvents, emptyCalendar),
    safeCollect('ideas', collectIdeas, emptyIdeas),
    safeCollect('missions', collectMissions, emptyMissions),
    safeCollect('kanban', collectKanbanActivity, emptyKanban),
  ])
  const [projects, vaultFiles] = await Promise.all([collectProjects(tasks), walk(ROOTS.vault, { extensions: ['.md'], max: 1000, depth: 8 })])
  const warnings = integrationStates.filter(i => i.status === 'attention').map(i => `${i.name}: ${i.detail}`)
  // Tag every record with the producing agent so the frontend can attribute data.
  // OpenClaw is the default filesystem-based producer; Hermes records (cron,
  // kanban) are tagged hermes at the source.
  const aid = 'openclaw' as const
  const tagList = <T extends { agent_id?: import('./types').AgentId }>(arr: T[]): T[] =>
    arr.map(item => item.agent_id ? item : { ...item, agent_id: aid })
  const tagObj = <T extends { agent_id?: import('./types').AgentId }>(obj: T): T =>
    obj.agent_id ? obj : { ...obj, agent_id: aid }

  return {
    generatedAt: new Date().toISOString(),
    agent_id: aid,
    roots: Object.fromEntries(Object.entries(ROOTS).map(([k, v]) => [k, rel(v)])),
    counts: {
      tasks: tasks.length,
      openTasks: tasks.filter(t => t.status !== 'done').length,
      doneTasks: tasks.filter(t => t.status === 'done').length,
      cronJobs: cron.length,
      enabledCronJobs: cron.filter(c => c.enabled).length,
      projects: projects.length,
      memoryFiles: memory.length,
      vaultMarkdown: vaultFiles.length,
      calendarEvents: calendarResult.events.length,
    },
    // Tasks come from the Hermes kanban board, same producer as cron.
    tasks: tasks.map(t => ({ ...t, agent_id: 'hermes' as const })),
    cron: cron.map(c => ({ ...c, agent_id: 'hermes' as const })),
    projects: tagList(projects),
    crew: tagList(collectCrew(tasks, cron, kanban)),
    memory: tagList(memory),
    github: tagObj(github),
    costs: tagObj(costs),
    operations: tagObj(operations),
    integrations: tagList(integrationStates),
    calendar: tagList(calendarResult.events),
    ideas: tagList(ideasResult.ideas),
    missions: tagList(missionsResult.missions),
    kanban,
    sources: {
      calendar: calendarResult.status,
      ideas: ideasResult.status,
      missions: missionsResult.status,
      kanban: { available: kanban.available, source: kanban.source, lastEventAt: kanban.lastEventAt },
    },
    warnings,
  }
}
