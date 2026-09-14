/**
 * System health collector — liveness of every service the cockpit depends on.
 * HTTP probes distinguish service health from mere reachability;
 * file checks read state the gateways already write.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { getConfig } from './config'
import { getCachedCollector } from './collector-cache'
import type { ServiceHealth, SystemHealthData } from './types'

const PROBE_TIMEOUT_MS = 1500

type TruthfulServiceHealth = Omit<ServiceHealth, 'status'> & {
  status: ServiceHealth['status'] | 'auth-fail' | 'degraded' | 'unavailable'
  statusCode?: number
}

type HttpProbe = { id: string; name: string; url: string; configError?: string }

function portOf(url: string): string {
  try { return new URL(url).port || '' } catch { return '' }
}

// Built per call so config edits (via /setup) apply without a restart.
function httpProbes(): HttpProbe[] {
  const services = getConfig().services
  let eventbusUrl = ''
  let eventbusConfigError: string | undefined
  try {
    eventbusUrl = new URL('/health', services.eventbusUrl).toString()
  } catch {
    eventbusConfigError = 'invalid event bus URL'
  }
  return [
    { id: 'openclaw-gateway', name: `OpenClaw gateway :${portOf(services.openclawGatewayUrl)}`, url: services.openclawGatewayUrl },
    { id: 'eventbus', name: `Event bus :${portOf(services.eventbusUrl)}`, url: eventbusUrl, configError: eventbusConfigError },
    { id: 'ollama', name: `Ollama :${portOf(services.ollamaUrl)}`, url: services.ollamaUrl },
    { id: 'llmster', name: `LLMster :${portOf(services.llmsterUrl)}`, url: services.llmsterUrl },
  ]
}

function freshnessFiles(): { id: string; name: string; file: string; staleAfterMin: number | null }[] {
  const paths = getConfig().paths
  return [
    { id: 'kanban-db', name: 'Kanban DB', file: paths.kanbanDbFile, staleAfterMin: null },
    // SYS-07: these stores are written by agents/cron; if they've gone quiet past
    // their recency threshold they must degrade to warn, not keep reporting "up".
    // Thresholds are overridable via env (minutes), defaulting to 7d for stores
    // that backend the web-dev pipeline / scheduler.
    { id: 'pipeline-store', name: 'Pipeline store', file: path.join(paths.pipelineDir, 'pipeline.json'), staleAfterMin: storeStaleMin('MC_PIPELINE_STALE_MIN', 7) },
    { id: 'cron-jobs', name: 'Cron jobs.json', file: paths.cronJobsFile, staleAfterMin: storeStaleMin('MC_CRON_STALE_MIN', 7) },
  ]
}

/** Parse a stale threshold env override (minutes), falling back to `days`. */
function storeStaleMin(envName: string, days: number): number | null {
  const raw = process.env[envName]
  if (raw !== undefined) {
    const n = Number(raw)
    if (!Number.isNaN(n) && n >= 0) return n
  }
  return days * 24 * 60
}

async function httpProbe(p: HttpProbe): Promise<TruthfulServiceHealth> {
  const started = Date.now()
  if (p.configError) return { id: p.id, name: p.name, status: 'degraded', detail: p.configError }
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS)
    const res = await fetch(p.url, { cache: 'no-store', signal: ctl.signal })
    clearTimeout(timer)
    const latencyMs = Date.now() - started
    const status = res.status >= 200 && res.status < 300
      ? 'up'
      : res.status === 401 || res.status === 403
        ? 'auth-fail'
        : 'degraded'
    return { id: p.id, name: p.name, status, statusCode: res.status, detail: `HTTP ${res.status} · ${latencyMs}ms`, latencyMs }
  } catch {
    return { id: p.id, name: p.name, status: 'down', detail: 'no response (connection refused or timeout)' }
  }
}

function ageMinutes(mtimeMs: number): number {
  return Math.round((Date.now() - mtimeMs) / 60_000)
}

function fmtAge(min: number): string {
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  if (min < 60 * 24) return `${Math.round(min / 60)}h ago`
  return `${Math.round(min / 1440)}d ago`
}

async function hermesGatewayHealth(): Promise<TruthfulServiceHealth> {
  const id = 'hermes-gateway'
  const name = 'Agent gateway'
  try {
    const state = JSON.parse(await fs.readFile(getConfig().paths.gatewayStateFile, 'utf8'))
    const pid = state?.pid
    let alive = false
    if (typeof pid === 'number') {
      try { await fs.access(`/proc/${pid}`); alive = true } catch { alive = false }
    }
    const gw = String(state?.gateway_state ?? 'unknown')
    const platforms = state?.platforms && typeof state.platforms === 'object'
      ? Object.entries(state.platforms).map(([k, v]) => `${k}:${(v as { state?: string })?.state ?? '?'}`)
      : []
    const detail = `pid ${pid ?? '?'} · ${gw}${platforms.length ? ' · ' + platforms.join(' ') : ''}`
    if (alive && gw === 'running') return { id, name, status: 'up', detail }
    if (alive) return { id, name, status: 'warn', detail }
    return { id, name, status: 'down', detail: `process ${pid ?? '?'} not running (state file says ${gw})` }
  } catch {
    return { id, name, status: 'down', detail: 'gateway_state.json missing/unreadable' }
  }
}

async function fileHealth(f: { id: string; name: string; file: string; staleAfterMin: number | null }): Promise<TruthfulServiceHealth> {
  try {
    // WAL-mode SQLite (e.g. kanban.db): writes land in -wal and only checkpoint
    // into the main .db later, so the main file's mtime can lag days behind
    // real activity. Judge freshness by the freshest of db/-wal/-shm.
    const primary = await fs.stat(f.file)
    const adjunctMtimes = await Promise.all([`${f.file}-wal`, `${f.file}-shm`].map(p => fs.stat(p).then(s => s.mtimeMs).catch(() => 0)))
    const st = { mtimeMs: Math.max(primary.mtimeMs, ...adjunctMtimes) }
    const min = ageMinutes(st.mtimeMs)
    const stale = f.staleAfterMin !== null && min > f.staleAfterMin
    return {
      id: f.id,
      name: f.name,
      status: stale ? 'warn' : 'up',
      detail: `updated ${fmtAge(min)}${stale ? ' · STALE' : ''}`,
    }
  } catch {
    return { id: f.id, name: f.name, status: 'unavailable', detail: 'missing' }
  }
}

async function collectSystemHealthFresh(): Promise<SystemHealthData> {
  const services = await Promise.all([
    hermesGatewayHealth(),
    ...httpProbes().map(httpProbe),
    ...freshnessFiles().map(fileHealth),
  ])
  return {
    generatedAt: new Date().toISOString(),
    services: services as unknown as ServiceHealth[],
    problems: services.filter(s => s.status !== 'up').length,
  }
}

export function collectSystemHealth(): Promise<SystemHealthData> {
  return getCachedCollector('system-health', collectSystemHealthFresh) as Promise<SystemHealthData>
}
