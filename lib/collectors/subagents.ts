/**
 * Sub-agent dispatch mesh for the Team tab.
 *
 * Combines every real source of sub-agent telemetry into one deck:
 *   - The dispatch TREE harvested from the Hermes session store
 *     (sessions.parent_session_id) — a genuine parent→child sub-agent graph.
 *   - The crew/mesh ROSTER (Hermes + crew + edge nodes) from the shared CREW
 *     table and the mission mesh.
 *   - Liveness from: kanban task state (assigned running/open/failed cards,
 *     with real titles so the UI can link to the actual board), agent session
 *     messages, gateway state, and the OpenClaw gateway probe.
 *
 * Nothing is simulated. A node with no live signal reports `offline` / stales
 * rather than masquerading as present. Every source degrades to empty.
 */
import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import { getConfig } from '../config'
import { logger } from '../logger'
import { CREW } from './shared'
import { getHeartbeats } from '../heartbeats'
import { isLive } from '../agent-work'
import type { SubAgentDeck, SubAgentNode, SubAgentStatus, SubAgentTask } from '../types'

const execFileAsync = promisify(execFile)

/* ── The mesh: root orchestrator + edge nodes + crew ── */
const MESH_BASE: Record<string, { node: string; role: string; model: string; accent: string; parent?: string | null }> = {
  hermes: { node: 'arch-desktop', role: 'Orchestrator', model: 'router', accent: '#1e90ff', parent: null },
  jarvis: { node: 'arch-desktop', role: 'Business partner', model: 'deepseek-v4-flash', accent: '#db2777', parent: 'hermes' },
  openclaw: { node: 'openclaw', role: 'SO-101 gateway', model: 'openclaw', accent: '#22d3ee', parent: 'hermes' },
  edith: { node: 'macbook', role: 'Sentinel', model: 'edith', accent: '#7c3aed', parent: 'hermes' },
}

// Add the crew roster at mesh level (they are dedicated sub-agents too).
for (const [id, c] of Object.entries(CREW)) {
  MESH_BASE[id] = { node: 'arch-desktop', role: c.role, model: c.model ?? '', accent: c.accent, parent: 'hermes' }
}

type SessionRow = { id: string; source: string; model: string | null; title: string | null; parent_session_id: string | null; started_at: number | null; last_ts: number | null }

function readSessions(now: number): SessionRow[] {
  const file = getConfig().paths.agentStateDbFile
  if (!file) return []
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(file, { readOnly: true })
    return db.prepare(`
      SELECT s.id, s.source, s.model, s.title, s.parent_session_id, s.started_at,
             MAX(m.timestamp) AS last_ts
      FROM sessions s LEFT JOIN messages m ON m.session_id = s.id
      WHERE s.started_at > ?
      GROUP BY s.id
      ORDER BY s.started_at DESC
      LIMIT 60
    `).all((now - 7 * 24 * 60 * 60 * 1000) / 1000) as unknown as SessionRow[]
  } catch (err) {
    logger.error('subagents/sessions', err)
    return []
  } finally {
    try { db?.close() } catch { /* closed */ }
  }
}

async function readKanbanTasks(): Promise<{ byAssignee: Record<string, { tasks: SubAgentTask[]; failed: number }> }> {
  const dbPath = getConfig().paths.kanbanDbFile
  const empty = { byAssignee: {} }
  if (!dbPath) return empty
  try {
    const query = async <T>(sql: string): Promise<T[]> => {
      const { stdout } = await execFileAsync('sqlite3', ['-readonly', '-json', dbPath, sql], { timeout: 5000 })
      return stdout.trim() ? JSON.parse(stdout) as T[] : []
    }
    type TaskRow = { id: string; title: string; status: string; assignee: string | null }
    type FailedRow = { assignee: string | null; n: number }
    const [taskRows, failedRows] = await Promise.all([
      query<TaskRow>("SELECT id, title, status, assignee FROM tasks WHERE status NOT IN ('done','completed','closed','archived') ORDER BY COALESCE(started_at, created_at) DESC LIMIT 60"),
      query<FailedRow>("SELECT t.assignee, COUNT(*) AS n FROM task_events e LEFT JOIN tasks t ON t.id = e.task_id WHERE e.kind IN ('blocked','timed_out','crashed','gave_up','protocol_violation') GROUP BY t.assignee"),
    ])
    const byAssignee: Record<string, { tasks: SubAgentTask[]; failed: number }> = {}
    const touch = (who: string | null) => {
      const key = (who || '').toLowerCase()
      return byAssignee[key] ?? (byAssignee[key] = { tasks: [], failed: 0 })
    }
    for (const t of taskRows) touch(t.assignee).tasks.push({ id: t.id, title: t.title, status: t.status, origin: 'kanban' })
    for (const f of failedRows) touch(f.assignee).failed += f.n
    return { byAssignee }
  } catch (err) {
    logger.error('subagents/kanban', err)
    return empty
  }
}

async function readGateway(): Promise<boolean> {
  const file = getConfig().paths.gatewayStateFile
  if (!file) return false
  try {
    const raw = await fs.readFile(file, 'utf8')
    return JSON.parse(raw)?.gateway_state === 'running'
  } catch {
    return false
  }
}

async function probeOpenclaw(): Promise<boolean> {
  const url = getConfig().services.openclawGatewayUrl
  if (!url) return false
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(2500) })
    return res.ok
  } catch {
    return false
  }
}

