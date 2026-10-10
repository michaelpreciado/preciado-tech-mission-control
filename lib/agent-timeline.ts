/**
 * Per-agent activity timeline for the Home sky.
 *
 * Every Hermes profile (~/.hermes/profiles/<agent>) keeps its own state.db whose
 * `messages.timestamp` is the real record of when that agent was working. We
 * cluster those timestamps into spans (a gap longer than SPAN_GAP_SEC starts a
 * new span) and clip them to the local day. Failure dots come from the kanban
 * `task_runs` table (crashed / failed / timed-out runs only — rate limits are
 * requeued, not failures). Nothing is invented: an agent with no messages today
 * is not drawn, and every source degrades to empty rather than throwing.
 */
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { getConfig } from './config'
import { logger } from './logger'

/** `n` is the number of messages inside the span (its density); absent on failure marks. */
export type SkySpan = { start: number; end: number; failed?: boolean; n?: number }
export type SkyRow = { agent: string; spans: SkySpan[] }
export type AgentTimeline = {
  generatedAt: string
  /** Local hour of day (0-24, fractional) at generation time. */
  nowHour: number
  rows: SkyRow[]
  /** Agents that exist on this machine but recorded nothing today. */
  idleAgents: string[]
  /** False when no profile store could be read at all (distinct from "everyone idle"). */
  available: boolean
}

/** Messages further apart than this belong to different spans. */
export const SPAN_GAP_SEC = 15 * 60
/** Floor for a span's visible length so a single message still shows as a tick. */
export const SPAN_MIN_SEC = 5 * 60
const FAILED_OUTCOMES = ['crashed', 'failed', 'timed_out', 'spawn_failed']

/** Cluster epoch-second timestamps into spans, keeping how many messages each span holds. */
export function clusterSpansCounted(timestamps: number[], gapSec = SPAN_GAP_SEC, minSec = SPAN_MIN_SEC): [number, number, number][] {
  const sorted = timestamps.filter(Number.isFinite).sort((a, b) => a - b)
  const out: [number, number, number][] = []
  for (const t of sorted) {
    const last = out[out.length - 1]
    if (last && t - last[1] <= gapSec) { last[1] = t; last[2]++ }
    else out.push([t, t, 1])
  }
  return out.map(([s, e, n]) => [s, Math.max(e, s + minSec), n])
}

/** Cluster ascending-or-not epoch-second timestamps into [startSec, endSec] spans. */
export function clusterSpans(timestamps: number[], gapSec = SPAN_GAP_SEC, minSec = SPAN_MIN_SEC): [number, number][] {
  return clusterSpansCounted(timestamps, gapSec, minSec).map(([s, e]) => [s, e])
}

/** Convert epoch-second spans to hours of the day beginning at dayStartSec, clipped to [0, rangeHours]. */
export function spansToHours(spans: ([number, number] | [number, number, number])[], dayStartSec: number, rangeHours = 24): SkySpan[] {
  const out: SkySpan[] = []
  for (const [s, e, n] of spans) {
    const start = Math.max(0, (s - dayStartSec) / 3600)
    const end = Math.min(rangeHours, (e - dayStartSec) / 3600)
    if (end > start) out.push(n === undefined ? { start, end } : { start, end, n })
  }
  return out
}

function hermesRoot(): string {
  return path.dirname(getConfig().paths.kanbanDbFile)
}

function openRO(file: string): DatabaseSync | null {
  try {
    return fs.existsSync(file) ? new DatabaseSync(file, { readOnly: true }) : null
  } catch (err) {
    logger.error('agent-timeline/open', err)
    return null
  }
}

function readMessageTimes(file: string, sinceSec: number): number[] {
  const db = openRO(file)
  if (!db) return []
  try {
    const rows = db.prepare('SELECT timestamp FROM messages WHERE timestamp >= ? ORDER BY timestamp LIMIT 100000').all(sinceSec) as { timestamp: number }[]
    return rows.map(r => r.timestamp)
  } catch (err) {
    logger.error('agent-timeline/messages', err)
    return []
  } finally {
    try { db.close() } catch { /* already closed */ }
  }
}

function readFailures(sinceSec: number): Map<string, number[]> {
  const out = new Map<string, number[]>()
  const db = openRO(getConfig().paths.kanbanDbFile)
  if (!db) return out
  try {
    const marks = FAILED_OUTCOMES.map(() => '?').join(',')
    const rows = db.prepare(
      `SELECT profile, COALESCE(ended_at, started_at) AS at FROM task_runs
       WHERE profile IS NOT NULL AND outcome IN (${marks}) AND COALESCE(ended_at, started_at) >= ?`,
    ).all(...FAILED_OUTCOMES, sinceSec) as { profile: string; at: number }[]
    for (const r of rows) {
      const at = r.at > 1e12 ? r.at / 1000 : r.at
      const arr = out.get(r.profile)
      if (arr) arr.push(at)
      else out.set(r.profile, [at])
    }
  } catch (err) {
    logger.error('agent-timeline/failures', err)
  } finally {
    try { db.close() } catch { /* already closed */ }
  }
  return out
}

export function collectAgentTimeline(now = Date.now()): AgentTimeline {
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const dayStartSec = dayStart.getTime() / 1000
  const nowHour = (now / 1000 - dayStartSec) / 3600

  const root = hermesRoot()
  const stores: { agent: string; file: string }[] = []
  try {
    for (const entry of fs.readdirSync(path.join(root, 'profiles'), { withFileTypes: true })) {
      if (entry.isDirectory()) stores.push({ agent: entry.name, file: path.join(root, 'profiles', entry.name, 'state.db') })
    }
  } catch { /* no profiles directory */ }
  stores.push({ agent: 'default', file: path.join(root, 'state.db') })
  const present = stores.filter(s => fs.existsSync(s.file))

  const failures = readFailures(dayStartSec)
  const rows: SkyRow[] = []
  const idleAgents: string[] = []
  for (const { agent, file } of present) {
    const spans = spansToHours(clusterSpansCounted(readMessageTimes(file, dayStartSec)), dayStartSec)
    const failed = (failures.get(agent) ?? [])
      .map(t => (t - dayStartSec) / 3600)
      .filter(h => h >= 0 && h <= 24)
      .map(h => ({ start: h, end: h, failed: true }))
    if (spans.length === 0 && failed.length === 0) idleAgents.push(agent)
    else rows.push({ agent, spans: [...spans, ...failed] })
  }
  const total = (r: SkyRow) => r.spans.reduce((n, s) => n + (s.failed ? 0 : s.end - s.start), 0)
  rows.sort((a, b) => total(b) - total(a) || a.agent.localeCompare(b.agent))
  return { generatedAt: new Date(now).toISOString(), nowHour, rows, idleAgents: idleAgents.sort(), available: present.length > 0 }
}
