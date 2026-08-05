/**
 * Live sub-agent telemetry hook for the Team tab.
 *
 * Subscribes to the same-origin SSE stream (/api/events, which proxies the
 * hermes-eventbus sidecar) and keeps a normalized dispatch tree:
 *
 *   Hermes (root) → sub-agents (children) → tasks (leaves)
 *
 * Design rules (per the panel brief):
 *  - Stream, not poll: EventSource, no setInterval fetch loop.
 *  - Reconcile on reconnect: state is merged, never cleared — no flash.
 *  - Explicit stream status; stale data is marked, never styled as live.
 *  - Retained event history is capped so a phone tab left open overnight
 *    doesn't balloon.
 *  - Status derivation is real: kanban task status + heartbeat age. Nothing
 *    is fabricated.
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AgentNode,
  AgentState,
  BusEvent,
  StreamStatus,
  TelemetrySnapshot,
  TelemetryTask,
} from './telemetry-types'

/** 3× the observed ~60s kanban heartbeat = the staleness threshold. */
export const HEARTBEAT_STALE_MS = 180_000
/** Offline = no signal for 5× the heartbeat interval. */
export const HEARTBEAT_OFFLINE_MS = 300_000
/** Per-agent retained event cap; also a global cap. */
export const MAX_EVENTS_PER_AGENT = 40
export const MAX_EVENTS_TOTAL = 400
/** How often we re-derive stale/offline from last-seen timestamps. */
const STALENESS_TICK_MS = 15_000

/** Fails (blocked/gave_up/crashed/timed_out/protocol_violation) → errored. */
const FAILED_KINDS = new Set(['blocked', 'gave_up', 'crashed', 'timed_out', 'protocol_violation'])
/** Working (running/spawned/claimed/heartbeat/progress) → working. */
const WORKING_KINDS = new Set(['running', 'spawned', 'claimed', 'heartbeat', 'promoted'])

export type RosterAgent = {
  id: string
  name: string
  role: string
  host: string
  accent: string
}

export const MESH_ROSTER: RosterAgent[] = [
  { id: 'hermes', name: 'HERMES', role: 'Orchestrator · pub/sub', host: 'friday-linux', accent: '#1e90ff' },
  { id: 'jarvis', name: 'JARVIS', role: 'Business partner · Linux', host: 'friday-linux', accent: '#0891b2' },
  { id: 'friday', name: 'FRIDAY', role: 'Desktop commander', host: 'friday-linux', accent: '#7c3aed' },
  { id: 'edith', name: 'EDITH', role: 'Sentinel · MacBook', host: 'friday-macbook', accent: '#65a30d' },
  { id: 'openclaw', name: 'OPENCLAW', role: 'SO-101 arm gateway :18789', host: 'friday-linux', accent: '#c2410c' },
  { id: 'echo', name: 'ECHO', role: 'Memory steward', host: 'friday-linux', accent: '#0d9488' },
  { id: 'sage', name: 'SAGE', role: 'Research', host: 'friday-linux', accent: '#db2777' },
  { id: 'forge', name: 'FORGE', role: 'Builder · code', host: 'friday-linux', accent: '#65a30d' },
]

export function rosterById(id: string): RosterAgent | undefined {
  return MESH_ROSTER.find(r => r.id === id)
}

/** Map a kanban task snapshot row into the tree's task leaf shape. */
type KanbanRow = {
  id: string
  title: string
  status?: string
  startedAt?: string
  lastHeartbeatAt?: string
  origin?: string
  assignee?: string
  lastFailureError?: string
}
export function taskFromKanban(r: KanbanRow): TelemetryTask {
  const failed =
    r.status === 'blocked' ||
    r.status === 'failed' ||
    !!r.lastFailureError ||
    false
  return {
    id: r.id,
    title: r.title || '(untitled)',
    status: r.status ?? null,
    startedAt: r.startedAt ? Date.parse(r.startedAt) : null,
    lastHeartbeatAt: r.lastHeartbeatAt ? Date.parse(r.lastHeartbeatAt) : null,
    host: r.origin ?? null,
    failed,
  }
}

/** Derive the agent's lifecycle state from its tasks + last-seen age. */
export function deriveState(tasks: TelemetryTask[], lastSeenAt: number | null, now: number): AgentState {
  const running = tasks.find(t => t.status === 'running' || t.status === 'claimed')
  const failed = tasks.find(t => t.failed || t.status === 'blocked' || t.status === 'gave_up')
  const waiting = tasks.find(t => t.status === 'ready' || t.status === 'todo' || t.status === 'assigned')
  if (failed) return 'errored'
  if (running) return 'working'
  if (waiting) return 'waiting'
  // No open task: liveness comes from recency.
  if (!lastSeenAt) return 'offline'
  const age = now - lastSeenAt
  if (age > HEARTBEAT_OFFLINE_MS) return 'offline'
  return 'idle'
}