function deriveStatus(args: {
  tasks: SubAgentTask[]
  failed: number
  live: boolean
  connected?: boolean
}): { status: SubAgentStatus; detail?: string } {
  const { tasks, failed, live, connected } = args
  const running = tasks.filter(t => ['running', 'in_progress', 'claimed'].includes(t.status)).length
  const open = tasks.filter(t => !['running', 'in_progress', 'claimed'].includes(t.status)).length
  // Active work wins over historical failures: an agent with a task in flight
  // because of old failures is working, not errored. 'errored' is the state
  // for an agent that ISN'T doing anything and has unresolved failures.
  if (live || running > 0) return { status: 'working', detail: running > 0 ? `${running} running task${running === 1 ? '' : 's'}` : 'live session' }
  if (failed > 0) return { status: 'errored', detail: `${failed} failed task${failed === 1 ? '' : 's'}` }
  if (open > 0) return { status: 'waiting', detail: `${open} open task${open === 1 ? '' : 's'}` }
  if (connected) return { status: 'idle', detail: 'node reachable' }
  return { status: 'offline', detail: undefined }
}

export async function collectSubAgentDeck(now = Date.now()): Promise<SubAgentDeck> {
  const [rows, kanban, hbs, gateway, openclawUp] = await Promise.all([
    Promise.resolve(readSessions(now)),
    readKanbanTasks(),
    Promise.resolve(getHeartbeats()),
    readGateway(),
    probeOpenclaw(),
  ])

  /* ── 1. Dispatch tree from the real session store ── */
  const byId = new Map<string, SessionRow>()
  for (const r of rows) byId.set(r.id, r)
  const tree: SubAgentNode[] = rows
    .filter(r => r.last_ts && isLive(r.last_ts, now))
    .slice(0, 12)
    .map(r => {
      const parent = r.parent_session_id && byId.has(r.parent_session_id) ? r.parent_session_id : null
      return {
        id: r.id,
        name: r.title || r.model || shortId(r.id),
        role: parent ? 'sub-session' : 'root session',
        status: (parent ? 'working' : 'idle') as SubAgentStatus,
        node: r.source === 'desktop' || r.source === 'cli' ? 'arch-desktop' : r.source,
        model: r.model ?? undefined,
        startedAt: r.started_at ? new Date(r.started_at * 1000).toISOString() : undefined,
        lastSeen: r.last_ts ? new Date(r.last_ts * 1000).toISOString() : undefined,
        parent,
        accent: '#22d3ee',
      }
    })

  /* ── 2. Build the mesh roster with live status ── */
  const hbById = new Map(hbs.map(h => [h.id, h]))
  const mesh: SubAgentNode[] = (Object.keys(MESH_BASE) as string[]).map(id => {
    const base = MESH_BASE[id]
    const kb = kanban.byAssignee[id] ?? kanban.byAssignee[id.toLowerCase()] ?? { tasks: [], failed: 0 }
    const hb = hbById.get(id) ?? hbById.get(base.node)

    // Liveness. Only the orchestrator (Hermes) is marked 'live' from shared
    // session activity on this box — it's the one driving those cli/desktop/
    // kanban sessions. Crew & edge nodes get 'working' only from their own
    // per-agent signal (a running kanban card or a heartbeat), never from
    // somebody else's session, otherwise the whole roster reads 'working'.
    const onArch = base.node === 'arch-desktop'
    const live = id === 'hermes' && onArch && rows.some(r => r.last_ts && isLive(r.last_ts, now) && (r.source === 'desktop' || r.source === 'cli' || r.source === 'kanban'))
    const connected = id === 'openclaw' ? openclawUp : undefined
    // EDITH (MacBook) gets connected=undefined: we don't probe it here, so it
    // degrades honestly to 'offline' when it has no live signal — which is the
    // correct read for an asleep peer node, distinct from an agent error.

    const { status, detail } = deriveStatus({ tasks: kb.tasks, failed: kb.failed, live, connected })

    const ev: SubAgentNode['events'] = []
    if (hb) ev.push({ ts: new Date(hb.receivedAt).toISOString(), kind: 'heartbeat', detail: `${hb.status}${hb.currentTask ? ' · ' + hb.currentTask : ''}` })
    if (kb.failed > 0) ev.push({ ts: new Date(now).toISOString(), kind: 'kanban-failed', detail: detail })

    return {
      id,
      name: id === 'hermes' ? 'HERMES' : id.toUpperCase(),
      role: base.role,
      status,
      node: base.node,
      model: base.model,
      currentTask: kb.tasks[0] ?? undefined,
      lastSeen: hb ? new Date(hb.receivedAt).toISOString() : undefined,
      parent: base.parent ?? null,
      events: ev,
      connected,
      accent: base.accent,
    }
  })

  // Root first, then the crew in roster order, then edge nodes.
  const crewIds = Object.keys(CREW)
  const order = ['hermes', 'jarvis', ...crewIds, 'openclaw', 'edith']
  const byIdMap = new Map(mesh.map(m => [m.id, m]))
  const finalMesh = order.map(id => byIdMap.get(id)).filter((m): m is SubAgentNode => !!m)
  const rest = mesh.filter(m => !order.includes(m.id))
  for (const r of rest) finalMesh.push(r)

  const lastActivity = finalMesh
    .map(m => m.lastSeen)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null

  return {
    generatedAt: new Date(now).toISOString(),
    tree,
    mesh: finalMesh,
    gatewayRunning: gateway,
    openclawUp,
    lastActivityAt: lastActivity,
    warnings: openclawUp ? [] : ['OpenClaw gateway unreachable'],
  }
}

function shortId(id: string): string {
  return id.length > 24 ? id.slice(0, 22) + '…' : id
}
