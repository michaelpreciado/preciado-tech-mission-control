/**
 * Tasks come from the Hermes kanban board (~/.hermes/kanban.db) — the same
 * store `hermes kanban list` reads and the eventbus tails.
 *
 * This used to scrape `- [ ]` checkboxes out of every markdown file under the
 * vault and workspace, then guess an owner from keywords in the line. That
 * surfaced doc fragments and acceptance criteria as if they were live work, and
 * attributed them to agents that had never seen them. Only Hermes actually
 * creates tasks, so only Hermes is read here. An empty board renders an empty
 * board.
 */
import type { CrewId, MissionTask, TaskStatus } from '../types'
import { joinIf } from '../config'
import { getKanbanSnapshot } from '../hermes-kanban'
import { ROOTS, CREW } from './shared'

/** Hermes VALID_STATUSES (hermes_cli/kanban_db.py) → board columns. */
const STATUS_MAP: Record<string, TaskStatus> = {
  blocked: 'attention',
  review: 'attention',
  running: 'active',
  claimed: 'active',
  scheduled: 'scheduled',
  triage: 'backlog',
  todo: 'backlog',
  ready: 'backlog',
  done: 'done',
  archived: 'done',
}

const CREW_IDS = Object.keys(CREW) as CrewId[]

/** Match a Hermes assignee to a known crew member, or null if it's someone else. */
function crewIdFor(assignee?: string): CrewId | null {
  if (!assignee) return null
  const a = assignee.toLowerCase()
  return CREW_IDS.find(id => id === a || CREW[id].name.toLowerCase() === a) ?? null
}

/**
 * Directories the write-back route (/api/tasks/complete) may edit. Tasks are no
 * longer scraped from these files, but the route still ticks vault checkboxes
 * when called, and this keeps that confined to a known set of roots.
 */
export function taskScanRoots(): string[] {
  return [
    ROOTS.workspace, ROOTS.fridayWorkspace, ROOTS.fridayVault,
    joinIf(ROOTS.vault, '0200 Projects'),
    joinIf(ROOTS.vault, '0600 University'),
    joinIf(ROOTS.vault, '0500 3D Printing'),
  ].filter(Boolean)
}

export async function collectTasks(): Promise<MissionTask[]> {
  const snapshot = getKanbanSnapshot(undefined, 400)
  if (!snapshot.available) return []

  const tasks: MissionTask[] = snapshot.tasks.map(t => {
    // A task that keeps failing needs a human regardless of its column.
    const status = t.consecutiveFailures > 0
      ? 'attention'
      : STATUS_MAP[t.status] ?? 'backlog'
    const crewId = crewIdFor(t.assignee)
    return {
      id: t.id,
      title: t.title,
      status,
      // owner drives crew attribution; unmatched assignees sit with the
      // coordinator rather than being guessed onto a specialist.
      owner: crewId ?? 'friday',
      // ownerName always carries the truth, including for non-crew assignees.
      ownerName: crewId ? CREW[crewId].name : (t.assignee || 'unassigned'),
      // Every task shares one DB, so the file path would be noise on every card.
      // The board id is what you actually act on: `hermes kanban show <id>`.
      source: `hermes:${t.id}`,
      priority: t.priority > 0 ? 'high' : t.priority < 0 ? 'low' : 'normal',
      detail: t.lastFailureError || undefined,
    }
  })

  return tasks.sort((a, b) => {
    const rank: Record<TaskStatus, number> = { attention: 0, active: 1, scheduled: 2, backlog: 3, done: 4 }
    return rank[a.status] - rank[b.status] || a.title.localeCompare(b.title)
  })
}