function applyEventToNode(node: AgentNode, evt: BusEvent, now: number): AgentNode {
  const eventTask = node.tasks.find(t => t.id === evt.task_id)
  let tasks = node.tasks
  if (evt.type === 'task.done' || evt.type === 'task.failed') {
    // Terminal events remove the task from the open set.
    tasks = tasks.filter(t => t.id !== evt.task_id)
    if (evt.type === 'task.failed' && evt.task_id === node.currentTask?.id) {
      node = { ...node, currentTask: null }
    }
  } else if (eventTask) {
    // Progress/heartbeat updates the task leaf in place.
    tasks = tasks.map(t =>
      t.id === evt.task_id
        ? {
            ...t,
            status: evt.status ?? t.status,
            lastHeartbeatAt: evt.last_heartbeat_at ?? evt.ts ?? t.lastHeartbeatAt,
            host: evt.host ?? t.host,
            failed: t.failed || FAILED_KINDS.has(evt.raw_kind),
          }
        : t,
    )
  } else if (evt.type !== 'task.done' && evt.type !== 'task.failed') {
    // A task we haven't seen yet — add as a leaf (progress/heartbeat only).
    tasks = [
      ...tasks,
      {
        id: evt.task_id,
        title: evt.title ?? evt.task_id,
        status: evt.status ?? 'ready',
        startedAt: evt.started_at ?? null,
        lastHeartbeatAt: evt.last_heartbeat_at ?? evt.ts ?? null,
        host: evt.host ?? null,
        failed: FAILED_KINDS.has(evt.raw_kind),
      },
    ]
  }

  const currentTask =
    node.currentTask?.id === evt.task_id && !(evt.type === 'task.done' || evt.type === 'task.failed')
      ? tasks.find(t => t.id === evt.task_id) ?? node.currentTask
      : node.currentTask ?? tasks.find(t => t.status === 'running' || t.status === 'claimed') ?? null

  const events = [evt, ...node.events].slice(0, MAX_EVENTS_PER_AGENT)
  return {
    ...node,
    tasks,
    currentTask,
    events,
    lastSeenAt: Math.max(node.lastSeenAt ?? 0, evt.ts),
    state: deriveState(tasks, Math.max(node.lastSeenAt ?? 0, evt.ts), now),
  }
}

/** Build the initial tree from a kanban snapshot (all agents, real data). */
export function treeFromKanban(rows: KanbanRow[], now: number): AgentNode[] {
  const byAgent = new Map<string, TelemetryTask[]>()
  for (const r of rows) {
    const owner = (r as { assignee?: string }).assignee?.toLowerCase() ?? 'hermes'
    const arr = byAgent.get(owner) ?? []
    arr.push(taskFromKanban(r))
    byAgent.set(owner, arr)
  }
  return MESH_ROSTER.map(roster => {
    const tasks = (byAgent.get(roster.id) ?? []).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
    const currentTask = tasks.find(t => t.status === 'running' || t.status === 'claimed') ?? tasks[0] ?? null
    const lastSeenAt = tasks.reduce<number | null>((acc, t) => {
      const ts = t.lastHeartbeatAt ?? t.startedAt
      if (ts === null) return acc
      return acc === null ? ts : Math.max(acc, ts)
    }, null)
    return {
      id: roster.id,
      name: roster.name,
      role: roster.role,
      host: roster.host,
      model: null,
      accent: roster.accent,
      state: deriveState(tasks, lastSeenAt, now),
      currentTask,
      tasks,
      lastSeenAt,
      events: [],
    }
  })
}

export function useSubAgentTelemetry(): TelemetrySnapshot {
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>({
    generatedAt: Date.now(),
    stream: 'connecting',
    tree: [],
    events: [],
  })
  // Refs keep the SSE/interval callbacks from re-subscribing.
  const treeRef = useRef<AgentNode[]>([])
  const eventsRef = useRef<BusEvent[]>([])
  const lastEventIdRef = useRef<number>(0)
  const streamRef = useRef<StreamStatus>('connecting')

  const commit = useCallback((stream: StreamStatus) => {
    streamRef.current = stream
    const now = Date.now()
    const tree = treeRef.current.map(n => ({
      ...n,
      state: deriveState(n.tasks, n.lastSeenAt, now),
    }))
    setSnapshot({
      generatedAt: now,
      stream,
      tree,
      events: eventsRef.current,
    })
  }, [])

  const applyEvent = useCallback((evt: BusEvent) => {
    lastEventIdRef.current = Math.max(lastEventIdRef.current, evt.id)
    eventsRef.current = [evt, ...eventsRef.current].slice(0, MAX_EVENTS_TOTAL)
    const owner = (evt.to_agent ?? evt.from_agent ?? 'hermes').toLowerCase()
    const now = Date.now()
    treeRef.current = treeRef.current.map(n =>
      n.id === owner ? applyEventToNode(n, evt, now) : n,
    )
    commit(streamRef.current)
  }, [commit])

  useEffect(() => {
    let disposed = false

    // 1) Seed from the kanban snapshot (reconcile target on reconnect).
    fetch('/api/kanban?limit=300', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((j: { tasks?: KanbanRow[] } | null) => {
        if (disposed) return
        if (j?.tasks) {
          const now = Date.now()
          treeRef.current = treeFromKanban(j.tasks, now)
          // Match roster ids by lowercase to catch remote origin names.
          commit('connecting')
        }
      })
      .catch(() => { /* stream will still connect; tree stays roster-only */ })

    // 2) Live SSE stream.
    let es: EventSource | null = null
    const connect = () => {
      if (disposed) return
      commit('connecting')
      const url = lastEventIdRef.current > 0 ? `/api/events?since=${lastEventIdRef.current}` : '/api/events'
      es = new EventSource(url)
      es.addEventListener('message', (e: MessageEvent<string>) => {
        if (disposed) return
        try {
          applyEvent(JSON.parse(e.data) as BusEvent)
        } catch {
          /* malformed frame — ignore, keep stream alive */
        }
      })
      es.onopen = () => { if (!disposed) commit('live') }
      es.onerror = () => {
        // EventSource auto-reconnects; mark the view stale so the UI never
        // presents the last-known state as live.
        if (!disposed) commit('stale')
      }
    }
    connect()

    // 3) Periodic staleness re-derivation (no polling of the server).
    const tick = setInterval(() => {
      if (!disposed) commit(streamRef.current)
    }, STALENESS_TICK_MS)

    return () => {
      disposed = true
      es?.close()
      clearInterval(tick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return snapshot
}
