/**
 * Shared telemetry client for the Team tab — types + live stream hook.
 *
 * Types are DERIVED from the real Hermes event bus contract (hermes-eventbus
 * sidecar, proxied same-origin at /api/events). See the eventbus.py normalize()
 * envelope; this file is the frontend mirror of it and must stay in lockstep.
 * No `any` here — if the bus adds a field, this type gets the field too.
 *
 * Event topics (canonical `type`):
 *   task.created | task.assigned | task.progress | task.done | task.failed |
 *   agent.status | task.<raw kind passthrough>
 */
'use client'

/** Canonical bus event topics. */
export type BusEventType =
  | 'task.created'
  | 'task.assigned'
  | 'task.progress'
  | 'task.done'
  | 'task.failed'
  | 'agent.status'
  | (string & {})

/**
 * A single normalized event from the bus. Mirrors eventbus.normalize():
 *  - host: node that owns the DB (NEW — added for the mesh tree)
 *  - started_at / last_heartbeat_at: task table epochs (NEW — added so the
 *    tree can show elapsed + staleness without a second query)
 */
export type BusEvent = {
  id: number
  type: BusEventType
  raw_kind: string
  task_id: string
  run_id: number | null
  title: string | null
  status: string | null
  from_agent: string | null
  to_agent: string | null
  host: string | null
  started_at: number | null
  last_heartbeat_at: number | null
  payload: Record<string, unknown> | null
  ts: number
}

/** Agent lifecycle state the tree renders. Derivation rules in telemetry.ts. */
export type AgentState = 'working' | 'waiting' | 'errored' | 'idle' | 'offline'

/** A task leaf attached to an agent node. */
export type TelemetryTask = {
  id: string
  title: string
  status: string | null
  startedAt: number | null
  lastHeartbeatAt: number | null
  host: string | null
  /** Errors (blocked/gave_up/crashed/timed_out) land the agent in `errored`. */
  failed: boolean
}

/** Per-agent node in the dispatch tree. */
export type AgentNode = {
  id: string
  name: string
  role: string
  host: string | null
  /** Roster-configured model (from /api/agent-activity where live). */
  model: string | null
  /** Fixed per-agent accent (CATEGORICAL slot), never cycles per render. */
  accent: string
  state: AgentState
  /** Task currently pinned as "the" current task (highest-priority running). */
  currentTask: TelemetryTask | null
  /** All open tasks for this agent (list view / detail panel). */
  tasks: TelemetryTask[]
  lastSeenAt: number | null
  /** Recent events (retention-capped in the hook). */
  events: BusEvent[]
}

/** Connection status for the live stream. */
export type StreamStatus = 'connecting' | 'live' | 'stale' | 'offline'

export type TelemetrySnapshot = {
  generatedAt: number
  stream: StreamStatus
  /** Hermes at root; agents are children; tasks are leaves. */
  tree: AgentNode[]
  /** Raw retained events (capped). */
  events: BusEvent[]
}
