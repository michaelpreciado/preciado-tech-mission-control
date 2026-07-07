import type { AgentHeartbeat } from './types'

const TTL_MS = 5 * 60 * 1000 // 5 minutes

const store = new Map<string, AgentHeartbeat>()

export function recordHeartbeat(id: string, status: AgentHeartbeat['status'], currentTask?: string, idea?: AgentHeartbeat['idea']) {
  store.set(id, { id, status, currentTask, idea, receivedAt: Date.now() })
}

export function getHeartbeats(): AgentHeartbeat[] {
  const now = Date.now()
  // Evict expired entries
  for (const [key, hb] of store) {
    if (now - hb.receivedAt > TTL_MS) store.delete(key)
  }
  return [...store.values()]
}

export function getHeartbeat(id: string): AgentHeartbeat | undefined {
  const hb = store.get(id)
  if (!hb) return undefined
  if (Date.now() - hb.receivedAt > TTL_MS) {
    store.delete(id)
    return undefined
  }
  return hb
}
