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
import os from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { getConfig } from './config'
import { logger } from './logger'
import type { AgentChannel, AgentActivity } from './types'
import { LIVE_WINDOW_MS, dominantKind, isLive } from './agent-work'
import { getCachedCollector } from './collector-cache'

const execFileAsync = promisify(execFile)

/** Channels we draw a desk for, in floor order. Ids match sessions.source. */
const CHANNELS: { id: string; label: string }[] = [
  { id: 'telegram', label: 'Telegram' },
  { id: 'cli', label: 'Terminal' },
  { id: 'codex', label: 'Codex' },
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

type CodexActivity = {
  live: number
  model: string | null
  cwd: string | null
  lastActivityAt: string | null
  sessions: number
}

/** Codex CLI rollout files (`~/.codex/sessions`) are the liveness source. */
async function readCodex(now: number): Promise<CodexActivity> {
  const empty: CodexActivity = { live: 0, model: null, cwd: null, lastActivityAt: null, sessions: 0 }
  try {
    const root = `${os.homedir()}/.codex/sessions`
    const cutoff = now - 60 * 60 * 1000
    const files: { path: string; mtimeMs: number }[] = []

    async function walk(dir: string): Promise<void> {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`
        if (entry.isDirectory()) await walk(path)
        else if (entry.isFile()) {
          const stat = await fs.stat(path)
          if (stat.mtimeMs >= cutoff) files.push({ path, mtimeMs: stat.mtimeMs })
        }
      }
    }

    await walk(root)
    files.sort((a, b) => b.mtimeMs - a.mtimeMs)
    const sessions = files.slice(0, 100)
    const liveFiles = sessions.filter(file => isLive(file.mtimeMs, now))
    let model: string | null = null
    let cwd: string | null = null
    if (liveFiles[0]) {
      const fd = await fs.open(liveFiles[0].path, 'r')
      try {
        const chunks: Buffer[] = []
        let size = 0
        while (size < 128 * 1024) {
          const chunk = Buffer.alloc(4096)
          const { bytesRead } = await fd.read(chunk, 0, chunk.length, null)
          if (!bytesRead) break
          const newline = chunk.subarray(0, bytesRead).indexOf(10)
          const part = newline >= 0 ? chunk.subarray(0, newline) : chunk.subarray(0, bytesRead)
          chunks.push(part)
          size += part.length
          if (newline >= 0) break
        }
        const firstLine = Buffer.concat(chunks).toString('utf8')
      const meta = JSON.parse(firstLine) as {
        payload?: {
          model?: unknown
          cwd?: unknown
          base_instructions?: { provenance?: { model?: unknown } }
        }
      }
      const payload = meta.payload
      const provenanceModel = payload?.base_instructions?.provenance?.model
      model = typeof provenanceModel === 'string'
        ? provenanceModel
        : typeof payload?.model === 'string' ? payload.model : 'codex'
      cwd = typeof payload?.cwd === 'string' ? payload.cwd : null
      } finally {
        await fd.close()
      }
    }
    return {
      live: liveFiles.length,
      model,
      cwd,
      lastActivityAt: sessions[0] ? new Date(sessions[0].mtimeMs).toISOString() : null,
      sessions: sessions.length,
    }
  } catch {
    return empty
  }
}

async function collectAgentActivityFresh(now = Date.now()): Promise<AgentActivity> {
  const [{ rows, tools }, terminals, gateway, codex] = await Promise.all([
    Promise.resolve(readSessions(now)),
    readTerminals(),
    readGateway(),
    readCodex(now),
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
        : id === 'codex'
          ? codex.sessions > 0
        : undefined
    const codexChannel = id === 'codex'
    return {
      id,
      label,
      live: codexChannel ? codex.live > 0 : live.length > 0,
      kind: codexChannel ? (codex.live > 0 ? 'building' : 'idle') : (live.length ? dominantKind(tools.get(id) ?? []) : 'idle'),
      sessionCount: codexChannel ? codex.live : live.length,
      lastActivityAt: codexChannel ? codex.lastActivityAt : newest?.last_ts ? new Date(newest.last_ts * 1000).toISOString() : null,
      model: codexChannel ? codex.model : live[0]?.model ?? null,
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

export function collectAgentActivity(now = Date.now()): Promise<AgentActivity> {
  return getCachedCollector('agent-activity', () => collectAgentActivityFresh(now))
}

export { LIVE_WINDOW_MS, workKindForTool, dominantKind, isLive } from './agent-work'
