import type { AgentHeartbeat } from './types'
import fs from 'node:fs'
import path from 'node:path'
import { CADENCE } from './pt/contract'

const TTL_MS = CADENCE.crew.heartbeatTtlMs
const PERSIST_INTERVAL_MS = 10 * 1000
const HEARTBEATS_FILE = path.join(process.cwd(), 'data', 'heartbeats.json')

const store = new Map<string, AgentHeartbeat>()
const lastPersistAt = new Map<string, number>()
const pendingPersist = new Map<string, ReturnType<typeof setTimeout>>()

function isHeartbeat(value: unknown): value is AgentHeartbeat {
  if (!value || typeof value !== 'object') return false
  const hb = value as Record<string, unknown>
  return typeof hb.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(hb.id)
    && (hb.status === 'working' || hb.status === 'idle' || hb.status === 'error')
    && typeof hb.receivedAt === 'number'
    && (hb.currentTask === undefined || typeof hb.currentTask === 'string')
    && (hb.idea === undefined || (!!hb.idea && typeof hb.idea === 'object' && typeof (hb.idea as Record<string, unknown>).title === 'string'))
}

function loadHeartbeats(): void {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(HEARTBEATS_FILE, 'utf8'))
    if (!Array.isArray(parsed)) return
    for (const value of parsed) {
      if (isHeartbeat(value)) store.set(value.id, value)
    }
  } catch {
    // The file is generated at runtime and may not exist on first boot.
  }
}

function persistHeartbeats(): void {
  const tmpFile = `${HEARTBEATS_FILE}.${process.pid}.tmp`
  try {
    fs.mkdirSync(path.dirname(HEARTBEATS_FILE), { recursive: true })
    fs.writeFileSync(tmpFile, JSON.stringify([...store.values()], null, 2) + '\n', { mode: 0o600 })
    fs.renameSync(tmpFile, HEARTBEATS_FILE)
  } catch (error) {
    try { fs.unlinkSync(tmpFile) } catch { /* best effort cleanup */ }
    console.error('[heartbeats] failed to persist heartbeat state', error)
  }
}

function persistWithRateLimit(id: string, now: number): void {
  const last = lastPersistAt.get(id) ?? 0
  const remaining = PERSIST_INTERVAL_MS - (now - last)
  if (remaining <= 0) {
    lastPersistAt.set(id, now)
    persistHeartbeats()
    return
  }

  if (pendingPersist.has(id)) return
  const timer = setTimeout(() => {
    pendingPersist.delete(id)
    const latest = store.get(id)
    if (!latest) return
    lastPersistAt.set(id, Date.now())
    persistHeartbeats()
  }, remaining)
  timer.unref?.()
  pendingPersist.set(id, timer)
}

loadHeartbeats()

export function recordHeartbeat(id: string, status: AgentHeartbeat['status'], currentTask?: string, idea?: AgentHeartbeat['idea']) {
  const now = Date.now()
  store.set(id, { id, status, currentTask, idea, receivedAt: now })
  persistWithRateLimit(id, now)
}

export function getHeartbeats(): AgentHeartbeat[] {
  const now = Date.now()
  // Legacy fresh-only API. Never erase dated observations during a read.
  return [...store.values()].filter(hb => now >= hb.receivedAt && now - hb.receivedAt <= TTL_MS)
}

export function getHeartbeat(id: string): AgentHeartbeat | undefined {
  const hb = store.get(id)
  if (!hb) return undefined
  if (Date.now() < hb.receivedAt || Date.now() - hb.receivedAt > TTL_MS) return undefined
  return hb
}

/** Read-only inventory for crew: expired and future reports remain visible.
 * Read the file each time so another process's report is visible. No persistence,
 * pruning, credentials, or inferred presence; only an explicit field allowlist. */
export function readHeartbeatObservations(file = HEARTBEATS_FILE): {
  read: 'success' | 'missing' | 'error'; observations: AgentHeartbeat[]; invalidRecords: number
} {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!Array.isArray(raw)) return { read: 'error', observations: [], invalidRecords: 0 }
    const observations = raw.filter(isHeartbeat).map(hb => ({ id: hb.id, status: hb.status, receivedAt: hb.receivedAt, currentTask: hb.currentTask }))
    return { read: 'success', observations, invalidRecords: raw.length - observations.length }
  } catch (error) {
    return { read: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'error', observations: [], invalidRecords: 0 }
  }
}
