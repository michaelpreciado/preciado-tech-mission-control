/**
 * Live agent activity for the office floor.
 *
 * The office used to render a hardcoded 7-agent roster whose status came from
 * ~/.hermes/kanban.db — a table that is empty on this machine, so nothing it
 * showed was real. Actual work happens as *sessions* in the agent's state store,
 * each tagged with the channel it arrived on (telegram, cli, desktop, cron, …).
 * This module reports those channels so a desk lights up only when that channel
 * genuinely has an agent working.
 *
 * Every source degrades to empty rather than throwing — a missing DB or a
 * sandboxed `who` must not take the dashboard down.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { getConfig } from './config'
import { logger } from './logger'
import type { AgentChannel, AgentActivity } from './types'
import { LIVE_WINDOW_MS, dominantKind, isLive } from './agent-work'

const execFileAsync = promisify(execFile)

/** Channels we draw a desk for, in floor order. Ids match sessions.source. */
const CHANNELS: { id: string; label: string }[] = [
  { id: 'telegram', label: 'Telegram' },
  { id: 'cli', label: 'Terminal' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'cron', label: 'Scheduler' },
  { id: 'subagent', label: 'Subagents' },
]

type SessionRow = { source: string; model: string | null; last_ts: number | null; msgs: number }

function readSessions(now: number): { rows: SessionRow[]; tools: Map<string, string[]> } {
  const file = getConfig().paths.agentStateDbFile
  if (!file) return { rows: [], tools: new Map() }
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(file, { readOnly: true })
    // ended_at IS NULL is NOT liveness — most open rows are abandoned sessions.
    // Liveness comes from the newest message timestamp per session.
    const rows = db.prepare(`
      SELECT s.source AS source, s.model AS model,
             MAX(m.timestamp) AS last_ts, COUNT(m.id) AS msgs
      FROM sessions s JOIN messages m ON m.session_id = s.id
      GROUP BY s.id
      HAVING last_ts IS NOT NULL
      ORDER BY last_ts DESC
      LIMIT 40
    `).all() as unknown as SessionRow[]

    const cutoff = (now - LIVE_WINDOW_MS) / 1000
    const toolRows = db.prepare(`
      SELECT s.source AS source, m.tool_name AS tool_name
      FROM messages m JOIN sessions s ON s.id = m.session_id
      WHERE m.tool_name IS NOT NULL AND m.timestamp >= ?
      ORDER BY m.timestamp DESC
      LIMIT 200
    `).all(cutoff) as unknown as { source: string; tool_name: string }[]

    const tools = new Map<string, string[]>()
    for (const r of toolRows) {
      const arr = tools.get(r.source)
      if (arr) arr.push(r.tool_name)
      else tools.set(r.source, [r.tool_name])
    }
    return { rows, tools }
  } catch (err) {
    logger.error('agent-activity/sessions', err)
    return { rows: [], tools: new Map() }
  } finally {
    try { db?.close() } catch { /* already closed */ }
  }
}

/** Interactive login sessions (`who`), so an SSH terminal shows as occupied. */
async function readTerminals(): Promise<{ user: string; tty: string; from: string }[]> {
  try {
    const { stdout } = await execFileAsync('who', [], { timeout: 3000 })
    return stdout.split('\n').filter(Boolean).map(l => {
      const parts = l.trim().split(/\s+/)
      const from = l.match(/\(([^)]+)\)\s*$/)?.[1] ?? 'local'
      return { user: parts[0] ?? '?', tty: parts[1] ?? '?', from }
    })
  } catch {
    return []
  }
}

/** Gateway + platform state (telegram connected, etc). */
async function readGateway(): Promise<{ running: boolean; platforms: Record<string, string> }> {
  try {
    const raw = await fs.readFile(getConfig().paths.gatewayStateFile, 'utf8')
    const s = JSON.parse(raw) as { gateway_state?: string; platforms?: Record<string, { state?: string }> }
    const platforms: Record<string, string> = {}
    for (const [k, v] of Object.entries(s.platforms ?? {})) platforms[k] = String(v?.state ?? '?')
    return { running: s.gateway_state === 'running', platforms }
  } catch {
    return { running: false, platforms: {} }
  }
}

export async function collectAgentActivity(now = Date.now()): Promise<AgentActivity> {
  const [{ rows, tools }, terminals, gateway] = await Promise.all([
    Promise.resolve(readSessions(now)),
    readTerminals(),
    readGateway(),
  ])

  const bySource = new Map<string, SessionRow[]>()
  for (const r of rows) {
    const arr = bySource.get(r.source)
    if (arr) arr.push(r)
    else bySource.set(r.source, [r])
  }

  const channels: AgentChannel[] = CHANNELS.map(({ id, label }) => {
    const sessions = bySource.get(id) ?? []
    const live = sessions.filter(s => isLive(s.last_ts, now))
    const newest = sessions[0]
    const connected = id === 'telegram'
      ? gateway.platforms.telegram === 'connected'
      : id === 'cli'
        ? terminals.length > 0
        : undefined
    return {
      id,
      label,
      live: live.length > 0,
      kind: live.length ? dominantKind(tools.get(id) ?? []) : 'idle',
      sessionCount: live.length,
      lastActivityAt: newest?.last_ts ? new Date(newest.last_ts * 1000).toISOString() : null,
      model: live[0]?.model ?? null,
      connected,
    }
  })

  return {
    generatedAt: new Date(now).toISOString(),
    channels,
    terminals: terminals.map(t => ({ tty: t.tty, from: t.from })),
    gatewayRunning: gateway.running,
  }
}

export { LIVE_WINDOW_MS, workKindForTool, dominantKind, isLive } from './agent-work'
